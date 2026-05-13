# Script Server Dockerfile - Optimized for H200 GPU
FROM nvidia/cuda:12.2.2-cudnn8-runtime-ubuntu22.04

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Set timezone BEFORE installing packages (prevents tzdata prompt)
ENV TZ=Asia/Kolkata
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# Install Python 3.10 and system dependencies
RUN apt-get update && apt-get install -y \
    python3.10 \
    python3-pip \
    python3.10-dev \
    ffmpeg \
    tesseract-ocr \
    tesseract-ocr-eng \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    libglib2.0-0 \
    libgl1-mesa-glx \
    mysql-client \
    curl \
    git \
    nfs-common \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

# Set Python 3.10 as default
RUN update-alternatives --install /usr/bin/python python /usr/bin/python3.10 1 && \
    update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.10 1 && \
    update-alternatives --install /usr/bin/pip pip /usr/bin/pip3 1

# Set working directory
WORKDIR /app

# Copy requirements file
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Install vLLM separately to prevent pip backtracking loops
RUN pip install --no-cache-dir uv && uv pip install --system "vllm>=0.20.0" openai huggingface_hub

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p results frames models data logs \
    results/tcs_detections/crowd_detection_threshold \
    results/tcs_detections/zero_person_detection \
    results/tcs_detections/proximity_detection \
    results/tcs_detections/qp_box_missing \
    frames/multi_server

# Patch vLLM for DeepGEMM bug
RUN python3 patch_vllm.py

# Copy and set permissions for entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /app/start_vllm.sh

# Set Python path
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

# Use entrypoint script
ENTRYPOINT ["docker-entrypoint.sh"]

# Start FastAPI server
CMD ["python", "run.py"]
