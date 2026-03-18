import os
import re
import json
import asyncio
import logging
from pathlib import Path
from datetime import datetime

from app.config import SCRIPTS_DIR, MAX_CONCURRENT_SCRIPTS
from app.logger import logger
from app.log_manager import log_manager

# Named script log files: scripts/logs/{ScriptName}_{Exam}_{Shift}_{Date}.log
SCRIPT_LOGS_DIR = Path(SCRIPTS_DIR).resolve() / "logs"
SCRIPT_LOGS_DIR.mkdir(parents=True, exist_ok=True)


def _get_named_log_path(execution: dict) -> Path:
    """
    Build a log file path like:
      scripts/logs/ProximityDetection_JNTU_Morning_20260318.log
    """
    meta        = execution.get("execution_metadata", {})
    script_name = re.sub(r'\s+', '', meta.get("script_name", "Script"))
    exam_name   = re.sub(r'\s+', '', meta.get("exam_name",   "Exam"))
    shift_name  = re.sub(r'\s+', '', meta.get("shift_name",  "Shift"))
    date_str    = datetime.now().strftime("%Y%m%d")
    filename    = f"{script_name}_{exam_name}_{shift_name}_{date_str}.log"
    return SCRIPT_LOGS_DIR / filename


def _compute_timeout(execution: dict) -> float | None:
    """
    Calculate seconds until end_at (ISO datetime from backend),
    falling back to duration_minutes if end_at is absent.
    Returns None if no timeout should be applied.
    """
    end_at_str = execution.get("end_at")
    if end_at_str:
        try:
            # The backend sends e.g. "2026-03-18T17:30:00"
            end_at = datetime.fromisoformat(end_at_str)
            remaining = (end_at - datetime.now()).total_seconds()
            if remaining > 0:
                return remaining
            # Already past end time — run for at least 30 s so it starts
            return 30.0
        except Exception as e:
            logger.warning(f"Could not parse end_at '{end_at_str}': {e}")

    # Fallback: use duration_minutes from the DB default
    duration_minutes = execution.get("duration_minutes")
    if duration_minutes:
        return duration_minutes * 60.0

    return None


