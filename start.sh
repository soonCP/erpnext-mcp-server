#!/bin/bash
set -a
source "$(dirname "$0")/../FinancialIntelligencer/.env"
set +a
exec node "$(dirname "$0")/build/index.js"
