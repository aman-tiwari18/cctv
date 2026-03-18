#!/bin/bash
# Master script to run all exam report generators
# Run individual scripts or all at once

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "================================================================================"
echo "EXAM REPORT GENERATOR - MASTER SCRIPT"
echo "================================================================================"
echo ""
echo "Available exam report generators:"
echo "  1. SICPO (Dec 9-12, 2025) - 2 shifts"
echo "  2. SSC Constable Driver (Dec 16-17, 2025) - 2 shifts"
echo "  3. SSC Constable Executive (Dec 18 - Jan 6, 2026) - 3 shifts, 20 days"
echo "  4. SSC Head Constable Ministerial (Jan 7-12, 2026) - 3 shifts"
echo "  5. Head Constable AWO/TPO (Jan 16-21, 2026) - 3 shifts"
echo "  6. CGLE Tier 2 (Jan 19, 2026) - 2 shifts (Paper I & II)"
echo "  7. Run ALL exams"
echo ""

# Check if argument provided
if [ $# -eq 0 ]; then
    read -p "Enter choice (1-7): " choice
else
    choice=$1
fi

run_exam() {
    local script=$1
    local name=$2
    
    echo ""
    echo "================================================================================"
    echo "Running: $name"
    echo "================================================================================"
    
    if [ -f "$script" ]; then
        python3 "$script"
        if [ $? -eq 0 ]; then
            echo "✅ $name completed successfully"
        else
            echo "❌ $name failed"
            return 1
        fi
    else
        echo "❌ Script not found: $script"
        return 1
    fi
    
    echo ""
}

case $choice in
    1)
        run_exam "generate_sicpo_reports.py" "SICPO Exam Reports"
        ;;
    2)
        run_exam "generate_ssc_driver_reports.py" "SSC Constable Driver Exam Reports"
        ;;
    3)
        run_exam "generate_ssc_executive_reports.py" "SSC Constable Executive Exam Reports"
        ;;
    4)
        run_exam "generate_ssc_hc_min_reports.py" "SSC Head Constable Ministerial Exam Reports"
        ;;
    5)
        run_exam "generate_hc_awo_tpo_reports.py" "Head Constable AWO/TPO Exam Reports"
        ;;
    6)
        run_exam "generate_cgle_tier2_reports.py" "CGLE Tier 2 Exam Reports"
        ;;
    7)
        echo "Running ALL exam report generators..."
        
        run_exam "generate_sicpo_reports.py" "SICPO Exam Reports"
        run_exam "generate_ssc_driver_reports.py" "SSC Constable Driver Exam Reports"
        run_exam "generate_ssc_executive_reports.py" "SSC Constable Executive Exam Reports"
        run_exam "generate_ssc_hc_min_reports.py" "SSC Head Constable Ministerial Exam Reports"
        run_exam "generate_hc_awo_tpo_reports.py" "Head Constable AWO/TPO Exam Reports"
        run_exam "generate_cgle_tier2_reports.py" "CGLE Tier 2 Exam Reports"
        
        echo ""
        echo "================================================================================"
        echo "ALL EXAM REPORTS GENERATION COMPLETE"
        echo "================================================================================"
        echo ""
        echo "Summary:"
        echo "  - SICPO: 4 daily files"
        echo "  - Driver: 2 daily files"
        echo "  - Executive: 20 daily files"
        echo "  - HC Ministerial: 6 daily files"
        echo "  - HC AWO/TPO: 6 daily files"
        echo "  - CGLE Tier 2: 1 daily file"
        echo ""
        echo "Total: 39 Excel files with proof_of_work folders"
        echo ""
        ;;
    *)
        echo "Invalid choice. Please select 1-7."
        exit 1
        ;;
esac

echo "Done!"
