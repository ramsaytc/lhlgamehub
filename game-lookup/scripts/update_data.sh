#!/usr/bin/env bash
set -euo pipefail
shopt -s nullglob

# --- Config ---
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXPORTS_DIR="${PROJECT_ROOT}/exports"
DATA_DIR="${PROJECT_ROOT}/data"

# Default season start year for 2025-26 season
SEASON_START_YEAR="${SEASON_START_YEAR:-2025}"

# Months you care about (Oct 2025 -> Feb 2026)
DEFAULT_MONTHS=("2025-10" "2025-11" "2025-12" "2026-01" "2026-02")

# Standings scrape config
STANDINGS_URL="${STANDINGS_URL:-https://lakeshorehockeyleague.net/Rounds/30700/2025-2026_U14_AA_Regular_Season/}"
STANDINGS_OUT="${EXPORTS_DIR}/2025-2026_u14aa_standings.csv"

# If caller passes months, use those; otherwise use defaults above.
MONTHS=("$@")
if [ "${#MONTHS[@]}" -eq 0 ]; then
  MONTHS=("${DEFAULT_MONTHS[@]}")
fi

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

# --- Helpers ---
validate_month() {
  local m="$1"
  if [[ ! "${m}" =~ ^[0-9]{4}-[0-9]{2}$ ]]; then
    echo "❌ Month '${m}' must be YYYY-MM (example: 2025-11)" | tee -a "${LOG_FILE}"
    exit 1
  fi
  local mm="${m:5:2}"
  if [[ "${mm}" < "01" || "${mm}" > "12" ]]; then
    echo "❌ Month '${m}' has invalid month value '${mm}'" | tee -a "${LOG_FILE}"
    exit 1
  fi
}

normalize_csv_ignore_scraped_at() {
  # Usage: normalize_csv_ignore_scraped_at INPUT.csv OUTPUT.norm.csv
  python3 - "$1" "$2" <<'PY'
import csv, sys

inp, outp = sys.argv[1], sys.argv[2]

FIELDNAMES = [
  "scraped_at","date_text","time","away","away_score","home","home_score",
  "game_code","venue","game_url"
]

def key(r):
  return (
    (r.get("date_text") or "").strip(),
    (r.get("time") or "").strip(),
    (r.get("away") or "").strip(),
    (r.get("home") or "").strip(),
    (r.get("game_code") or "").strip(),
    (r.get("venue") or "").strip(),
    (r.get("game_url") or "").strip(),
    (r.get("away_score") or "").strip(),
    (r.get("home_score") or "").strip(),
  )

with open(inp, newline="", encoding="utf-8") as f:
  rows = list(csv.DictReader(f))

  rows.sort(key=key)

  with open(outp, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=FIELDNAMES)
    w.writeheader()
    for r in rows:
      r2 = {k: (r.get(k) or "").strip() for k in FIELDNAMES}
      r2["scraped_at"] = ""  # ignore scrape timestamp differences
      w.writerow(r2)
PY
}

normalize_standings_csv() {
  # Usage: normalize_standings_csv INPUT.csv OUTPUT.norm.csv
  python3 - "$1" "$2" <<'PY'
import csv, sys

inp, outp = sys.argv[1], sys.argv[2]

FIELDNAMES = [
  "scraped_at", "team", "gp", "w", "l", "t", "pts",
  "w_pct", "gf", "ga", "diff", "gf_pct", "l10", "strk"
]

def key(r):
  return (
    (r.get("team") or "").strip().lower(),
    (r.get("gp") or "").strip(),
    (r.get("w") or "").strip(),
  )

with open(inp, newline="", encoding="utf-8") as f:
  rows = list(csv.DictReader(f))

rows.sort(key=key)

with open(outp, "w", newline="", encoding="utf-8") as f:
  w = csv.DictWriter(f, fieldnames=FIELDNAMES)
  w.writeheader()
  for r in rows:
    r2 = {k: (r.get(k) or "").strip() for k in FIELDNAMES}
    r2["scraped_at"] = ""
    w.writerow(r2)
PY
}

# --- 1) Scrape months (update-if-changed) ---
echo "Scraping months (update-if-changed): ${MONTHS[*]}" | tee -a "${LOG_FILE}"

