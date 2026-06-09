#!/bin/bash

# Backup script for feedback-tracker production data
# Creates timestamped backup before running integration tests

set -e

BACKUP_DIR="backups/$(date +%Y%m%d_%H%M%S)"
BASE_DIR="${1:-$(pwd)}"

echo "Creating backup in $BACKUP_DIR..."
mkdir -p "$BACKUP_DIR"

# Backup critical data directories
if [ -d "$BASE_DIR/data" ]; then
    echo "Backing up data directory..."
    cp -r "$BASE_DIR/data" "$BACKUP_DIR/"
fi

if [ -d "$BASE_DIR/state" ]; then
    echo "Backing up state directory..."
    cp -r "$BASE_DIR/state" "$BACKUP_DIR/"
fi

if [ -d "$BASE_DIR/reports" ]; then
    echo "Backing up reports directory..."
    cp -r "$BASE_DIR/reports" "$BACKUP_DIR/"
fi

# Backup config files
if [ -d "$BASE_DIR/config" ]; then
    echo "Backing up config directory..."
    cp -r "$BASE_DIR/config" "$BACKUP_DIR/"
fi

echo "✅ Backup completed: $BACKUP_DIR"
echo "To restore: rm -rf data state reports config && cp -r $BACKUP_DIR/* ."