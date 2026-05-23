#!/bin/bash
export HF_HOME=/data/hf_cache
export VLLM_USE_V1=0
# Give the APIServer extra time to complete multi-modal warmup before
# EngineCore times out waiting for the initial IPC connection.
# Without this, the EngineCore self-shuts-down after ~18s while APIServer
# is still doing 20+ seconds of vision-encoder warmup.
export VLLM_RPC_TIMEOUT=60
mkdir -p /data/hf_cache
source /data/cctv_dev/cctv/script-server/venv/bin/activate

echo "Starting vLLM server on port 8001..."
echo "Model: Qwen/Qwen2.5-VL-7B-Instruct"
echo "This will download ~15GB of weights the first time it runs."

# Kill orphaned vLLM GPU subprocesses left by previous crashed/killed vLLM instances.
# These spawn_main processes hold CUDA contexts and block GPU initialization.
pkill -9 -f "spawn_main.*--multiprocessing-fork" 2>/dev/null || true
sleep 1

exec vllm serve Qwen/Qwen2.5-VL-7B-Instruct \
    --port 8001 \
    --host 0.0.0.0 \
    --max-model-len 2048 \
    --gpu-memory-utilization 0.25 \
    --max-num-seqs 12 \
    --dtype bfloat16
