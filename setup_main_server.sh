#!/bin/bash

# ============================================================
# Main Server Setup Script (PM2 + NFS)
# ============================================================
# Run this on your VM after pushing the code
#
# Usage:
#   sudo ./setup_main_server.sh
# ============================================================

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    print_error "Please run as root or with sudo"
    exit 1
fi

print_info "Starting Main Server Setup..."

# ============================================================
# Step 1: Install NFS Server
# ============================================================
print_info "Installing NFS server..."

apt-get update -qq
apt-get install -y nfs-kernel-server > /dev/null 2>&1

print_info "✓ NFS server installed"

# ============================================================
# Step 2: Create NFS Shared Directory
# ============================================================
print_info "Creating NFS shared directory..."

mkdir -p /mnt/nfs/cctv_images
chmod 777 /mnt/nfs/cctv_images

print_info "✓ Created /mnt/nfs/cctv_images"

# ============================================================
# Step 3: Configure NFS Exports
# ============================================================
print_info "Configuring NFS exports..."

# Backup existing exports
if [ -f /etc/exports ]; then
    cp /etc/exports /etc/exports.backup.$(date +%Y%m%d_%H%M%S)
fi

# Add NFS export if not already present
if ! grep -q "/mnt/nfs/cctv_images" /etc/exports; then
    echo "/mnt/nfs/cctv_images *(rw,sync,no_subtree_check,no_root_squash)" >> /etc/exports
    print_info "✓ Added NFS export"
else
    print_warn "NFS export already exists"
fi

# Apply exports
exportfs -ra
systemctl restart nfs-kernel-server
systemctl enable nfs-kernel-server

print_info "✓ NFS server configured and started"

# ============================================================
# Step 4: Configure MySQL for Remote Access
# ============================================================
print_info "Configuring MySQL for remote access..."

MYSQL_CONF="/etc/mysql/mysql.conf.d/mysqld.cnf"

if [ -f "$MYSQL_CONF" ]; then
    # Backup MySQL config
    cp $MYSQL_CONF ${MYSQL_CONF}.backup.$(date +%Y%m%d_%H%M%S)
    
    # Update bind-address
    if grep -q "^bind-address" $MYSQL_CONF; then
        sed -i 's/^bind-address.*/bind-address = 0.0.0.0/' $MYSQL_CONF
        print_info "✓ Updated MySQL bind-address"
    else
        echo "bind-address = 0.0.0.0" >> $MYSQL_CONF
        print_info "✓ Added MySQL bind-address"
    fi
    
    # Restart MySQL
    systemctl restart mysql
    print_info "✓ MySQL restarted"
else
    print_warn "MySQL config not found at $MYSQL_CONF"
    print_warn "You may need to configure MySQL manually"
fi

# ============================================================
# Step 5: Configure Firewall
# ============================================================
print_info "Configuring firewall..."

# Check if ufw is installed
if command -v ufw &> /dev/null; then
    # Allow MySQL
    ufw allow 3306/tcp > /dev/null 2>&1 || true
    print_info "✓ Allowed MySQL port 3306"
    
    # Allow NFS
    ufw allow 2049/tcp > /dev/null 2>&1 || true
    ufw allow 111/tcp > /dev/null 2>&1 || true
    ufw allow 111/udp > /dev/null 2>&1 || true
    print_info "✓ Allowed NFS ports"
else
    print_warn "UFW not installed, skipping firewall configuration"
fi

# ============================================================
# Step 6: Update Script-Server Environment
# ============================================================
print_info "Updating script-server environment..."

SCRIPT_SERVER_DIR="$(dirname "$0")/script-server"

if [ -d "$SCRIPT_SERVER_DIR" ]; then
    cd "$SCRIPT_SERVER_DIR"
    
    # Create .env if it doesn't exist
    if [ ! -f .env ]; then
        cp .env.example .env
        print_info "✓ Created .env from .env.example"
    fi
    
    # Add worker configuration if not present
    if ! grep -q "WORKER_ID" .env; then
        echo "" >> .env
        echo "# Worker Configuration (Main Server)" >> .env
        echo "WORKER_ID=main" >> .env
        echo "WORKER_NAME=Main Server" >> .env
        echo "DISTRIBUTION_MODE=single" >> .env
        print_info "✓ Added worker configuration to .env"
    else
        print_warn "Worker configuration already exists in .env"
    fi
else
    print_warn "script-server directory not found"
fi

# ============================================================
# Step 7: Link Results to NFS (Optional)
# ============================================================
print_info "Setting up NFS storage link..."

if [ -d "$SCRIPT_SERVER_DIR/results" ]; then
    # Backup existing results
    if [ ! -L "$SCRIPT_SERVER_DIR/results" ]; then
        mv "$SCRIPT_SERVER_DIR/results" "$SCRIPT_SERVER_DIR/results.backup.$(date +%Y%m%d_%H%M%S)"
        print_info "✓ Backed up existing results"
    fi
fi

# Create symlink to NFS
if [ ! -L "$SCRIPT_SERVER_DIR/results" ]; then
    ln -sf /mnt/nfs/cctv_images "$SCRIPT_SERVER_DIR/results"
    print_info "✓ Linked results to NFS storage"
fi

# ============================================================
# Step 8: Verify Setup
# ============================================================
print_info "Verifying setup..."

# Check NFS
if systemctl is-active --quiet nfs-kernel-server; then
    print_info "✓ NFS server is running"
else
    print_error "✗ NFS server is not running"
fi

# Check MySQL
if systemctl is-active --quiet mysql; then
    print_info "✓ MySQL is running"
else
    print_warn "✗ MySQL is not running or not installed"
fi

# Check NFS exports
if exportfs -v | grep -q "/mnt/nfs/cctv_images"; then
    print_info "✓ NFS export configured"
else
    print_error "✗ NFS export not found"
fi

# ============================================================
# Summary
# ============================================================
echo ""
echo "============================================================"
echo -e "${GREEN}Main Server Setup Complete!${NC}"
echo "============================================================"
echo "NFS Server:       Running"
echo "Shared Directory: /mnt/nfs/cctv_images"
echo "MySQL Port:       3306 (accessible remotely)"
echo "NFS Export:       Configured for all IPs"
echo "============================================================"
echo ""
echo "Next Steps:"
echo "1. Grant MySQL remote access:"
echo "   mysql -u root -p"
echo "   GRANT ALL PRIVILEGES ON cctv_monitoring.* TO 'root'@'%' IDENTIFIED BY 'your_password';"
echo "   FLUSH PRIVILEGES;"
echo ""
echo "2. Start your application with PM2:"
echo "   pm2 start ecosystem.config.js"
echo "   pm2 save"
echo ""
echo "3. Verify script-server:"
echo "   curl http://localhost:8000/health"
echo ""
echo "4. Check NFS exports:"
echo "   sudo exportfs -v"
echo ""
echo "5. Deploy worker nodes using script-server/setup_worker.sh"
echo "============================================================"
