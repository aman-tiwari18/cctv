"""
Prepare training datasets from detection results
Converts detection images to YOLO training format with auto-labeling
"""

import os
import shutil
import cv2
import json
from pathlib import Path
from ultralytics import YOLO
from tqdm import tqdm
import random

# Configuration
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
RESULTS_DIR = os.path.join(PROJECT_ROOT, "results")
TRAINING_ROOT = os.path.join(PROJECT_ROOT, "training_datasets")

# Detection types with their source folders
DETECTION_CONFIGS = {
    'proximity': {
        'source': 'proximity_detection_results',
        'images': 32364,
        'class_id': 0,  # person class
        'train_split': 0.85,
        'val_split': 0.15,
    },
    'entry_exit': {
        'source': 'entry_exit_detection_results',
        'images': 14510,
        'class_id': 0,
        'train_split': 0.85,
        'val_split': 0.15,
    },
    'tcs': {
        'source': 'tcs_detections',
        'images': 13882,
        'class_id': 0,
        'train_split': 0.85,
        'val_split': 0.15,
    },
    'invigilator': {
        'source': 'invigilator_detection_results',
        'images': 3852,
        'class_id': 0,
        'train_split': 0.80,
        'val_split': 0.20,
    },
    'combined_small': {
        'sources': [
            'server_room_detection_results',
            'intruder_detection_results',
            'phone_detection_results',
            'crowd_detection_results'
        ],
        'images': 10039,
        'class_id': 0,
        'train_split': 0.80,
        'val_split': 0.20,
    }
}

def auto_label_images(image_paths, model_path, output_label_dir):
    """
    Auto-label images using existing YOLO model
    """
    model = YOLO(model_path)
    print(f"  Loading model: {model_path}")
    
    for img_path in tqdm(image_paths, desc="  Auto-labeling"):
        try:
            # Run inference
            results = model(img_path, verbose=False)[0]
            
            # Get image dimensions
            img = cv2.imread(img_path)
            h, w = img.shape[:2]
            
            # Create label file
            label_path = os.path.join(
                output_label_dir,
                Path(img_path).stem + '.txt'
            )
            
            # Write YOLO format labels
            with open(label_path, 'w') as f:
                for box in results.boxes:
                    cls = int(box.cls[0])
                    # Only keep person class (0)
                    if cls == 0:
                        # Convert to YOLO format (normalized xywh)
                        x_center, y_center, width, height = box.xywhn[0].tolist()
                        f.write(f"{cls} {x_center:.6f} {y_center:.6f} {width:.6f} {height:.6f}\n")
        except Exception as e:
            print(f"  ⚠️  Error labeling {img_path}: {e}")
            continue