class ScriptRunner:
    def __init__(self):
        self.scripts_dir = Path(SCRIPTS_DIR).resolve()
        self.max_concurrent = MAX_CONCURRENT_SCRIPTS
        self.running_count = 0

    async def execute_script(self, execution):
        execution_metadata = execution.get("execution_metadata", {})
        script_code = execution_metadata.get("script_code", "")
        stream_url  = execution.get("stream_url")
        camera_id   = execution.get("camera_id")
        execution_id = str(execution.get("id"))

        valid_codes = ["server", "crowd", "intruder", "entry_exit", "proximity", "phone", "invigilator"]
        if script_code not in valid_codes:
            raise ValueError(f"Unknown script code: {script_code}")

        full_script_path = self.scripts_dir / "detection/pipeline/master_pipeline.py"
        if not full_script_path.exists():
            raise FileNotFoundError(f"Script not found: {full_script_path}")

        # ──── Named log file ─────────────────────────────────────────────────────
        log_path = _get_named_log_path(execution)
        meta      = execution_metadata
        header = (
            f"\n{'='*70}\n"
            f"  Script   : {meta.get('script_name', script_code)}\n"
            f"  Exam     : {meta.get('exam_name', 'N/A')}\n"
            f"  Shift    : {meta.get('shift_name', 'N/A')}\n"
            f"  Started  : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
        )
        end_at_str = execution.get("end_at")
        if end_at_str:
            header += f"  Stop at  : {end_at_str}\n"
        header += f"{'='*70}\n"

        # Set up file logger
        file_handler = logging.FileHandler(log_path, encoding="utf-8")
        file_handler.setFormatter(logging.Formatter("[%(asctime)s] %(message)s", "%H:%M:%S"))
        named_log = logging.getLogger(f"exec.{execution_id}")
        named_log.setLevel(logging.DEBUG)
        named_log.addHandler(file_handler)
        named_log.propagate = False

        named_log.info(header)

        timeout_s = _compute_timeout(execution)
        if timeout_s:
            named_log.info(f"  Timeout  : {timeout_s:.0f}s ({timeout_s/60:.1f} min)")
        named_log.info("  Pipeline : detection/pipeline/master_pipeline.py")
        named_log.info(f"  Analytics: {script_code}\n")

        logger.info(
            f"Executing pipeline script: {full_script_path} "
            f"for execution {execution_id} with analytics={script_code}"
        )
        logger.info(f"Named log → {log_path}")
        if timeout_s:
            logger.info(
                f"Script will run until "
                f"{end_at_str or f'{timeout_s/60:.1f}min'}"
            )

        log_manager.write_log(execution_id, f"Starting: {full_script_path}", "INFO")

        args = self.build_script_arguments(execution)

        ext = full_script_path.suffix
        command = "python3"
        if ext == ".sh":  command = "bash"
        elif ext == ".js": command = "node"

        env = os.environ.copy()
        env["CAMERA_ID"]    = str(camera_id)    if camera_id    else ""
        env["STREAM_URL"]   = str(stream_url)   if stream_url   else ""
        env["EXECUTION_ID"] = execution_id

        process = await asyncio.create_subprocess_exec(
            command, str(full_script_path), *args,
            cwd=str(self.scripts_dir),
            env=env,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )

        async def read_stream(stream, is_stderr=False):
            """Read output line by line, writing to both named log and log_manager."""
            data_chunks = []
            while True:
                line = await stream.readline()
                if not line:
                    break
                text = line.decode("utf-8", errors="replace").rstrip()
                data_chunks.append(text)
                if text:
                    named_log.info(f"{'STDERR' if is_stderr else 'STDOUT'} | {text}")
                    if is_stderr:
                        logger.warning(f"Script {execution_id} stderr: {text}")
                        log_manager.write_log(execution_id, text, "ERROR")
                    else:
                        logger.debug(f"Script {execution_id} stdout: {text}")
                        log_manager.write_log(execution_id, text, "INFO")
            return "\n".join(data_chunks)

        stdout_result = stderr_result = ""
        try:
            if timeout_s:
                res = await asyncio.wait_for(
                    asyncio.gather(
                        read_stream(process.stdout, False),
                        read_stream(process.stderr, True)
                    ),
                    timeout=timeout_s
                )
                stdout_result, stderr_result = res
                try:
                    await asyncio.wait_for(process.wait(), timeout=5.0)
                except asyncio.TimeoutError:
                    pass
            else:
                res = await asyncio.gather(
                    read_stream(process.stdout, False),
                    read_stream(process.stderr, True)
                )
                stdout_result, stderr_result = res
                await process.wait()

        except asyncio.TimeoutError:
            try:
                process.terminate()
            except ProcessLookupError:
                pass
            msg = (
                f"Script ran until end_at {end_at_str} — marking COMPLETED"
                if end_at_str else
                f"Script ran for {timeout_s/60:.1f}min — marking COMPLETED"
            )
            logger.info(f"⏹ Assignment {execution_id}: {msg}")
            named_log.info(f"\n{'='*70}\n  {msg}\n  Stopped at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n{'='*70}\n")
            file_handler.close()
            named_log.removeHandler(file_handler)
            raise Exception("__TIMEOUT_COMPLETED__")

        finally:
            # Close the file handler in all normal-exit paths too
            try:
                file_handler.close()
                named_log.removeHandler(file_handler)
            except Exception:
                pass

        if process.returncode == 0:
            logger.info(f"Script {execution_id} completed successfully")
            named_log.info(f"\n{'='*70}\n  COMPLETED (exit code 0)\n  Finished at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n{'='*70}\n")
            log_manager.write_log(execution_id, f"Script completed (exit code 0)", "INFO")
            out_str = str(stdout_result).strip() if stdout_result else ""
            try:
                result = json.loads(out_str)
            except Exception:
                result = {"output": out_str}
            return result
        else:
            logger.error(f"Script {execution_id} exited with code {process.returncode}")
            named_log.error(f"\n{'='*70}\n  FAILED (exit code {process.returncode})\n{'='*70}\n")
            log_manager.write_log(execution_id, f"Script FAILED (exit code {process.returncode})", "ERROR")
            raise Exception(f"Script exited with code {process.returncode}: {stderr_result}")

    def build_script_arguments(self, execution):
        args = []
        execution_metadata = execution.get("execution_metadata", {})
        script_code = execution_metadata.get("script_code", "")
        if script_code:
            args.extend(["--analytics", script_code])
        return args


script_runner = ScriptRunner()
