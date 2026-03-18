"""
Lightweight helpers to make TCS detectors more GPU-efficient without altering
existing detection logic. Provides:
- Configurable max concurrency (via env) to avoid per-camera threads overwhelming GPU.
- Configurable frame sampling intervals (via env) to reduce per-camera load.
- Safe context manager for acquiring camera slots.
Defaults preserve legacy behavior when env vars are unset.
"""

import os
import time
import threading
from contextlib import contextmanager, nullcontext
from queue import Queue, Empty

# Cache semaphores per slot name so multiple threads share the same limiter
_semaphores = {}


def _coerce_positive_int(value):
    try:
        parsed = int(str(value).strip())
        return parsed if parsed > 0 else None
    except Exception:
        return None


def _coerce_bool(value):
    if value is None:
        return False
    s = str(value).strip().lower()
    return s in {"1", "true", "yes", "on"}


def _coerce_positive_float(value):
    try:
        parsed = float(str(value).strip())
        return parsed if parsed > 0 else None
    except Exception:
        return None


def get_max_concurrency(env_var="TCS_MAX_CONCURRENCY", default=None):
    """Read max concurrent camera threads from env; None means unlimited."""
    return _coerce_positive_int(os.getenv(env_var, "")) or default


def get_sample_every(env_var, default):
    """Read frame sampling interval from env; fallback to provided default."""
    return _coerce_positive_int(os.getenv(env_var, "")) or default


def get_max_frames_per_run(env_var, default):
    return _coerce_positive_int(os.getenv(env_var, "")) or default


def get_bool(env_var, default=False):
    env_val = os.getenv(env_var, None)
    return _coerce_bool(env_val) if env_val is not None else default


def get_positive_float(env_var, default=None):
    return _coerce_positive_float(os.getenv(env_var, "")) or default


@contextmanager
def camera_slot(slot_name="default", max_concurrency=None):
    """
    Limit concurrent camera processing. If max_concurrency is None/<=0, acts as no-op.
    """
    if max_concurrency and max_concurrency > 0:
        sem = _semaphores.get(slot_name)
        if sem is None:
            sem = threading.Semaphore(max_concurrency)
            _semaphores[slot_name] = sem
        sem.acquire()
        try:
            yield
        finally:
            sem.release()
    else:
        # No limit configured
        with nullcontext():
            yield


def frame_should_process(frame_count, sample_every):
    """Return True when a frame should be processed given a sampling interval."""
    return sample_every > 0 and (frame_count % sample_every == 0)


class CameraWorkerPool:
    """Simple round-robin worker pool for camera jobs.

    Jobs are callables that return True to requeue themselves (round-robin) or
    False/None to drop.
    """

    def __init__(self, worker_count=4, cooldown_sec=0.5, max_queue=0):
        self.worker_count = max(1, worker_count)
        self.cooldown_sec = cooldown_sec if cooldown_sec is not None else 0.0
        self.queue = Queue(max_queue)
        self.stop_event = threading.Event()
        self.threads = []

    def start(self):
        for _ in range(self.worker_count):
            t = threading.Thread(target=self._worker_loop, daemon=True)
            t.start()
            self.threads.append(t)

    def submit(self, fn, *args, **kwargs):
        self.queue.put((fn, args, kwargs))

    def _worker_loop(self):
        while not self.stop_event.is_set():
            try:
                job = self.queue.get(timeout=0.5)
            except Empty:
                continue

            if job is None:
                self.queue.task_done()
                break

            fn, args, kwargs = job
            try:
                should_requeue = fn(*args, **kwargs)
            except Exception:
                should_requeue = False
            finally:
                self.queue.task_done()

            if self.stop_event.is_set():
                continue

            if should_requeue:
                if self.cooldown_sec:
                    time.sleep(self.cooldown_sec)
                self.queue.put(job)

    def stop(self):
        self.stop_event.set()
        # push sentinels
        for _ in self.threads:
            self.queue.put(None)
        for t in self.threads:
            t.join(timeout=2)

    def wait_forever(self):
        try:
            while not self.stop_event.is_set():
                time.sleep(0.5)
        except KeyboardInterrupt:
            self.stop()
