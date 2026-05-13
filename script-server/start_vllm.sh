#!/bin/bash
# vLLM server launcher — runs INSIDE the script-server container.
#
# vLLM is installed system-wide in the Docker image (Dockerfile uses
# `uv pip install --system ...`), so no venv activation is needed here.
#
# HF_HOME points into /app/models — this directory is bind-mounted to the
# host's ./models folder (see docker-compose.worker.yml), so the ~15 GB of
# Qwen2.5-VL weights are downloaded ONCE and persisted across container
# rebuilds and restarts.

set -e

export HF_HOME=/app/models/hf_cache
export VLLM_USE_V1=0

mkdir -p "$HF_HOME"

echo "Starting vLLM server on port 8001..."
echo "Model: Qwen/Qwen2.5-VL-7B-Instruct"
echo "First run downloads ~15GB into $HF_HOME (subsequent runs reuse the cache)."

exec vllm serve Qwen/Qwen2.5-VL-7B-Instruct \
    --port 8001 \
    --host 0.0.0.0 \
    --max-model-len 2048 \
    --gpu-memory-utilization 0.25 \
    --max-num-seqs 12 \
    --dtype bfloat16
