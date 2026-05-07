import asyncio
import os
import httpx
from datetime import datetime, timezone, timedelta

IST = timezone(timedelta(hours=5, minutes=30))
from app.config import MAIN_BACKEND_URL, API_KEY, POLL_INTERVAL_MS, LOOKAHEAD_MINUTES, GRACE_MINUTES
from app.logger import logger
from app.script_runner import script_runner
from app.camera_distributor import should_process_camera

WORKER_ID = os.environ.get("WORKER_ID", "worker-0")
IS_MAIN_WORKER = WORKER_ID in ("worker-0", "main")

class Poller:
    def __init__(self):
        self.is_running = False
        self.backend_url = MAIN_BACKEND_URL
        self.api_key = API_KEY
        self.poll_interval_s = POLL_INTERVAL_MS / 1000.0
        self.lookahead_mins = LOOKAHEAD_MINUTES
        self.grace_mins = GRACE_MINUTES
        
        self.running_scripts = set()
        self.scheduled_scripts = {}  # id -> Task
        self._poll_task = None

    async def start(self):
        if self.is_running:
            logger.warning("Poller is already running")
            return
            
        logger.info("Starting poller service...")
        self.is_running = True
        
        # Poll immediately then loop
        self._poll_task = asyncio.create_task(self._poll_loop())
        logger.info(f"Poller started | interval: {self.poll_interval_s}s | lookahead: {self.lookahead_mins}min")

    async def stop(self):
        self.is_running = False
        if self._poll_task:
            self._poll_task.cancel()
            self._poll_task = None
            
        for handle in self.scheduled_scripts.values():
            handle.cancel()
            
        self.scheduled_scripts.clear()
        logger.info("Poller stopped")

    async def _poll_loop(self):
        while self.is_running:
            await self.poll()
            await asyncio.sleep(self.poll_interval_s)

    async def poll(self):
        try:
            logger.debug("Polling for upcoming assignments...")
            
            async with httpx.AsyncClient() as client:
                # 1. Fetch PENDING tasks
                pending_response = await client.get(
                    f"{self.backend_url}/executions/pending",
                    headers={"X-API-Key": self.api_key},
                    params={
                        "limit": 50,
                        "lookahead": self.lookahead_mins,
                        "grace": self.grace_mins
                    }
                )
                pending_response.raise_for_status()
                pending_data = pending_response.json().get("data", [])
                
                # 2. Fetch RUNNING tasks (so workers that restart mid-shift can catch up)
                running_data = []
                try:
                    running_response = await client.get(
                        f"{self.backend_url}/executions/running",
                        headers={"X-API-Key": self.api_key},
                        params={"limit": 50}
                    )
                    if running_response.status_code == 200:
                        running_data = running_response.json().get("data", [])
                except Exception as e:
                    logger.debug(f"Could not fetch running assignments: {e}")
                
                # Combine tasks, removing duplicates by ID (using dict for deduplication)
                seen = {}
                for item in (pending_data + running_data):
                    seen[str(item["id"])] = item
                all_data = list(seen.values())
                
                if all_data:
                    logger.info(f"Fetched {len(all_data)} assignment(s) (Pending: {len(pending_data)}, Running: {len(running_data)})")
                    for assignment in all_data:
                        # Filter assignments based on camera distribution
                        if should_process_camera(assignment):
                            self.queue_assignment(assignment)
                        else:
                            logger.debug(f"Assignment {assignment.get('id')} skipped: not assigned to this worker")
                else:
                    logger.debug("No upcoming assignments")
                    
        except Exception as e:
            logger.error(f"Error polling backend: {e}")

    def queue_assignment(self, assignment):
        assignment_id = str(assignment["id"])
        already_running = str(assignment.get("status", "")).upper() == "RUNNING"
        
        # If queued for future but backend says RUNNING now — cancel and run immediately
        if assignment_id in self.scheduled_scripts and already_running:
            logger.info(f"Assignment {assignment_id} is now RUNNING on backend — triggering immediate run")
            self.scheduled_scripts[assignment_id].cancel()
            self.scheduled_scripts.pop(assignment_id, None)
            asyncio.create_task(self.run_assignment(assignment))
            return

        if assignment_id in self.running_scripts or assignment_id in self.scheduled_scripts:
            logger.debug(f"Assignment {assignment_id} already queued/running — skipping")
            return
            
        scheduled_at_str = assignment.get("scheduled_at")
        
        # RUNNING status or missing scheduled_at = run immediately
        if already_running or not scheduled_at_str:
            if not scheduled_at_str and not already_running:
                logger.warning(f"Assignment {assignment_id} has no scheduled_at time — running immediately")
            
            asyncio.create_task(self.run_assignment(assignment))
            return

        try:
            # Handle ISO timestamp parsing — always compare in IST
            if scheduled_at_str.endswith("Z"):
                scheduled_at_str = scheduled_at_str[:-1] + "+00:00"
            scheduled_at = datetime.fromisoformat(scheduled_at_str)
            if scheduled_at.tzinfo is not None:
                scheduled_at = scheduled_at.astimezone(IST)
            else:
                # Treat naive datetime as IST (backend always sends IST)
                scheduled_at = scheduled_at.replace(tzinfo=IST)
            now = datetime.now(IST)
            delay_s = (scheduled_at - now).total_seconds()
        except Exception as e:
            logger.error(f"Failed to parse time for assignment {assignment_id}: {e}")
            return

        if delay_s <= 0:
            logger.info(f"Assignment {assignment_id} is overdue by {abs(round(delay_s))}s — running immediately")
            # Fire and forget
            asyncio.create_task(self.run_assignment(assignment))
        else:
            logger.info(f"Assignment {assignment_id} queued — fires in {round(delay_s)}s")
            task = asyncio.create_task(self._delayed_run(assignment, delay_s))
            self.scheduled_scripts[assignment_id] = task

    async def _delayed_run(self, assignment, delay_s):
        assignment_id = str(assignment["id"])
        try:
            await asyncio.sleep(delay_s)
        except asyncio.CancelledError:
            return
            
        self.scheduled_scripts.pop(assignment_id, None)
        await self.run_assignment(assignment)

    async def run_assignment(self, assignment):
        assignment_id = str(assignment["id"])
        self.running_scripts.add(assignment_id)
        
        try:
            logger.info(f"▶ Running assignment {assignment_id}: {assignment.get('task_name', 'Unknown task')}")
            
            # Only main worker updates global status to RUNNING
            if IS_MAIN_WORKER:
                await self.update_assignment_status(assignment_id, "RUNNING")
            
            result = await script_runner.execute_script(assignment)
            
            # Only main worker updates global status to COMPLETED
            if IS_MAIN_WORKER:
                await self.update_assignment_status(assignment_id, "COMPLETED", {"result_data": result})
            
            logger.info(f"✔ Assignment {assignment_id} completed")
            
        except Exception as e:
            if "__TIMEOUT_COMPLETED__" in str(e):
                logger.info(f"✔ Assignment {assignment_id} timed out after duration — marking COMPLETED")
                if IS_MAIN_WORKER:
                    await self.update_assignment_status(assignment_id, "COMPLETED", {"result_data": {"note": "Script ran for full duration"}})
            else:
                logger.error(f"✘ Assignment {assignment_id} failed: {e}")
                if IS_MAIN_WORKER:
                    await self.update_assignment_status(assignment_id, "FAILED", {"error_log": str(e)})
            
        finally:
            self.running_scripts.discard(assignment_id)

    async def update_assignment_status(self, assignment_id, status, data=None):
        if data is None:
            data = {}
        try:
            payload = {"status": status}
            payload.update(data)
            
            async with httpx.AsyncClient() as client:
                res = await client.put(
                    f"{self.backend_url}/executions/{assignment_id}/status",
                    json=payload,
                    headers={
                        "X-API-Key": self.api_key,
                        "Content-Type": "application/json"
                    }
                )
                res.raise_for_status()
                logger.debug(f"Assignment {assignment_id} → {status}")
        except Exception as e:
            logger.error(f"Failed to update assignment {assignment_id} status: {e}")

    def get_status(self):
        return {
            "isPolling": self.is_running,
            "pollIntervalMs": int(self.poll_interval_s * 1000),
            "lookaheadMins": self.lookahead_mins,
            "graceMins": self.grace_mins,
            "runningCount": len(self.running_scripts),
            "scheduledCount": len(self.scheduled_scripts),
            "runningIds": list(self.running_scripts),
            "scheduledIds": list(self.scheduled_scripts.keys())
        }

poller_service = Poller()
