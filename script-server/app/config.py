import os
from dotenv import load_dotenv

load_dotenv()

MAIN_BACKEND_URL = os.getenv("MAIN_BACKEND_URL", "http://localhost:3000/api")
API_KEY = os.getenv("API_KEY", "cctv-monitoring-secret-key-2024")
POLL_INTERVAL_MS = int(os.getenv("POLL_INTERVAL_MS", 30000))
LOOKAHEAD_MINUTES = int(os.getenv("LOOKAHEAD_MINUTES", 3))
GRACE_MINUTES = int(os.getenv("GRACE_MINUTES", 30))
HTTP_PORT = int(os.getenv("HTTP_PORT", 5000))
SCRIPTS_DIR = os.getenv("SCRIPTS_DIR", "./scripts")
LOGS_DIR = os.getenv("LOGS_DIR", "./logs/executions")
MAX_CONCURRENT_SCRIPTS = int(os.getenv("MAX_CONCURRENT_SCRIPTS", 5))
