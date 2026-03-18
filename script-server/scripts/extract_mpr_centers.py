import pandas as pd
import re
from pathlib import Path

# File paths
data_dir = Path('/home/suvam/projects/cctv/cctv-analytics-system/data/hls lins')
scheduling_file = data_dir / 'Scheduling_SSC- Combined Graduate Level Examination(CGLE) 2026Tier II - 19th Jan 2026.xlsx'
cctv_paper1_file = data_dir / 'CCTV Camera Report_ CGLE 2025 Tier II Paper I 19th Jan 2026.xlsx'
cctv_paper2_file = data_dir / 'CCTV Camera Report_CGLE 2025 Tier II Paper II Statistics 19th Jan 2026.xlsx'
output_file = data_dir / 'MPR_Centers_CCTV_Report_19th_Jan_2026.xlsx'

print("Step 1: Reading Scheduling file...")
# Read the scheduling file - let's first inspect it
scheduling_df_raw = pd.read_excel(scheduling_file)

# Display first few rows to understand the structure
print(f"\nRaw columns: {list(scheduling_df_raw.columns)}")
print(f"Total rows in raw file: {len(scheduling_df_raw)}")
print("\nFirst 10 rows:")
print(scheduling_df_raw.head(10))

# Try reading with different header row
print("\n\nTrying to find the correct header row...")
for i in range(10):
    try:
        test_df = pd.read_excel(scheduling_file, header=i)
        if 'Region' in test_df.columns or 'TC Name' in test_df.columns:
            print(f"\n✓ Found proper headers at row {i}")
            print(f"Columns: {list(test_df.columns)}")
            scheduling_df = test_df
            break
    except:
        continue
else:
    print("\nCouldn't find proper headers automatically. Using default...")
    scheduling_df = scheduling_df_raw

# Display column names to understand the structure
print(f"\nScheduling file columns: {list(scheduling_df.columns)}")
print(f"Total rows in scheduling file: {len(scheduling_df)}")

# Filter for MPR region
mpr_centers = scheduling_df[scheduling_df['Region'] == 'MPR']
print(f"\nFound {len(mpr_centers)} rows with Region = MPR")

# Extract TC Names for MPR centers
mpr_tc_names = mpr_centers['TC Name'].unique()
print(f"\nUnique MPR TC Names: {len(mpr_tc_names)}")
print("\nMPR Centers:")
for name in sorted(mpr_tc_names):
    print(f"  - {name}")

print("\n" + "="*80)
print("Step 2: Reading CCTV Camera Report files...")

# Read CCTV Camera Report files
cctv_paper1_df = pd.read_excel(cctv_paper1_file)
cctv_paper2_df = pd.read_excel(cctv_paper2_file)

print(f"\nCCTV Paper I columns: {list(cctv_paper1_df.columns)}")
print(f"Total rows in CCTV Paper I: {len(cctv_paper1_df)}")
print("\nSample TC NAME values from Paper I:")
print(cctv_paper1_df['TC NAME'].head(20).tolist())

print(f"\nCCTV Paper II columns: {list(cctv_paper2_df.columns)}")
print(f"Total rows in CCTV Paper II: {len(cctv_paper2_df)}")
print("\nSample TC NAME values from Paper II:")
print(cctv_paper2_df['TC NAME'].head(20).tolist())

print("\n" + "="*80)
print("Step 3: Matching and filtering rows...")

def normalize_name(name):
    """
    Normalize a name for comparison by:
    - Converting to lowercase
    - Removing extra whitespace
    - Standardizing abbreviations like 'iDZ' and 'IDZ'
    """
    if pd.isna(name):
        return ""
    
    name_str = str(name).lower().strip()
    # Replace multiple spaces with single space
    name_str = re.sub(r'\s+', ' ', name_str)
    # Standardize abbreviations
    name_str = name_str.replace('idz', 'idz')
    
    return name_str

def extract_center_name(tc_name_with_code):
    """
    Extract center name from format like '11355-iON Digital Zone iDZ Ramtekdi 2'
    Removes the number and dash prefix
    """
    if pd.isna(tc_name_with_code):
        return ""
    
    # Convert to string
    tc_str = str(tc_name_with_code)
    
    # Remove leading numbers and dash (pattern: digits-anything)
    match = re.match(r'^\d+-\s*(.*)', tc_str)
    if match:
        return match.group(1).strip()
    return tc_str.strip()

def find_matching_rows(cctv_df, mpr_center_names, paper_name):
    """
    Find rows in CCTV dataframe that match MPR center names
    """
    matching_rows = []
    
    # Pre-normalize all MPR names for faster comparison
    mpr_normalized = {normalize_name(name): name for name in mpr_center_names}
    
    for idx, row in cctv_df.iterrows():
        # Check for 'TC NAME' column (all caps) first, then 'TC Name'
        tc_col = 'TC NAME' if 'TC NAME' in cctv_df.columns else 'TC Name'
        
        if tc_col in cctv_df.columns:
            tc_name_full = row[tc_col]
            tc_name_clean = extract_center_name(tc_name_full)
            tc_name_normalized = normalize_name(tc_name_clean)
            
            # Check if normalized name matches any MPR center name
            if tc_name_normalized in mpr_normalized:
                matching_rows.append(row)
                original_mpr_name = mpr_normalized[tc_name_normalized]
                print(f"  ✓ Matched: '{tc_name_clean}' -> MPR: '{original_mpr_name}'")
    
    print(f"\n{paper_name}: Found {len(matching_rows)} matching rows")
    return matching_rows

# Find matching rows in both CCTV files
print("\nMatching Paper I:")
paper1_matches = find_matching_rows(cctv_paper1_df, mpr_tc_names, "Paper I")

print("\nMatching Paper II:")
paper2_matches = find_matching_rows(cctv_paper2_df, mpr_tc_names, "Paper II")

print("\n" + "="*80)
print("Step 4: Creating combined output file...")

# Combine all matching rows
if paper1_matches or paper2_matches:
    # Create DataFrames from matching rows
    combined_rows = []
    
    if paper1_matches:
        paper1_matched_df = pd.DataFrame(paper1_matches)
        paper1_matched_df['Source'] = 'Paper I'
        combined_rows.append(paper1_matched_df)
    
    if paper2_matches:
        paper2_matched_df = pd.DataFrame(paper2_matches)
        paper2_matched_df['Source'] = 'Paper II'
        combined_rows.append(paper2_matched_df)
    
    # Combine all dataframes
    if combined_rows:
        final_df = pd.concat(combined_rows, ignore_index=True)
        
        # Save to Excel
        final_df.to_excel(output_file, index=False)
        print(f"\n✓ Successfully created: {output_file}")
        print(f"  Total rows: {len(final_df)}")
        print(f"  From Paper I: {len(paper1_matches)}")
        print(f"  From Paper II: {len(paper2_matches)}")
    else:
        print("\n⚠ No matching rows found!")
else:
    print("\n⚠ No matching rows found in either file!")

print("\n" + "="*80)
print("Process completed!")