for m in "${MONTHS[@]}"; do
  validate_month "${m}"

  YEAR="${m:0:4}"
  MON="${m:5:2}"
  MON_NO_LEADING_ZERO="$(echo "${MON}" | sed 's/^0*//')"

  OUT="${EXPORTS_DIR}/${YEAR}-${MON}.csv"
  TMP="${OUT}.tmp"
  TMP_NORM="${OUT}.tmp.norm"
  OUT_NORM="${OUT}.norm"

  echo "→ Scraping ${YEAR}-${MON} (temp) ..." | tee -a "${LOG_FILE}"

  python3 "${PROJECT_ROOT}/month_to_scrape.py" \
    --month "${MON_NO_LEADING_ZERO}" \
    --year "${YEAR}" \
    --out "${TMP}" | tee -a "${LOG_FILE}"

  # Normalize temp
  normalize_csv_ignore_scraped_at "${TMP}" "${TMP_NORM}"

  # Normalize existing (or create an empty baseline with just header)
  if [ -f "${OUT}" ]; then
    normalize_csv_ignore_scraped_at "${OUT}" "${OUT_NORM}"
  else
    printf "scraped_at,date_text,time,away,away_score,home,home_score,game_code,venue,game_url\n" > "${OUT_NORM}"
  fi

  # Compare normalized files; update OUT only when real content changed
  if cmp -s "${TMP_NORM}" "${OUT_NORM}"; then
    echo "  ✓ No changes for ${YEAR}-${MON}; keeping existing ${OUT}" | tee -a "${LOG_FILE}"
    rm -f "${TMP}" "${TMP_NORM}" "${OUT_NORM}"
  else
    echo "  ★ Changes detected for ${YEAR}-${MON}; updating ${OUT}" | tee -a "${LOG_FILE}"
    mv -f "${TMP}" "${OUT}"
    rm -f "${TMP_NORM}" "${OUT_NORM}"
  fi

  echo "" | tee -a "${LOG_FILE}"
done

# --- 1b) Scrape standings (update-if-changed) ---
echo "Scraping standings table ..." | tee -a "${LOG_FILE}"
STANDINGS_TMP="${STANDINGS_OUT}.tmp"
STANDINGS_TMP_NORM="${STANDINGS_OUT}.tmp.norm"
STANDINGS_OUT_NORM="${STANDINGS_OUT}.norm"

python3 "${PROJECT_ROOT}/standings_to_scrape.py" \
  --url "${STANDINGS_URL}" \
  "${STANDINGS_TMP}" | tee -a "${LOG_FILE}"

normalize_standings_csv "${STANDINGS_TMP}" "${STANDINGS_TMP_NORM}"

if [ -f "${STANDINGS_OUT}" ]; then
  normalize_standings_csv "${STANDINGS_OUT}" "${STANDINGS_OUT_NORM}"
else
  printf "scraped_at,team,gp,w,l,t,pts,w_pct,gf,ga,diff,gf_pct,l10,strk\n" > "${STANDINGS_OUT_NORM}"
fi

if cmp -s "${STANDINGS_TMP_NORM}" "${STANDINGS_OUT_NORM}"; then
  echo "  ✓ No changes for standings; keeping existing ${STANDINGS_OUT}" | tee -a "${LOG_FILE}"
  rm -f "${STANDINGS_TMP}" "${STANDINGS_TMP_NORM}" "${STANDINGS_OUT_NORM}"
else
  echo "  ★ Standings changed; updating ${STANDINGS_OUT}" | tee -a "${LOG_FILE}"
  mv -f "${STANDINGS_TMP}" "${STANDINGS_OUT}"
  rm -f "${STANDINGS_TMP_NORM}" "${STANDINGS_OUT_NORM}"
fi

echo "" | tee -a "${LOG_FILE}"

# --- 2) Combine + dedupe + add ISO date + sort ---
echo "Combining/deduping/sorting into data/combined.csv ..." | tee -a "${LOG_FILE}"

CSV_FILES=("${EXPORTS_DIR}"/*.csv)
if [ "${#CSV_FILES[@]}" -eq 0 ]; then
  echo "❌ No CSV files found in ${EXPORTS_DIR}. Nothing to combine." | tee -a "${LOG_FILE}"
  exit 1
fi

python3 "${PROJECT_ROOT}/combine_dedupe.py" \
  "${CSV_FILES[@]}" \
  --out "${DATA_DIR}/combined.csv" \
  --season-start-year "${SEASON_START_YEAR}" \
  --sort asc | tee -a "${LOG_FILE}"

echo "" | tee -a "${LOG_FILE}"

# --- 3) Convert to JSON (reads data/combined.csv) ---
echo "Converting to data/games.json ..." | tee -a "${LOG_FILE}"
node "${PROJECT_ROOT}/scripts/csv_to_json.mjs" | tee -a "${LOG_FILE}"

echo "" | tee -a "${LOG_FILE}"
echo "✅ Done. Updated files:" | tee -a "${LOG_FILE}"
ls -la "${DATA_DIR}/combined.csv" "${DATA_DIR}/games.json" | tee -a "${LOG_FILE}"
