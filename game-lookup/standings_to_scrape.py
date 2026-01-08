#!/usr/bin/env python3
"""
Scrape LHL standings from the provided regular season standings page. The script reads the
single standings table, normalizes the expected columns (team, GP, W, L, T, Pts, etc.), and
exports to CSV alongside a timestamp and source URL so the data mirrors the existing game
exports.

Usage:
  python3 game-lookup/standings_to_scrape.py --url <url> exports/standings_u14aa.csv

Requires:
  pip install requests beautifulsoup4
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import os
import re
import sys
from typing import Dict, List
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup


DEFAULT_URL = (
    "https://lakeshorehockeyleague.net/Rounds/30700/2025-2026_U14_AA_Regular_Season/"
)

DEFAULT_OUTPUT = "exports/2025-2026_u14aa_standings.csv"


def now_iso() -> str:
    return (
        dt.datetime.now(tz=ZoneInfo("America/Toronto"))
        .replace(microsecond=0)
        .isoformat()
    )


def fetch_html(url: str, timeout: int = 30) -> str:
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; LHLStandingsScraper/1.0; +https://lakeshorehockeyleague.net/)"
    }
    resp = requests.get(url, headers=headers, timeout=timeout)
    resp.raise_for_status()
    return resp.text


def normalize_header(header: str) -> str:
    text = header.strip().lower()
    text = text.replace("%", "pct")
    text = re.sub(r"[^a-z0-9]+", "_", text)
    text = re.sub(r"_+", "_", text).strip("_")
    return text


def parse_standings(html: str) -> List[Dict[str, str]]:
    soup = BeautifulSoup(html, "html.parser")
    table = soup.find("table")
    if not table:
        raise RuntimeError("Could not find any table on the standings page.")

    # Headers may live in <thead> or the first row inside <table>
    header_row = table.find("thead")
    if header_row:
        header_row = header_row.find("tr")
    else:
        header_row = table.find("tr")

    if not header_row:
        raise RuntimeError("Standings table is missing header row.")

    headers = [normalize_header(cell.get_text(" ", strip=True)) for cell in header_row.find_all(["th", "td"])]
    if not headers:
        raise RuntimeError("Standings table has no header cells.")

    tbody = table.find("tbody") or table
    rows: List[Dict[str, str]] = []

    column_map = {
        "team": "team",
        "team_name": "team",
        "gp": "gp",
        "games_played": "gp",
        "games": "gp",
        "w": "w",
        "wins": "w",
        "l": "l",
        "losses": "l",
        "t": "t",
        "ties": "t",
        "pts": "pts",
        "points": "pts",
        "w_pct": "w_pct",
        "win_pct": "w_pct",
        "w_pct_": "w_pct",
        "gf": "gf",
        "ga": "ga",
        "diff": "diff",
        "gd": "diff",
        "gf_pct": "gf_pct",
        "gf_pct_": "gf_pct",
        "l10": "l10",
        "strk": "strk",
    }

    schema_columns = [
        "team",
        "gp",
        "w",
        "l",
        "t",
        "pts",
        "w_pct",
        "gf",
        "ga",
        "diff",
        "gf_pct",
        "l10",
        "strk",
    ]

    def build_row(cells: List[str]) -> Dict[str, str]:
        entry = {col: "" for col in schema_columns}
        for idx, text in enumerate(cells):
            if idx >= len(headers):
                break
            normalized = headers[idx]
            mapped = column_map.get(normalized)
            if not mapped:
                continue
            entry[mapped] = text
        return entry

    for tr in tbody.find_all("tr"):
        cells = [cell.get_text(" ", strip=True) for cell in tr.find_all(["th", "td"])]
        if not cells:
            continue
        row = build_row(cells)
        if not row["team"]:
            continue
        rows.append(row)

    if not rows:
        raise RuntimeError("No standings rows were parsed from the table.")

    return rows


def write_csv(rows: List[Dict[str, str]], out_path: str, url: str) -> None:
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    scraped_at = now_iso()
    fieldnames = [
        "scraped_at",
        "team",
        "gp",
        "w",
        "l",
        "t",
        "pts",
        "w_pct",
        "gf",
        "ga",
        "diff",
        "gf_pct",
        "l10",
        "strk",
    ]

    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(
                {
                    "scraped_at": scraped_at,
                    **{k: row.get(k, "") for k in row if k in fieldnames},
                }
            )


def sort_rows(rows: List[Dict[str, str]]) -> List[Dict[str, str]]:
    def to_int(value: str) -> int:
        try:
            return int(value.replace("+", ""))
        except ValueError:
            return 0

    def to_float(value: str) -> float:
        try:
            return float(value.replace("+", ""))
        except ValueError:
            return 0.0

    return sorted(
        rows,
        key=lambda r: (
            to_int(r.get("pts", "0")),
            to_float(r.get("w_pct", "0")),
            to_int(r.get("diff", "0")),
        ),
        reverse=True,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Scrape the LHL standings table and export to CSV.")
    parser.add_argument(
        "output_csv",
        nargs="?",
        default=DEFAULT_OUTPUT,
        help="Output CSV path (default: exports/2025-2026_u14aa_standings.csv)",
    )
    parser.add_argument("--url", default=DEFAULT_URL, help=f"Standings page URL (default: {DEFAULT_URL})")

    args = parser.parse_args()

    html = fetch_html(args.url)
    rows = parse_standings(html)
    rows_sorted = sort_rows(rows)
    write_csv(rows_sorted, args.output_csv, args.url)
    print(f"Wrote {len(rows_sorted)} standings rows -> {args.output_csv}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
