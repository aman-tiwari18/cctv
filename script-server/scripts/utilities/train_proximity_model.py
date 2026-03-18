"""
Fine-tune YOLOv10 for Proximity Detection
Dataset: 32,364 images from proximity_detection_results
GPU: NVIDIA H100 80GB
"""

from ultralytics import YOLO
import torch
import os
from datetime import datetime

# Configuration
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
BASE_MODEL = os.path.join(PROJECT_ROOT, "models/yolov10x.pt")  # Using larger model for best results
DATASET_YAML = os.path.join(PROJECT_ROOT, "training_datasets/proximity/dataset.yaml")
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "models/fine_tuned")

# Training parameters optimized for H100 80GB
PARAMS = {
    'data': DATASET_YAML,
    'epochs': 120,
    'imgsz': 640,
    'batch': 32,                    # Can go up to 48-64 with H100
    'device': 0,                     # GPU 0
    'workers': 8,                    # CPU workers for data loading
    'project': OUTPUT_DIR,
    'name': f'proximity_yolov10x_{datetime.now().strftime("%Y%m%d_%H%M")}',
    
    # Optimization
    'optimizer': 'AdamW',
    'lr0': 0.001,                    # Initial learning rate (lower for fine-tuning)
    'lrf': 0.01,                     # Final learning rate (lr0 * lrf)
    'momentum': 0.937,
    'weight_decay': 0.0005,
    'warmup_epochs': 3.0,
    'warmup_momentum': 0.8,
    'warmup_bias_lr': 0.1,
    
    # Performance
    'pretrained': True,              # Use pre-trained weights
    'patience': 20,                  # Early stopping patience
    'save': True,
    'save_period': 10,               # Save checkpoint every 10 epochs
    'cache': True,                   # Cache images for faster training
    'amp': True,                     # Automatic Mixed Precision (FP16)
    
    # Data augmentation (important for person detection)
    'hsv_h': 0.015,                  # HSV-Hue augmentation
    'hsv_s': 0.7,                    # HSV-Saturation
    'hsv_v': 0.4,                    # HSV-Value
    'degrees': 0.0,                  # Rotation (+/- deg)
    'translate': 0.1,                # Translation (+/- fraction)
    'scale': 0.5,                    # Scale (+/- gain)
    'shear': 0.0,                    # Shear (+/- deg)
    'perspective': 0.0,              # Perspective (+/- fraction)
    'flipud': 0.0,                   # Flip up-down (probability)
    'fliplr': 0.5,                   # Flip left-right (probability)
    'mosaic': 1.0,                   # Mosaic augmentation (probability)
    'mixup': 0.0,                    # Mixup augmentation (probability)
    
    # Validation
    'val': True,
    'plots': True,
    'verbose': True,
}

def main():
    print("=" * 80)
    print("PROXIMITY DETECTION MODEL TRAINING")
    print("=" * 80)
    print(f"Base Model: {BASE_MODEL}")
    print(f"Dataset: {DATASET_YAML}")
    print(f"Output: {OUTPUT_DIR}")
    print(f"GPU: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU'}")
    print(f"GPU Memory: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")
    print("=" * 80)
    
    # Load model
    model = YOLO(BASE_MODEL)
    
    # Train
    print("\n🚀 Starting training...")
    results = model.train(**PARAMS)
    
    # Validate
    print("\n📊 Validating model...")
    metrics = model.val()
    
    # Export best model
    best_model_path = os.path.join(OUTPUT_DIR, PARAMS['name'], 'weights', 'best.pt')
    print(f"\n✅ Training complete!")
    print(f"📁 Best model: {best_model_path}")
    print(f"📈 mAP50: {metrics.box.map50:.4f}")
    print(f"📈 mAP50-95: {metrics.box.map:.4f}")
    
    # Test inference speed
    print("\n⚡ Testing inference speed...")
    test_img = os.path.join(PROJECT_ROOT, "results/proximity_detection_results")
    test_results = model.predict(test_img, imgsz=640, conf=0.25, verbose=False)
    print(f"✅ Inference speed: {1000/test_results[0].speed['inference']:.1f} FPS")

if __name__ == "__main__":
    main()
