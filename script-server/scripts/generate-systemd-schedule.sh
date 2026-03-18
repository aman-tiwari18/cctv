#!/bin/bash

###############################################################################
# CCTV Systemd Schedule Generator
# Generates systemd timer and service files based on exam-schedule.json
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SCHEDULE_FILE="${SCHEDULE_FILE:-$PROJECT_DIR/backend/config/exam-schedule.json}"
SYSTEMD_DIR="$PROJECT_DIR/systemd"
TIMERS_DIR="$SYSTEMD_DIR/timers"
SERVICES_DIR="$SYSTEMD_DIR/services"
USER_SYSTEMD_DIR="$HOME/.config/systemd/user"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}CCTV Systemd Schedule Generator${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if schedule file exists
if [ ! -f "$SCHEDULE_FILE" ]; then
    echo -e "${RED}Error: Schedule file not found: $SCHEDULE_FILE${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} Schedule file found: $SCHEDULE_FILE"

# Check if jq is installed for JSON parsing
if ! command -v jq &> /dev/null; then
    echo -e "${YELLOW}Warning: jq not found, using python for JSON parsing${NC}"
    USE_PYTHON=1
else
    echo -e "${GREEN}✓${NC} Using jq for JSON parsing"
    USE_PYTHON=0
fi

# Create directories if they don't exist
mkdir -p "$TIMERS_DIR"
mkdir -p "$SERVICES_DIR"
mkdir -p "$USER_SYSTEMD_DIR"

echo -e "${GREEN}✓${NC} Directories created/verified"
echo ""

# Backup old timers
echo -e "${YELLOW}Backing up old timers...${NC}"
if [ -d "$TIMERS_DIR" ]; then
    BACKUP_DIR="$SYSTEMD_DIR/timers_backup_$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$BACKUP_DIR"
    cp -r "$TIMERS_DIR"/*.timer "$BACKUP_DIR/" 2>/dev/null || true
    echo -e "${GREEN}✓${NC} Old timers backed up to: $BACKUP_DIR"
fi

# Clean old auto-generated timers (keep monitor timer)
echo -e "${YELLOW}Cleaning old auto-generated timers...${NC}"
rm -f "$TIMERS_DIR"/cctv-*@slot*.timer 2>/dev/null || true
rm -f "$TIMERS_DIR"/cctv-vision@exam*.timer 2>/dev/null || true
rm -f "$TIMERS_DIR"/cctv-*@morning.timer 2>/dev/null || true
rm -f "$TIMERS_DIR"/cctv-*@afternoon.timer 2>/dev/null || true
rm -f "$TIMERS_DIR"/cctv-*@daily.timer 2>/dev/null || true
echo -e "${GREEN}✓${NC} Old timers cleaned"
echo ""

# Function to parse JSON and generate timers
generate_timers() {
    echo -e "${BLUE}Generating Analytics Timers...${NC}"
    
    if [ $USE_PYTHON -eq 1 ]; then
        # Use Python to parse JSON
        python3 <<EOF
import json
import sys

with open('$SCHEDULE_FILE', 'r') as f:
    schedule = json.load(f)

for analytic in schedule['analytics']:
    service_type = analytic['serviceType']
    name = analytic['name']
    
    for idx, slot in enumerate(analytic['slots'], 1):
        start_time = slot['start']
        end_time = slot['end']
        
        # Generate timer file
        timer_name = f"cctv-{service_type}@slot{idx}.timer"
        timer_path = "$TIMERS_DIR/" + timer_name
        
        timer_content = f"""[Unit]
Description=CCTV {name} Timer (Slot {idx}: {start_time}-{end_time})
Requires=cctv-{service_type}@slot{idx}.service

[Timer]
OnCalendar=*-*-* {start_time}
Persistent=true
AccuracySec=1min

[Install]
WantedBy=timers.target
"""
        
        with open(timer_path, 'w') as f:
            f.write(timer_content)
        
        print(f"Generated: {timer_name}")

print("")
print("Generating Vision Classification Timers...")

for idx, exam_slot in enumerate(schedule['examSlots'], 1):
    name = exam_slot['name']
    vision_time = exam_slot['visionClassificationTime']
    
    timer_name = f"cctv-vision@exam{idx}.timer"
    timer_path = "$TIMERS_DIR/" + timer_name
    
    timer_content = f"""[Unit]
Description=CCTV Vision Classification Timer ({name}: {vision_time})
Requires=cctv-vision@exam{idx}.service

[Timer]
OnCalendar=*-*-* {vision_time}
Persistent=true
AccuracySec=1min

[Install]
WantedBy=timers.target
"""
    
    with open(timer_path, 'w') as f:
        f.write(timer_content)
    
    print(f"Generated: {timer_name}")

EOF
    else
        # Use jq to parse JSON - Create start timers for each slot
        jq -r '.analytics[] | .serviceType as $type | .name as $name | .slots | to_entries[] | 
            "TIMER|\($type)|\(.key + 1)|\(.value.start)|\(.value.end)|\($name)"' "$SCHEDULE_FILE" | \
        while IFS='|' read -r prefix service_type slot_num start_time end_time name; do
            # Create START timer
            timer_name="cctv-${service_type}@slot${slot_num}.timer"
            timer_path="$TIMERS_DIR/$timer_name"
            
            cat > "$timer_path" <<TIMER_EOF
[Unit]
Description=CCTV $name Timer (Slot $slot_num: $start_time-$end_time)
Requires=cctv-${service_type}@slot${slot_num}.service

[Timer]
OnCalendar=*-*-* $start_time
Persistent=true
AccuracySec=1min

[Install]
WantedBy=timers.target
TIMER_EOF
            
            echo -e "Generated: $timer_name (starts at $start_time)"
            
            # Create STOP timer
            stop_timer_name="cctv-${service_type}@slot${slot_num}-stop.timer"
            stop_timer_path="$TIMERS_DIR/$stop_timer_name"
            stop_service_name="cctv-${service_type}@slot${slot_num}-stop.service"
            stop_service_path="$SERVICES_DIR/$stop_service_name"
            
            # Create stop service
            cat > "$stop_service_path" <<STOP_SERVICE_EOF
[Unit]
Description=Stop CCTV $name Service (Slot $slot_num)
After=cctv-${service_type}@slot${slot_num}.service

[Service]
Type=oneshot
ExecStart=/usr/bin/systemctl --user stop cctv-${service_type}@slot${slot_num}.service

[Install]
WantedBy=default.target
STOP_SERVICE_EOF
            
            # Create stop timer
            cat > "$stop_timer_path" <<STOP_TIMER_EOF
[Unit]
Description=Stop CCTV $name Timer (Slot $slot_num: stops at $end_time)
Requires=$stop_service_name

[Timer]
OnCalendar=*-*-* $end_time
Persistent=true
AccuracySec=1min

[Install]
WantedBy=timers.target
STOP_TIMER_EOF
            
            echo -e "Generated: $stop_timer_name (stops at $end_time)"
        done
        
        echo ""
        echo -e "${BLUE}Generating Vision Classification Timers...${NC}"
        
        jq -r '.examSlots | to_entries[] | 
            "VISION|\(.key + 1)|\(.value.visionClassificationTime)|\(.value.name)"' "$SCHEDULE_FILE" | \
        while IFS='|' read -r prefix exam_num vision_time name; do
            timer_name="cctv-vision@exam${exam_num}.timer"
            timer_path="$TIMERS_DIR/$timer_name"
            
            cat > "$timer_path" <<VISION_EOF
[Unit]
Description=CCTV Vision Classification Timer ($name: $vision_time)
Requires=cctv-vision@exam${exam_num}.service

[Timer]
OnCalendar=*-*-* $vision_time
Persistent=true
AccuracySec=1min

[Install]
WantedBy=timers.target
VISION_EOF
            
            echo -e "Generated: $timer_name"
        done
    fi
}

# Generate timers
generate_timers

echo ""
echo -e "${BLUE}Installing service templates and timers to user systemd...${NC}"

# Copy service templates to user systemd directory
cp "$SERVICES_DIR"/*.service "$USER_SYSTEMD_DIR/" 2>/dev/null || true
echo -e "${GREEN}✓${NC} Service templates copied to $USER_SYSTEMD_DIR"

# Copy timers to user systemd directory
cp "$TIMERS_DIR"/*.timer "$USER_SYSTEMD_DIR/" 2>/dev/null || true
echo -e "${GREEN}✓${NC} Timers copied to $USER_SYSTEMD_DIR"

# Reload systemd daemon
echo ""
echo -e "${BLUE}Reloading systemd daemon...${NC}"
systemctl --user daemon-reload
echo -e "${GREEN}✓${NC} Systemd daemon reloaded"

# Stop all existing timers
echo ""
echo -e "${YELLOW}Stopping existing timers...${NC}"
systemctl --user stop 'cctv-*.timer' 2>/dev/null || true
echo -e "${GREEN}✓${NC} Existing timers stopped"

# Enable and start new timers
echo ""
echo -e "${BLUE}Enabling and starting new timers...${NC}"

for timer in "$TIMERS_DIR"/*.timer; do
    timer_name=$(basename "$timer")
    
    # Enable timer
    systemctl --user enable "$timer_name" 2>/dev/null || {
        echo -e "${YELLOW}Warning: Could not enable $timer_name${NC}"
        continue
    }
    
    # Start timer
    systemctl --user start "$timer_name" 2>/dev/null || {
        echo -e "${YELLOW}Warning: Could not start $timer_name${NC}"
        continue
    }
    
    echo -e "${GREEN}✓${NC} Enabled and started: $timer_name"
done

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Systemd Schedule Generation Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Show status summary
echo -e "${BLUE}Timer Status Summary:${NC}"
echo ""
systemctl --user list-timers 'cctv-*.timer' --all || true

echo ""
echo -e "${BLUE}To view logs:${NC}"
echo -e "  journalctl --user -u 'cctv-*.timer' -f"
echo ""
echo -e "${BLUE}To manually trigger a service:${NC}"
echo -e "  systemctl --user start cctv-SERVICE@slotN.service"
echo ""

exit 0
