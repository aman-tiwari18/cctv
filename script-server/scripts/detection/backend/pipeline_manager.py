# # backend/pipeline_manager.py

#working to start all and end all

# import subprocess
# import sys
# import os
# import signal

# PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
# PIPELINE_SCRIPT = os.path.join(PROJECT_ROOT, "pipeline", "master_pipeline.py")

# running_process = None

# def start_pipeline():
#     global running_process

#     if running_process and running_process.poll() is None:
#         return False, "Pipeline already running"

#     running_process = subprocess.Popen(
#         [sys.executable, PIPELINE_SCRIPT],
#         cwd=PROJECT_ROOT
#     )
#     return True, "Pipeline started"

# def stop_pipeline():
#     global running_process

#     if not running_process or running_process.poll() is not None:
#         return False, "Pipeline not running"

#     running_process.terminate()
#     running_process.wait(timeout=10)
#     running_process = None
#     return True, "Pipeline stopped"

# def pipeline_status():
#     if running_process and running_process.poll() is None:
#         return "RUNNING"
#     return "STOPPED"














#seelcted start working properly but stop is not woprking

# import subprocess
# import sys
# import os

# PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
# PIPELINE = os.path.join(PROJECT_ROOT, "pipeline", "master_pipeline.py")

# process = None
# running_analytics = []

# def start_pipeline(analytics):
#     global process, running_analytics

#     if process and process.poll() is None:
#         return False, "Pipeline already running"

#     cmd = [sys.executable, PIPELINE, "--analytics", *analytics]
#     process = subprocess.Popen(cmd, cwd=PROJECT_ROOT)
#     running_analytics = analytics

#     return True, f"Started: {analytics}"

# def stop_pipeline():
#     global process, running_analytics

#     if not process or process.poll() is not None:
#         return False, "Pipeline not running"

#     process.terminate()
#     process.wait(timeout=10)
#     process = None
#     running_analytics = []

#     return True, "Pipeline stopped"

# def pipeline_status():
#     if process and process.poll() is None:
#         return True, running_analytics
#     return False, []














#all start / all stop wali functionality added nhi he but selected start and stop is working properly(lag)
# import subprocess
# import sys
# import os
# import signal

# PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
# PIPELINE = os.path.join(PROJECT_ROOT, "pipeline", "master_pipeline.py")

# processes = {}          # analytics -> Popen
# stopped_analytics = set()



# def cleanup_old_pipelines():
#     try:
#         subprocess.call(["pkill", "-9", "-f", "pipeline/master_pipeline.py"])
#         print("🧹 Old analytics pipelines cleaned")
#     except Exception as e:
#         print("Cleanup error:", e)

# def start_analytics(analytics):
#     started = []
#     for name in analytics:
#         if name in processes and processes[name].poll() is None:
#             continue

#         cmd = [sys.executable, PIPELINE, "--analytics", name]
#         p = subprocess.Popen(
#             cmd,
#             cwd=PROJECT_ROOT,
#             preexec_fn=os.setsid
#         )

#         processes[name] = p
#         stopped_analytics.discard(name)
#         started.append(name)

#     return started

# def stop_analytics(analytics):
#     stopped = []
#     for name in analytics:
#         p = processes.get(name)
#         if p and p.poll() is None:
#             try:
#                 os.killpg(os.getpgid(p.pid), signal.SIGTERM)
#             except Exception:
#                 pass

#             stopped.append(name)
#             stopped_analytics.add(name)
#             del processes[name]

#     return stopped

# def status_analytics():
#     running = []
#     stopped = list(stopped_analytics)

#     for name, p in list(processes.items()):
#         if p.poll() is None:
#             running.append(name)
#         else:
#             stopped.append(name)
#             stopped_analytics.add(name)
#             del processes[name]

#     return running, stopped















#working properly as of 2026-02-20

import subprocess
import sys
import os
import signal

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PIPELINE = os.path.join(PROJECT_ROOT, "pipeline", "master_pipeline.py")

processes = {}          # analytics -> Popen
stopped_analytics = set()

ALL_ANALYTICS = [
    "server",
    "crowd",
    "intruder",
    "entry_exit",
    "proximity",
    "phone",
    "invigilator",
]

def start_all():
    return start_analytics(ALL_ANALYTICS)

def stop_all():
    return stop_analytics(list(processes.keys()))


def cleanup_old_pipelines():
    try:
        subprocess.call(["pkill", "-9", "-f", "pipeline/master_pipeline.py"])
        print("🧹 Old analytics pipelines cleaned")
    except Exception as e:
        print("Cleanup error:", e)

def start_analytics(analytics):
    started = []
    for name in analytics:
        if name in processes and processes[name].poll() is None:
            continue

        cmd = [sys.executable, PIPELINE, "--analytics", name]
        p = subprocess.Popen(
            cmd,
            cwd=PROJECT_ROOT,
            preexec_fn=os.setsid
        )

        processes[name] = p
        stopped_analytics.discard(name)
        started.append(name)

    return started

def stop_analytics(analytics):
    stopped = []
    for name in analytics:
        p = processes.get(name)
        if p and p.poll() is None:
            try:
                os.killpg(os.getpgid(p.pid), signal.SIGTERM)
            except Exception:
                pass

            stopped.append(name)
            stopped_analytics.add(name)
            del processes[name]

    return stopped

def status_analytics():
    running = []
    stopped = list(stopped_analytics)

    for name, p in list(processes.items()):
        if p.poll() is None:
            running.append(name)
        else:
            stopped.append(name)
            stopped_analytics.add(name)
            del processes[name]

    return running, stopped


















# #test
# import subprocess
# import sys
# import os
# import signal

# PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
# PIPELINE     = os.path.join(PROJECT_ROOT, "pipeline", "master_pipeline.py")

# processes         = {}
# stopped_analytics = set()

# ALL_ANALYTICS = [
#     "server",
#     "crowd",
#     "intruder",
#     "entry_exit",
#     "proximity",
#     "phone",
#     "invigilator",
#     "vision_classification",  # ✅ NEW — routes through master_pipeline.py
# ]


# def start_all():
#     return start_analytics(ALL_ANALYTICS)


# def stop_all():
#     return stop_analytics(list(processes.keys()))


# def cleanup_old_pipelines():
#     try:
#         subprocess.call(["pkill", "-9", "-f", "pipeline/master_pipeline.py"])
#         print("🧹 Old analytics pipelines cleaned")
#     except Exception as e:
#         print("Cleanup error:", e)


# def start_analytics(analytics):
#     started = []
#     for name in analytics:
#         if name in processes and processes[name].poll() is None:
#             continue

#         cmd = [sys.executable, PIPELINE, "--analytics", name]
#         p   = subprocess.Popen(cmd, cwd=PROJECT_ROOT, preexec_fn=os.setsid)

#         processes[name] = p
#         stopped_analytics.discard(name)
#         started.append(name)

#     return started


# def stop_analytics(analytics):
#     stopped = []
#     for name in analytics:
#         p = processes.get(name)
#         if p and p.poll() is None:
#             try:
#                 os.killpg(os.getpgid(p.pid), signal.SIGTERM)
#             except Exception:
#                 pass
#             stopped.append(name)
#             stopped_analytics.add(name)
#             del processes[name]
#     return stopped


# def status_analytics():
#     running = []
#     stopped = list(stopped_analytics)

#     for name, p in list(processes.items()):
#         if p.poll() is None:
#             running.append(name)
#         else:
#             stopped.append(name)
#             stopped_analytics.add(name)
#             del processes[name]

#     return running, stopped