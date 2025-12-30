#!/usr/bin/env bash
set -euo pipefail

# --- Config ---
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXPORTS_DIR="${PROJECT_ROOT}/exports"
DATA_DIR="${PROJECT_ROOT}/data"

# Default season start year for 2025-26 season
SEASON_START_YEAR="${SEASON_START_YEAR:-2025}"

# Months to scrape (optional)
# If you pass none, it will SKIP scraping and just combine+convert what’s already in exports/
MONTHS=("$@")

# Where logs go
LOG_DIR="${PROJECT_ROOT}/logs"
mkdir -p "${LOG_DIR}"
LOG_FILE="${LOG_DIR}/update_$(date +%Y-%m-%d_%H%M%S).log"

echo "== Game Lookup data update ==" | tee -a "${LOG_FILE}"
echo "Project: ${PROJECT_ROOT}" | tee -a "${LOG_FILE}"
echo "Season start year: ${SEASON_START_YEAR}" | tee -a "${LOG_FILE}"
echo "Exports: ${EXPORTS_DIR}" | tee -a "${LOG_FILE}"
echo "Data: ${DATA_DIR}" | tee -a "${LOG_FILE}"
echo "Log: ${LOG_FILE}" | tee -a "${LOG_FILE}"
echo "" | tee -a "${LOG_FILE}"

mkdir -p "${EXPORTS_DIR}" "${DATA_DIR}"

# --- 1) Scrape (optional) ---
if [ "${#MONTHS[@]}" -gt 0 ]; then
  echo "Scraping months: ${MONTHS[*]}" | tee -a "${LOG_FILE}"
  for m in "${MONTHS[@]}"; do
    # Expect formats: YYYY-MM (e.g. 2025-11) OR "2025-11"
    if [[ ! "${m}" =~ ^[0-9]{4}-[0-9]{2}$ ]]; then
      echo "❌ Month '${m}' must be YYYY-MM (example: 2025-11)" | tee -a "${LOG_FILE}"
      exit 1
    fi

    YEAR="${m:0:4}"
    MON="${m:5:2}"
    MON_NO_LEADING_ZERO="$(echo "${MON}" | sed 's/^0*//')"
    OUT="${EXPORTS_DIR}/${YEAR}-${MON}.csv"

    echo "→ Scraping ${YEAR}-${MON} -> ${OUT}" | tee -a "${LOG_FILE}"

    # Adjust the script name/path if yours is different:
    python3 "${PROJECT_ROOT}/month_to_scrape.py" \
      --month "${MON_NO_LEADING_ZERO}" \
      --year "${YEAR}" \
      --out "${OUT}" | tee -a "${LOG_FILE}"
  done
  echo "" | tee -a "${LOG_FILE}"
else
  echo "No months provided. Skipping scraping; will combine existing CSVs in exports/." | tee -a "${LOG_FILE}"
  echo "" | tee -a "${LOG_FILE}"
fi

# --- 2) Combine + dedupe + add ISO date + sort ---
echo "Combining/deduping/sorting into data/combined.csv ..." | tee -a "${LOG_FILE}"

python3 "${PROJECT_ROOT}/combine_dedupe.py" \
  "${EXPORTS_DIR}"/*.csv \
  --out "${DATA_DIR}/combined.csv" \
  --season-start-year "${SEASON_START_YEAR}" \
  --sort asc | tee -a "${LOG_FILE}"

echo "" | tee -a "${LOG_FILE}"

# --- 3) Convert to JSON (uses your fixed csv_to_json.mjs that reads data/combined.csv) ---
echo "Converting to data/games.json ..." | tee -a "${LOG_FILE}"
node "${PROJECT_ROOT}/scripts/csv_to_json.mjs" | tee -a "${LOG_FILE}"

echo "" | tee -a "${LOG_FILE}"
echo "✅ Done. Updated files:" | tee -a "${LOG_FILE}"
ls -la "${DATA_DIR}/combined.csv" "${DATA_DIR}/games.json" | tee -a "${LOG_FILE}"
