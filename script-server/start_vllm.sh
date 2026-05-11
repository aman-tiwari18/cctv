#!/bin/bash
export HF_HOME=/data/hf_cache
export VLLM_USE_V1=0
mkdir -p /data/hf_cache
source /data/cctv_dev/cctv/script-server/venv/bin/activate

echo "Starting vLLM server on port 8001..."
echo "Model: Qwen/Qwen2.5-VL-7B-Instruct"
echo "This will download ~15GB of weights the first time it runs."

exec vllm serve Qwen/Qwen2.5-VL-7B-Instruct \
    --port 8001 \
    --host 0.0.0.0 \
    --max-model-len 2048 \
    --gpu-memory-utilization 0.35 \
    --max-num-seqs 12 \
    --dtype bfloat16
