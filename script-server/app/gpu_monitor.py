"""
GPU Monitor Module
==================
GPU monitoring functionality integrated into main FastAPI server.
No separate port needed - all endpoints available on main HTTP_PORT.

Returns:
- GPU utilization (%)
- Memory usage
- Running processes (detection scripts)
- Camera counts per process
"""

import os
import re
import subprocess
import psutil
from pathlib import Path
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


def get_gpu_stats():
    """Get GPU utilization and memory using nvidia-smi"""
    try:
        result = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu",
                "--format=csv,noheader,nounits"
            ],
            capture_output=True,
            text=True,
            timeout=5
        )
        
        if result.returncode != 0:
            return []
        
        gpus = []
        for line in result.stdout.strip().split('\n'):
            if not line.strip():
                continue
            
            parts = [p.strip() for p in line.split(',')]
            if len(parts) >= 6:
                gpus.append({
                    "gpu_id": int(parts[0]),
                    "name": parts[1],
                    "utilization": int(parts[2]),
                    "memory_used": int(parts[3]),
                    "memory_total": int(parts[4]),
                    "temperature": int(parts[5]),
                })
        
        return gpus
    
    except Exception as e:
        logger.error(f"Error getting GPU stats: {e}")
        return []


def get_gpu_processes():
    """Get processes running on each GPU using nvidia-smi"""
    try:
        result = subprocess.run(
            [
                "nvidia-smi",
                "--query-compute-apps=gpu_bus_id,pid,process_name,used_memory",
                "--format=csv,noheader"
            ],
            capture_output=True,
            text=True,
            timeout=5
        )
        
        if result.returncode != 0:
            return {}
        
        # Map GPU bus ID to GPU index
        bus_to_index = {}
        bus_result = subprocess.run(
            ["nvidia-smi", "--query-gpu=index,gpu_bus_id", "--format=csv,noheader"],
            capture_output=True,
            text=True,
            timeout=5
        )
        
        for line in bus_result.stdout.strip().split('\n'):
            if not line.strip():
                continue
            parts = [p.strip() for p in line.split(',')]
            if len(parts) >= 2:
                bus_to_index[parts[1]] = int(parts[0])
        
        # Parse processes
        gpu_processes = {}
        for line in result.stdout.strip().split('\n'):
            if not line.strip():
                continue
            
            parts = [p.strip() for p in line.split(',')]
            if len(parts) >= 4:
                bus_id = parts[0]
                gpu_id = bus_to_index.get(bus_id, 0)
                pid = int(parts[1])
                process_name = parts[2]
                memory_mb = int(parts[3].split()[0]) if parts[3] else 0
                
                if gpu_id not in gpu_processes:
                    gpu_processes[gpu_id] = []
                
                # Get process details
                try:
                    proc = psutil.Process(pid)
                    cmdline = ' '.join(proc.cmdline())
                    
                    # Extract script name and type
                    script_type = "unknown"
                    script_name = process_name
                    
                    if "master_pipeline" in cmdline:
                        script_type = "master"
                        script_name = "Master Pipeline"
                    elif "worker" in cmdline:
                        # Extract worker type
                        if "server_room_worker" in cmdline:
                            script_type = "server_room"
                            script_name = "Server Room Worker"
                        elif "crowd_worker" in cmdline:
                            script_type = "crowd"
                            script_name = "Crowd Detection Worker"
                        elif "proximity_worker" in cmdline:
                            script_type = "proximity"
                            script_name = "Proximity Worker"
                        else:
                            script_type = "worker"
                            script_name = "Detection Worker"
                    elif "vision_classification" in cmdline:
                        script_type = "classification"
                        script_name = "Vision Classification"
                    
                    gpu_processes[gpu_id].append({
                        "pid": pid,
                        "name": script_name,
                        "type": script_type,
                        "memory_mb": memory_mb,
                        "cmdline": cmdline[:200],  # Truncate long commands
                    })
                
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    gpu_processes[gpu_id].append({
                        "pid": pid,
                        "name": process_name,
                        "type": "unknown",
                        "memory_mb": memory_mb,
                        "cmdline": "",
                    })
        
        return gpu_processes
    
    except Exception as e:
        logger.error(f"Error getting GPU processes: {e}")
        return {}


def get_camera_counts():
    """
    Get camera counts for running detection processes.
    Reads from a shared state file created by detection scripts.
    """
    camera_counts = {}
    
    # Path to shared state file (created by detection scripts)
    state_file = Path("/tmp/detection_camera_counts.json")
    
    try:
        if state_file.exists():
            import json
            with open(state_file, 'r') as f:
                camera_counts = json.load(f)
            return camera_counts
    except Exception as e:
        logger.debug(f"Error reading camera counts from state file: {e}")
    
    # Fallback: Try to get from process info
    try:
        for proc in psutil.process_iter(['pid', 'name', 'cmdline', 'environ']):
            try:
                cmdline = ' '.join(proc.info['cmdline'] or [])
                
                # Check if it's a detection process
                if any(keyword in cmdline for keyword in ['master_pipeline', 'worker', 'detection']):
                    pid = proc.info['pid']
                    
                    # Try to get camera count from environment variable
                    env = proc.info.get('environ', {})
                    if env and 'CAMERA_COUNT' in env:
                        camera_counts[pid] = int(env['CAMERA_COUNT'])
            
            except (psutil.NoSuchProcess, psutil.AccessDenied, KeyError):
                continue
    except Exception as e:
        logger.debug(f"Error getting camera counts from processes: {e}")
    
    return camera_counts


def get_local_gpu_stats_data():
    """
    Get GPU statistics for the local server.
    Returns dict with GPU stats, processes, and camera counts.
    """
    from app.config import WORKER_ID, WORKER_NAME
    
    gpus = get_gpu_stats()
    gpu_processes = get_gpu_processes()
    camera_counts = get_camera_counts()
    
    # Enrich processes with camera counts
    for gpu_id, processes in gpu_processes.items():
        for proc in processes:
            proc["camera_count"] = camera_counts.get(proc["pid"], 0)
    
    return {
        "success": True,
        "server_id": WORKER_ID,
        "server_name": WORKER_NAME,
        "timestamp": datetime.now().isoformat(),
        "gpus": gpus,
        "processes": gpu_processes,
        "total_gpus": len(gpus),
        "total_processes": sum(len(procs) for procs in gpu_processes.values()),
    }
