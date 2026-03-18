#!/usr/bin/env python3
"""
TCS Camera Classification - Environment Test Script

This script checks if all dependencies are properly installed and configured.
Run this before executing the main classification script.
"""

import sys
import os

def check_python_version():
    """Check Python version"""
    print("1. Checking Python version...")
    version = sys.version_info
    if version.major >= 3 and version.minor >= 7:
        print(f"   ✅ Python {version.major}.{version.minor}.{version.micro}")
        return True
    else:
        print(f"   ❌ Python {version.major}.{version.minor}.{version.micro} (need 3.7+)")
        return False

def check_module(module_name, import_name=None):
    """Check if a Python module is installed"""
    if import_name is None:
        import_name = module_name
    
    try:
        __import__(import_name)
        print(f"   ✅ {module_name}")
        return True
    except ImportError:
        print(f"   ❌ {module_name} - Install with: pip install {module_name}")
        return False

def check_python_modules():
    """Check all required Python modules"""
    print("\n2. Checking Python modules...")
    
    modules = [
        ('pandas', 'pandas'),
        ('openpyxl', 'openpyxl'),
        ('requests', 'requests'),
        ('opencv-python', 'cv2'),
        ('pillow', 'PIL'),
        ('tqdm', 'tqdm'),
    ]
    
    all_ok = True
    for module_name, import_name in modules:
        if not check_module(module_name, import_name):
            all_ok = False
    
    return all_ok

def check_ffmpeg():
    """Check if FFmpeg is installed"""
    print("\n3. Checking FFmpeg...")
    import shutil
    
    if shutil.which("ffmpeg"):
        print("   ✅ FFmpeg installed")
        # Try to get version
        try:
            import subprocess
            result = subprocess.run(['ffmpeg', '-version'], 
                                  capture_output=True, text=True, timeout=5)
            version_line = result.stdout.split('\n')[0]
            print(f"      {version_line}")
        except:
            pass
        return True
    else:
        print("   ❌ FFmpeg not found")
        print("      Install: sudo apt install ffmpeg (Ubuntu)")
        print("      Install: brew install ffmpeg (macOS)")
        return False

def check_ollama():
    """Check if Ollama is running and has VLM model"""
    print("\n4. Checking Ollama...")
    import requests
    
    try:
        response = requests.get('http://localhost:11434/api/tags', timeout=5)
        if response.status_code == 200:
            print("   ✅ Ollama is running")
            
            # Check for VLM models
            data = response.json()
            models = data.get('models', [])
            
            if models:
                print(f"   ✅ Found {len(models)} model(s):")
                for model in models:
                    model_name = model.get('name', 'unknown')
                    print(f"      - {model_name}")
                
                # Check for vision models
                vision_models = [m for m in models if 'vl' in m.get('name', '').lower() 
                               or 'llava' in m.get('name', '').lower()
                               or 'vision' in m.get('name', '').lower()]
                
                if vision_models:
                    print(f"   ✅ Vision model(s) available")
                    return True
                else:
                    print("   ⚠️  No vision model found")
                    print("      Install: ollama pull qwen3-vl:8b")
                    return False
            else:
                print("   ⚠️  No models installed")
                print("      Install: ollama pull qwen3-vl:8b")
                return False
        else:
            print(f"   ❌ Ollama responded with status {response.status_code}")
            return False
            
    except requests.exceptions.ConnectionError:
        print("   ❌ Cannot connect to Ollama")
        print("      Start: ollama serve")
        return False
    except Exception as e:
        print(f"   ❌ Error checking Ollama: {e}")
        return False

def check_directories():
    """Check required directories"""
    print("\n5. Checking directories...")
    
    dirs = {
        'data/sheets': 'Input Excel location',
        'results/tcs_classification': 'Output location',
        'frames/tcs': 'Frame storage',
        'logs': 'Log files',
    }
    
    all_ok = True
    for dir_path, description in dirs.items():
        if os.path.exists(dir_path):
            print(f"   ✅ {dir_path} ({description})")
        else:
            print(f"   ⚠️  {dir_path} - Will be created automatically")
    
    return all_ok

def check_input_file():
    """Check if input Excel file exists"""
    print("\n6. Checking input Excel file...")
    
    input_file = 'data/sheets/new_sheet.xlsx'
    
    if os.path.exists(input_file):
        print(f"   ✅ {input_file} exists")
        
        # Try to read it
        try:
            import pandas as pd
            df = pd.read_excel(input_file)
            print(f"      Rows: {len(df)}")
            print(f"      Columns: {list(df.columns)}")
            
            # Check for CCTV URL column
            url_columns = [col for col in df.columns if 'url' in col.lower() or 'cctv' in col.lower()]
            if url_columns:
                print(f"   ✅ Found URL column(s): {url_columns}")
                return True
            else:
                print("   ⚠️  No 'CCTV URL' column found")
                print(f"      Available columns: {list(df.columns)}")
                return False
                
        except Exception as e:
            print(f"   ❌ Error reading Excel: {e}")
            return False
    else:
        print(f"   ⚠️  {input_file} not found")
        print("      Place your TCS Excel file at this location")
        return False

def check_disk_space():
    """Check available disk space"""
    print("\n7. Checking disk space...")
    
    try:
        import shutil
        total, used, free = shutil.disk_usage('/')
        
        free_gb = free / (1024**3)
        total_gb = total / (1024**3)
        used_percent = (used / total) * 100
        
        print(f"   Total: {total_gb:.1f} GB")
        print(f"   Used: {used_percent:.1f}%")
        print(f"   Free: {free_gb:.1f} GB")
        
        if free_gb > 5:
            print(f"   ✅ Sufficient disk space")
            return True
        else:
            print(f"   ⚠️  Low disk space (< 5 GB free)")
            return False
            
    except Exception as e:
        print(f"   ⚠️  Could not check disk space: {e}")
        return True

def main():
    """Run all checks"""
    print("="*70)
    print("TCS Camera Classification - Environment Check")
    print("="*70)
    
    results = []
    
    results.append(("Python Version", check_python_version()))
    results.append(("Python Modules", check_python_modules()))
    results.append(("FFmpeg", check_ffmpeg()))
    results.append(("Ollama & VLM", check_ollama()))
    results.append(("Directories", check_directories()))
    results.append(("Input Excel", check_input_file()))
    results.append(("Disk Space", check_disk_space()))
    
    print("\n" + "="*70)
    print("SUMMARY")
    print("="*70)
    
    for name, status in results:
        status_icon = "✅" if status else "❌"
        print(f"{status_icon} {name}")
    
    all_ok = all(status for _, status in results)
    
    print("="*70)
    
    if all_ok:
        print("\n🎉 All checks passed! Ready to run classification.")
        print("\nNext step:")
        print("   python vision_classification_tcs.py")
        return 0
    else:
        print("\n⚠️  Some checks failed. Please fix the issues above.")
        print("\nFor help, see: docs/TCS_CAMERA_CLASSIFICATION_GUIDE.md")
        return 1

if __name__ == "__main__":
    sys.exit(main())
