// pm2 definition for the camera uptime checker (kept apart from the root ecosystem file).
//   pm2 start camera-uptime-service/ecosystem.config.js && pm2 save
const path = require("path");

const serviceDir = __dirname;

module.exports = {
  apps: [
    {
      name: "camera-uptime",
      cwd: serviceDir,
      script: "run.py",
      args: "run",
      interpreter: path.join(serviceDir, "venv", "bin", "python"),
      exec_mode: "fork",
      instances: 1,
      watch: false,
      autorestart: true,
      // Let an in-flight check (StartVideo + ffmpeg) finish and the writer flush before SIGKILL.
      kill_timeout: 20000,
      exp_backoff_restart_delay: 2000,
      max_memory_restart: "1G",
      time: true,
      env: {
        PYTHONUNBUFFERED: "1",
      },
    },
  ],
};
