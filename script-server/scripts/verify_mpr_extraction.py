import pandas as pd
from pathlib import Path

# File path
output_file = Path('/home/suvam/projects/cctv/cctv-analytics-system/data/hls lins/MPR_Centers_CCTV_Report_19th_Jan_2026.xlsx')

print("="*80)
print("MPR CENTERS CCTV REPORT SUMMARY")
print("="*80)

# Read the output file
df = pd.read_excel(output_file)

print(f"\nTotal Records: {len(df)}")
print(f"\nColumns: {list(df.columns)}")

print("\n" + "-"*80)
print("Distribution by Source:")
print("-"*80)
source_counts = df['Source'].value_counts()
for source, count in source_counts.items():
    print(f"  {source}: {count} rows")

print("\n" + "-"*80)
print("Distribution by TC NAME (Center):")
print("-"*80)
tc_counts = df['TC NAME'].value_counts()
for tc_name, count in tc_counts.items():
    print(f"  {tc_name}: {count} cameras")

print("\n" + "-"*80)
print("Sample Records (first 5):")
print("-"*80)
print(df[['TC NAME', 'Camera Name', 'Source', 'Date of Assessment', 'Shift of Assessment']].head(5).to_string(index=False))

print("\n" + "="*80)
print("Verification Complete!")
print("="*80)