def prepare_dataset(detection_type, config):
    """
    Prepare training dataset for a specific detection type
    """
    print(f"\n{'='*80}")
    print(f"📦 Preparing {detection_type.upper()} Dataset")
    print(f"{'='*80}")
    
    # Create directory structure
    dataset_dir = os.path.join(TRAINING_ROOT, detection_type)
    train_img_dir = os.path.join(dataset_dir, 'train', 'images')
    train_lbl_dir = os.path.join(dataset_dir, 'train', 'labels')
    val_img_dir = os.path.join(dataset_dir, 'val', 'images')
    val_lbl_dir = os.path.join(dataset_dir, 'val', 'labels')
    
    for d in [train_img_dir, train_lbl_dir, val_img_dir, val_lbl_dir]:
        os.makedirs(d, exist_ok=True)
    
    # Collect images
    all_images = []
    if 'source' in config:
        source_dir = os.path.join(RESULTS_DIR, config['source'])
        if os.path.exists(source_dir):
            all_images = list(Path(source_dir).rglob('*.jpg'))
    elif 'sources' in config:
        for source in config['sources']:
            source_dir = os.path.join(RESULTS_DIR, source)
            if os.path.exists(source_dir):
                all_images.extend(list(Path(source_dir).rglob('*.jpg')))
    
    print(f"  Found {len(all_images)} images")
    
    # Exclude false positives
    false_positive_dir = os.path.join(RESULTS_DIR, 'client_selected_results', 'false_positives')
    if os.path.exists(false_positive_dir):
        false_positives = set(Path(false_positive_dir).rglob('*.jpg'))
        all_images = [img for img in all_images if img not in false_positives]
        print(f"  After excluding false positives: {len(all_images)} images")
    
    # Shuffle and split
    random.shuffle(all_images)
    train_size = int(len(all_images) * config['train_split'])
    train_images = all_images[:train_size]
    val_images = all_images[train_size:]
    
    print(f"  Train set: {len(train_images)} images")
    print(f"  Val set: {len(val_images)} images")
    
    # Copy images
    print("\n  Copying training images...")
    for img in tqdm(train_images):
        shutil.copy2(img, train_img_dir)
    
    print("  Copying validation images...")
    for img in tqdm(val_images):
        shutil.copy2(img, val_img_dir)
    
    # Auto-label using pre-trained model
    print("\n  Auto-labeling training set...")
    model_path = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")
    train_img_paths = [os.path.join(train_img_dir, Path(img).name) for img in train_images]
    auto_label_images(train_img_paths, model_path, train_lbl_dir)
    
    print("  Auto-labeling validation set...")
    val_img_paths = [os.path.join(val_img_dir, Path(img).name) for img in val_images]
    auto_label_images(val_img_paths, model_path, val_lbl_dir)
    
    # Create dataset.yaml
    yaml_content = f"""# {detection_type.upper()} Detection Dataset
path: {dataset_dir}
train: train/images
val: val/images

# Classes
nc: 1
names: ['person']

# Dataset info
total_images: {len(all_images)}
train_images: {len(train_images)}
val_images: {len(val_images)}
"""
    
    yaml_path = os.path.join(dataset_dir, 'dataset.yaml')
    with open(yaml_path, 'w') as f:
        f.write(yaml_content)
    
    print(f"\n  ✅ Dataset prepared successfully!")
    print(f"  📁 Location: {dataset_dir}")
    print(f"  📄 Config: {yaml_path}")
    
    return {
        'dataset_dir': dataset_dir,
        'yaml_path': yaml_path,
        'train_images': len(train_images),
        'val_images': len(val_images),
        'total_images': len(all_images)
    }

def main():
    print("="*80)
    print("🎯 CCTV Analytics - Training Dataset Preparation")
    print("="*80)
    print(f"Results directory: {RESULTS_DIR}")
    print(f"Output directory: {TRAINING_ROOT}")
    print("="*80)
    
    # Ask user which datasets to prepare
    print("\nAvailable detection types:")
    for i, (key, config) in enumerate(DETECTION_CONFIGS.items(), 1):
        images = config.get('images', 0)
        print(f"  {i}. {key.upper():<20} - ~{images:,} images")
    
    print("\nOptions:")
    print("  'all'  - Prepare all datasets")
    print("  '1,2'  - Prepare specific datasets (comma-separated)")
    print("  'q'    - Quit")
    
    choice = input("\nYour choice: ").strip().lower()
    
    if choice == 'q':
        print("Cancelled.")
        return
    
    datasets_to_prepare = []
    if choice == 'all':
        datasets_to_prepare = list(DETECTION_CONFIGS.keys())
    else:
        try:
            indices = [int(i.strip()) - 1 for i in choice.split(',')]
            keys = list(DETECTION_CONFIGS.keys())
            datasets_to_prepare = [keys[i] for i in indices if 0 <= i < len(keys)]
        except:
            print("Invalid input. Exiting.")
            return
    
    # Prepare datasets
    results = {}
    for detection_type in datasets_to_prepare:
        config = DETECTION_CONFIGS[detection_type]
        result = prepare_dataset(detection_type, config)
        results[detection_type] = result
    
    # Summary
    print(f"\n{'='*80}")
    print("📊 PREPARATION SUMMARY")
    print(f"{'='*80}")
    for detection_type, result in results.items():
        print(f"\n{detection_type.upper()}:")
        print(f"  Dataset: {result['yaml_path']}")
        print(f"  Train:   {result['train_images']:,} images")
        print(f"  Val:     {result['val_images']:,} images")
        print(f"  Total:   {result['total_images']:,} images")
    
    print(f"\n{'='*80}")
    print("✅ All datasets prepared!")
    print("\nNext steps:")
    print("  1. Review auto-generated labels (optional)")
    print("  2. Run training script: python scripts/utilities/train_proximity_model.py")
    print(f"{'='*80}\n")

if __name__ == "__main__":
    main()
