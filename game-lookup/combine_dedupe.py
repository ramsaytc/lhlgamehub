#!/usr/bin/env python3

import argparse
import csv
import glob
import os
import re
from datetime import datetime, timezone
from typing import Dict, List, Tuple, Optional

MONTHS = {
    "Jan": "01", "Feb": "02", "Mar": "03", "Apr": "04",
    "May": "05", "Jun": "06", "Jul": "07", "Aug": "08",
    "Sep": "09", "Oct": "10", "Nov": "11", "Dec": "12",
}

DATE_RE = re.compile(r"^([A-Za-z]{3})\s+(\d{1,2})")  # e.g. "Dec 03 (Wed)"


def parse_scraped_at(value: str) -> Optional[datetime]:
    """
    Parse a scraped_at timestamp if present.
    Accepts ISO-ish formats; returns None if it can't parse.
    """
    if not value:
        return None

    s = value.strip()

    # Handle "Z"
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"

    # Try datetime.fromisoformat
    try:
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None


def file_mtime_utc(path: str) -> datetime:
    ts = os.path.getmtime(path)
    return datetime.fromtimestamp(ts, tz=timezone.utc)


def infer_year(mon: str, season_start_year: int, rollover_months: Tuple[str, ...]) -> int:
    """
    Hockey seasons usually span two calendar years.
    Example: season_start_year=2025 => Oct/Nov/Dec are 2025, Jan/Feb/Mar are 2026.
    rollover_months default: ("Jan","Feb","Mar")
    """
    return season_start_year + 1 if mon in rollover_months else season_start_year


def make_game_date_iso(date_text: str, season_start_year: int, rollover_months: Tuple[str, ...]) -> str:
    """
    Convert 'Dec 03 (Wed)' -> '2025-12-03' (with inferred year)
    Returns '' if date_text can't be parsed.
    """
    if not date_text:
        return ""

    m = DATE_RE.search(date_text.strip())
    if not m:
        return ""

    mon = m.group(1)
    day = m.group(2).zfill(2)

    month_num = MONTHS.get(mon)
    if not month_num:
        return ""

    year = infer_year(mon, season_start_year, rollover_months)
    return f"{year}-{month_num}-{day}"


def read_csv_rows(csv_path: str) -> Tuple[List[Dict[str, str]], List[str]]:
    with open(csv_path, "r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = [dict(r) for r in reader]
        fieldnames = reader.fieldnames or []
    return rows, fieldnames


def main():
    ap = argparse.ArgumentParser(
        description="Combine multiple LHL month CSVs, dedupe by game_url keeping latest scrape, add game_date_iso, and sort."
    )
    ap.add_argument(
        "inputs",
        nargs="+",
        help="Input CSVs (globs allowed), e.g. exports/*.csv"
    )
    ap.add_argument(
        "--out",
        default="data/combined.csv",
        help="Output combined CSV path (default: data/combined.csv)"
    )
    ap.add_argument(
        "--season-start-year",
        type=int,
        default=2025,
        help="Season start year (Oct-Dec belong to this year). Default: 2025 for 2025-26 season."
    )
    ap.add_argument(
        "--rollover-months",
        default="Jan,Feb,Mar",
        help='Comma-separated month abbreviations that belong to next year (default: "Jan,Feb,Mar")'
    )
    ap.add_argument(
        "--sort",
        choices=["asc", "desc"],
        default="asc",
        help="Sort by game_date_iso ascending or descending (default: asc)"
    )

    args = ap.parse_args()

    # Expand globs
    input_files: List[str] = []
    for item in args.inputs:
        expanded = glob.glob(item)
        if expanded:
            input_files.extend(expanded)
        else:
            input_files.append(item)

    # Validate inputs exist
    input_files = [p for p in input_files if os.path.exists(p)]
    if not input_files:
        raise SystemExit("❌ No input CSV files found.")

    rollover_months = tuple(m.strip() for m in args.rollover_months.split(",") if m.strip())

    combined: Dict[str, Dict[str, str]] = {}
    latest_time: Dict[str, datetime] = {}

    all_fieldnames: List[str] = []
    seen_fields = set()

    for csv_path in sorted(set(input_files)):
        rows, fieldnames = read_csv_rows(csv_path)

        # Track union of headers across files
        for fn in fieldnames:
            if fn not in seen_fields:
                seen_fields.add(fn)
                all_fieldnames.append(fn)

        source_mtime = file_mtime_utc(csv_path)

        for row in rows:
            game_url = (row.get("game_url") or "").strip()
            if not game_url:
                # If a row has no game_url, skip it (can't dedupe reliably)
                continue

            # Determine "scraped time"
            scraped_at = parse_scraped_at(row.get("scraped_at", ""))
            scraped_time = scraped_at if scraped_at else source_mtime

            # Add derived sortable date field
            row["game_date_iso"] = make_game_date_iso(
                row.get("date_text", ""),
                season_start_year=args.season_start_year,
                rollover_months=rollover_months,
            )

            # Keep newest row per game_url
            if game_url not in combined or scraped_time > latest_time[game_url]:
                combined[game_url] = row
                latest_time[game_url] = scraped_time

    # Ensure output has all columns we know about + derived column
    if "game_date_iso" not in seen_fields:
        all_fieldnames.append("game_date_iso")
        seen_fields.add("game_date_iso")

    # Write rows in sorted order
    out_rows = list(combined.values())

    # Sort by game_date_iso then time (if present), then away/home as stable tie-breakers
    def sort_key(r: Dict[str, str]):
        date_iso = (r.get("game_date_iso") or "").strip()
        # Put missing dates at the end
        date_sort = date_iso if date_iso else "9999-99-99"
        t = (r.get("time") or "").strip()
        return (date_sort, t, (r.get("away") or ""), (r.get("home") or ""))

    out_rows.sort(key=sort_key, reverse=(args.sort == "desc"))

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)

    with open(args.out, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=all_fieldnames, extrasaction="ignore")
        writer.writeheader()
        for r in out_rows:
            # Fill missing keys so CSV stays consistent
            for fn in all_fieldnames:
                r.setdefault(fn, "")
            writer.writerow(r)

    print(f"✅ Combined {len(input_files)} file(s)")
    print(f"✅ Wrote {len(out_rows)} deduped rows to: {args.out}")


if __name__ == "__main__":
    main()
