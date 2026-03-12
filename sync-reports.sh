#!/bin/bash
# Sync tax report outputs to Google Shared Drives
# Usage: ./sync-reports.sh [--dry-run]
# Logs are written to logs/sync/

RCLONE="/mnt/c/Users/soonh/scoop/shims/rclone.exe"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BASE_DIR="$SCRIPT_DIR/output/tax-2025"
LOG_DIR="$SCRIPT_DIR/logs/sync"
mkdir -p "$LOG_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="$LOG_DIR/${TIMESTAMP}.log"

FLAGS=(--progress --exclude '*.json')
if [[ "$1" == "--dry-run" ]]; then
    FLAGS+=(--dry-run)
    echo "=== DRY RUN — no files will be uploaded ===" | tee -a "$LOG_FILE"
    echo "" | tee -a "$LOG_FILE"
fi

echo "Sync started: $(date)" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

echo "1/3  Cameron One Inc. → cp-gdrive" | tee -a "$LOG_FILE"
"$RCLONE" copy "$BASE_DIR/Cameron_One_Inc" "cp-gdrive:Tax/2025 Taxes/Reports" "${FLAGS[@]}" --log-file="$LOG_FILE" --log-level INFO
echo "" | tee -a "$LOG_FILE"

echo "2/3  Cameron Healthcare Partners → chp-gdrive" | tee -a "$LOG_FILE"
"$RCLONE" copy "$BASE_DIR/Cameron_Healthcare_Partners" "chp-gdrive:Tax/2025 Taxes/Reports" "${FLAGS[@]}" --log-file="$LOG_FILE" --log-level INFO
echo "" | tee -a "$LOG_FILE"

echo "3/3  Integrative Medicine Psychiatry PC → chp-gdrive (IMPC folder)" | tee -a "$LOG_FILE"
"$RCLONE" copy "$BASE_DIR/Integrative_Medicine_Psychiatry" "chp-gdrive:0 - Integrative Mind PC/Tax/2025/Reports" "${FLAGS[@]}" --log-file="$LOG_FILE" --log-level INFO
echo "" | tee -a "$LOG_FILE"

echo "Sync completed: $(date)" | tee -a "$LOG_FILE"
echo "Log: $LOG_FILE"
