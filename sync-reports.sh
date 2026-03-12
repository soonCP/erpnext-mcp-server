#!/bin/bash
# Sync tax report outputs to Google Shared Drives
# Usage: ./sync-reports.sh [--dry-run]

RCLONE="/mnt/c/Users/soonh/scoop/shims/rclone.exe"
BASE_DIR="$(cd "$(dirname "$0")" && pwd)/output/tax-2025"

FLAGS=(--progress --exclude '*.json')
if [[ "$1" == "--dry-run" ]]; then
    FLAGS+=(--dry-run)
    echo "=== DRY RUN — no files will be uploaded ==="
    echo ""
fi

echo "1/3  Cameron One Inc. → cp-gdrive"
"$RCLONE" copy "$BASE_DIR/Cameron_One_Inc" "cp-gdrive:Tax/2025 Taxes/Reports" "${FLAGS[@]}"
echo ""

echo "2/3  Cameron Healthcare Partners → chp-gdrive"
"$RCLONE" copy "$BASE_DIR/Cameron_Healthcare_Partners" "chp-gdrive:Tax/2025 Taxes/Reports" "${FLAGS[@]}"
echo ""

echo "3/3  Integrative Medicine Psychiatry PC → chp-gdrive (IMPC folder)"
"$RCLONE" copy "$BASE_DIR/Integrative_Medicine_Psychiatry" "chp-gdrive:0 - Integrative Mind PC/Tax/2025/Reports" "${FLAGS[@]}"
echo ""

echo "Done."
