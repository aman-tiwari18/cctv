import os
import json
import asyncio
from pathlib import Path

from app.config import SCRIPTS_DIR, MAX_CONCURRENT_SCRIPTS
from app.logger import logger
from app.log_manager import log_manager

class ScriptRunner:
    def __init__(self):
        self.scripts_dir = Path(SCRIPTS_DIR)
        self.max_concurrent = MAX_CONCURRENT_SCRIPTS
        self.running_count = 0

    async def execute_script(self, execution):
        script_path = execution.get("script_path", "")
        task_parameters = execution.get("task_parameters")
        stream_url = execution.get("stream_url")
        camera_id = execution.get("camera_id")
        execution_metadata = execution.get("execution_metadata")
        execution_id = str(execution.get("id"))

        full_script_path = self.scripts_dir / script_path

        if not full_script_path.exists():
            raise FileNotFoundError(f"Script not found: {full_script_path}")
        
        logger.info(f"Executing script: {full_script_path} for execution {execution_id}")

        log_manager.write_log(execution_id, f"Starting execution: {full_script_path}", "INFO")
        log_manager.write_log(execution_id, f"Camera ID: {camera_id or 'N/A'}", "INFO")
        log_manager.write_log(execution_id, f"Stream URL: {stream_url or 'N/A'}", "INFO")

        args = self.build_script_arguments(execution)

        ext = full_script_path.suffix
        command = "python3"
        if ext == ".sh":
            command = "bash"
        elif ext == ".js":
            command = "node"

        logger.info(f"Using interpreter: {command} for script: {full_script_path}")

        env = os.environ.copy()
        env["CAMERA_ID"] = str(camera_id) if camera_id else ""
        env["STREAM_URL"] = str(stream_url) if stream_url else ""
        env["EXECUTION_ID"] = execution_id

        process = await asyncio.create_subprocess_exec(
            command, str(full_script_path), *args,
            cwd=str(self.scripts_dir),
            env=env,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )

        duration_minutes = execution.get("duration_minutes")
        timeout_s = duration_minutes * 60 if duration_minutes else None
        
        stdout_data, stderr_data = b'', b''
        
        async def read_stream(stream, is_stderr=False):
            data_chunks = []
            while True:
                line = await stream.readline()
                if not line:
                    break
                
                text = line.decode('utf-8', errors='replace').rstrip()
                data_chunks.append(text)
                if text:
                    if is_stderr:
                        logger.warning(f"Script {execution_id} stderr: {text}")
                        log_manager.write_log(execution_id, text, "ERROR")
                    else:
                        logger.debug(f"Script {execution_id} stdout: {text}")
                        log_manager.write_log(execution_id, text, "INFO")
                        
            return "\n".join(data_chunks)

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
                await asyncio.wait_for(process.wait(), timeout=5.0)
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
            logger.warning(f"Script {execution_id} timeout, killing process")
            raise Exception("Script execution timeout")

        if process.returncode == 0:
            logger.info(f"Script {execution_id} completed successfully")
            log_manager.write_log(execution_id, f"Script completed successfully with exit code {process.returncode}", "INFO")
            
            out_str = str(stdout_result).strip() if stdout_result else ""
            try:
                result = json.loads(out_str)
            except Exception:
                result = {"output": out_str}
            return result
        else:
            logger.error(f"Script {execution_id} exited with code {process.returncode}")
            log_manager.write_log(execution_id, f"Script failed with exit code {process.returncode}", "ERROR")
            raise Exception(f"Script exited with code {process.returncode}: {stderr_result}")

    def build_script_arguments(self, execution):
        args = []
        if execution.get("stream_url"):
            args.extend(["--stream-url", execution["stream_url"]])
        if execution.get("camera_id"):
            args.extend(["--camera-id", str(execution["camera_id"])])
        if execution.get("task_parameters"):
            args.extend(["--params", json.dumps(execution["task_parameters"])])
        if execution.get("execution_metadata"):
            args.extend(["--metadata", json.dumps(execution["execution_metadata"])])
        return args

script_runner = ScriptRunner()
