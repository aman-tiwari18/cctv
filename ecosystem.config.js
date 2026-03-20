module.exports = {
  apps: [
    {
      name: "cctv-backend-node",
      script: "server.js",
      cwd: __dirname,
      watch: false,

      env: {
        NODE_ENV: "development"
      },

      env_production: {
        NODE_ENV: "production",
        PORT: 3000,
        DB_HOST: "localhost",
        DB_PORT: 3306,
        DB_USER: "root",
        DB_PASSWORD: "rootpassword123",
        DB_NAME: "cctv_monitoring",
        JWT_SECRET: "dfbb241fe1df02ddc75b29dc4a784ce8",
        SCRIPT_SERVER_API_KEY: "your_script_server_api_key",
        JWT_EXPIRES_IN: "24h"
      }
    },
    {
      name: "cctv-backend-fastapi",
      script: "/data/cctv_dev/cctv/script-server/venv/bin/uvicorn",
      interpreter: "/data/cctv_dev/cctv/script-server/venv/bin/python",
      args: "app.main:app --host 0.0.0.0 --port 8000",
      cwd: "/data/cctv_dev/cctv/script-server",
      watch: false,
      env_production: {
        PYTHONPATH: "/data/cctv_dev/cctv/script-server",
        VIRTUAL_ENV: "/data/cctv_dev/cctv/script-server/venv",

        MAIN_BACKEND_URL: "http://localhost:3000/cctv_analytics/api",
        API_KEY: "your_script_server_api_key",
        POLL_INTERVAL_MS: 30000,
        MAX_CONCURRENT_SCRIPTS: 5,
        LOOKAHEAD_MINUTES: 3,
        GRACE_MINUTES: 30,
        SCRIPTS_DIR: "./scripts",
        LOGS_DIR: "./logs/executions",
        HTTP_PORT: 5000
      }
    }
  ]
};