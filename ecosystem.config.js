const path = require("path");

const rootDir = __dirname;
const backendDir = path.join(rootDir, "cctv_backend");
const scriptServerDir = path.join(rootDir, "script-server");

module.exports = {
  apps: [
    {
      name: "cctv-backend-node",
      cwd: backendDir,
      script: "src/server.js",
      interpreter: "node",
      watch: false,
      env_file: path.join(backendDir, ".env"),
      env: {
        NODE_ENV: "development"
      },
      env_production: {
        NODE_ENV: "production"
      }
    },
    {
      name: "cctv-backend-fastapi",
      cwd: scriptServerDir,
      script: "run.py",
      interpreter: path.join(scriptServerDir, "venv", "bin", "python"),
      watch: false,
      env_file: path.join(scriptServerDir, ".env"),
      env: {
        PYTHONPATH: scriptServerDir,
        UVICORN_RELOAD: "false",
        HTTP_PORT: "8000"
      },
      env_production: {
        PYTHONPATH: scriptServerDir,
        UVICORN_RELOAD: "false",
        HTTP_PORT: "8000"
      }
    }
  ]
};