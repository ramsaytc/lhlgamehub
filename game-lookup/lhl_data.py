#!/usr/bin/env python3
"""
lhl_data.py - Unified CLI for Lakeshore Hockey League data pipeline.

Subcommands:
    scrape-games     Scrape game data for specified months
    scrape-standings Scrape standings table
    combine          Combine CSVs and output JSON
    update           Full pipeline (scrape + combine)

Usage:
    python3 lhl_data.py update
    python3 lhl_data.py scrape-games --months 2026-01 2026-02
    python3 lhl_data.py scrape-standings --url <url>
    python3 lhl_data.py combine --season-start-year 2025
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import glob
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from urllib.parse import urljoin
from zoneinfo import ZoneInfo

import aiohttp
from bs4 import BeautifulSoup

# ============================================================================
# Configuration
# ============================================================================

DEFAULT_BASE_URL = "https://lakeshorehockeyleague.net"
DEFAULT_GROUP_ID = 1313
DEFAULT_STANDINGS_URL = (
    "https://lakeshorehockeyleague.net/Rounds/30700/2025-2026_U14_AA_Regular_Season/"
)
DEFAULT_SEASON_START_YEAR = 2025
TORONTO_TZ = ZoneInfo("America/Toronto")

# Concurrency settings
MAX_CONCURRENT_REQUESTS = 5
REQUEST_DELAY = 0.1  # seconds between batches

# ============================================================================
# Shared Utilities
# ============================================================================

MONTHS_MAP = {
    "Jan": "01", "Feb": "02", "Mar": "03", "Apr": "04",
    "May": "05", "Jun": "06", "Jul": "07", "Aug": "08",
    "Sep": "09", "Oct": "10", "Nov": "11", "Dec": "12",
}

DATE_RE = re.compile(r"^([A-Za-z]{3})\s+(\d{1,2})")
GAME_LINK_RE = re.compile(r"^/Groups/\d+/Games/\d+/?$")
GAME_CODE_RE = re.compile(r"\bU\d{1,2}AA-\d{3}\b")

HEADER_RE = re.compile(
    r"""
    \b(?P<mon>Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b
    \s+(?P<day>\d{1,2})\s+
    (?P<dow>Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+
    (?P<time>\d{1,2}:\d{2}\s*(?:AM|PM))\s+
    (?P<rest>.+)
    """,
    re.VERBOSE | re.DOTALL,
)

TEAMS_RE = re.compile(
    r"""
    ^(?P<away>.+?)
    (?:\s+(?P<away_score>\d+))?
    \s+@\s+
    (?P<home>.+?)
    (?:\s+(?P<home_score>\d+))?
    $
    """,
    re.VERBOSE | re.DOTALL,
)

STOP_PHRASES = [
    "More Venue Details", "Officials", "Game Notes", "Box Score",
    "Webmail", "Safe Sport", "Privacy Policy", "Terms of Use",
    "Website Help", "Sitemap", "Contact", "Subscribe",
]


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def toronto_now_iso() -> str:
    return datetime.now(tz=TORONTO_TZ).replace(microsecond=0).isoformat()


def clean_space(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "")).strip()


def get_project_root() -> Path:
    return Path(__file__).resolve().parent


def get_default_months() -> List[str]:
    """Return current and next month in YYYY-MM format (Toronto timezone)."""
    now = datetime.now(tz=TORONTO_TZ)
    current = now.strftime("%Y-%m")
    first_of_month = now.replace(day=1)
    next_month = (first_of_month.replace(day=28) + timedelta(days=4)).replace(day=1)
    return [current, next_month.strftime("%Y-%m")]


def validate_month(month: str) -> bool:
    """Validate YYYY-MM format."""
    if not re.match(r"^\d{4}-\d{2}$", month):
        return False
    mm = month[5:7]
    return "01" <= mm <= "12"


def infer_year(mon: str, season_start_year: int, rollover_months: Tuple[str, ...] = ("Jan", "Feb", "Mar")) -> int:
    """Infer the calendar year for a month in a hockey season."""
    return season_start_year + 1 if mon in rollover_months else season_start_year


def make_game_date_iso(date_text: str, season_start_year: int) -> str:
    """Convert 'Dec 03 (Wed)' -> '2025-12-03' with inferred year."""
    if not date_text:
        return ""
    m = DATE_RE.search(date_text.strip())
    if not m:
        return ""
    mon = m.group(1)
    day = m.group(2).zfill(2)
    month_num = MONTHS_MAP.get(mon)
    if not month_num:
        return ""
    year = infer_year(mon, season_start_year)
    return f"{year}-{month_num}-{day}"


def normalize_game_row(row: Dict[str, str]) -> Tuple:
    """Create a comparable tuple for change detection (ignoring scraped_at)."""
    return (
        clean_space(row.get("date_text", "")),
        clean_space(row.get("time", "")),
        clean_space(row.get("away", "")),
        clean_space(row.get("home", "")),
        clean_space(row.get("game_code", "")),
        clean_space(row.get("venue", "")),
        clean_space(row.get("game_url", "")),
        clean_space(row.get("away_score", "")),
        clean_space(row.get("home_score", "")),
    )


def normalize_standings_row(row: Dict[str, str]) -> Tuple:
    """Create a comparable tuple for change detection (ignoring scraped_at)."""
    return (
        clean_space(row.get("team", "")).lower(),
        clean_space(row.get("gp", "")),
        clean_space(row.get("w", "")),
        clean_space(row.get("l", "")),
        clean_space(row.get("t", "")),
        clean_space(row.get("pts", "")),
    )


# ============================================================================
# Async HTTP Fetching
# ============================================================================

async def fetch_html(session: aiohttp.ClientSession, url: str) -> str:
    """Fetch a URL and return HTML content."""
    headers = {"User-Agent": "Mozilla/5.0 (compatible; LHLDataScraper/2.0)"}
    async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=30)) as resp:
        resp.raise_for_status()
        return await resp.text()


async def fetch_all_games(session: aiohttp.ClientSession, game_urls: List[str], concurrency: int = MAX_CONCURRENT_REQUESTS) -> List[Tuple[str, str]]:
    """Fetch multiple game pages concurrently with rate limiting."""
    semaphore = asyncio.Semaphore(concurrency)

    async def fetch_one(url: str) -> Tuple[str, str]:
        async with semaphore:
            try:
                html = await fetch_html(session, url)
                return (url, html)
            except Exception as e:
                print(f"  Warning: Failed to fetch {url}: {e}", file=sys.stderr)
                return (url, "")

    tasks = [fetch_one(url) for url in game_urls]
    return await asyncio.gather(*tasks)


# ============================================================================
# Game Scraping
# ============================================================================

def extract_game_links(schedule_html: str, base_url: str) -> List[str]:
    """Extract game detail page links from schedule HTML."""
    soup = BeautifulSoup(schedule_html, "html.parser")
    links = set()
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if GAME_LINK_RE.match(href):
            links.add(urljoin(base_url, href))
    return sorted(links)


def strip_at_stop_phrases(s: str) -> str:
    """Remove footer/menu noise from venue text."""
    s_clean = clean_space(s)
    lower = s_clean.lower()
    cut_at = None
    for phrase in STOP_PHRASES:
        idx = lower.find(phrase.lower())
        if idx != -1:
            cut_at = idx if cut_at is None else min(cut_at, idx)
    if cut_at is not None:
        s_clean = s_clean[:cut_at].strip(" -|")
    return s_clean


def parse_game_details(game_html: str, game_url: str) -> Dict[str, str]:
    """Parse game details from a game page."""
    empty_row = {
        "scraped_at": utc_now_iso(),
        "date_text": "", "time": "", "away": "", "away_score": "",
        "home": "", "home_score": "", "game_code": "", "venue": "",
        "game_url": game_url,
    }

    if not game_html:
        return empty_row

    soup = BeautifulSoup(game_html, "html.parser")
    text = clean_space(soup.get_text("\n", strip=True))

    hm = HEADER_RE.search(text)
    if not hm:
        return empty_row

    mon = hm.group("mon")
    day = (hm.group("day") or "").zfill(2)
    dow = hm.group("dow")
    time_str = clean_space(hm.group("time"))
    rest = clean_space(hm.group("rest"))

    cm = GAME_CODE_RE.search(rest)
    if not cm:
        return {**empty_row, "date_text": f"{mon} {day} ({dow})", "time": time_str}

    game_code = cm.group(0)
    left = clean_space(rest[:cm.start()])
    right = clean_space(rest[cm.end():])

    tm = TEAMS_RE.match(left)
    if not tm:
        away = home = away_score = home_score = ""
    else:
        away = clean_space(tm.group("away"))
        home = clean_space(tm.group("home"))
        away_score = clean_space(tm.group("away_score") or "")
        home_score = clean_space(tm.group("home_score") or "")

    venue = strip_at_stop_phrases(right)

    return {
        "scraped_at": utc_now_iso(),
        "date_text": f"{mon} {day} ({dow})",
        "time": time_str,
        "away": away,
        "away_score": away_score,
        "home": home,
        "home_score": home_score,
        "game_code": game_code,
        "venue": venue,
        "game_url": game_url,
    }


def read_existing_games_csv(path: Path) -> List[Dict[str, str]]:
    """Read existing game CSV if it exists."""
    if not path.exists():
        return []
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def write_games_csv(path: Path, rows: List[Dict[str, str]]) -> None:
    """Write game data to CSV."""
    fieldnames = [
        "scraped_at", "date_text", "time", "away", "away_score",
        "home", "home_score", "game_code", "venue", "game_url",
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({k: row.get(k, "") for k in fieldnames})


async def scrape_games_for_month(
    session: aiohttp.ClientSession,
    year: int,
    month: int,
    base_url: str = DEFAULT_BASE_URL,
    group_id: int = DEFAULT_GROUP_ID,
) -> List[Dict[str, str]]:
    """Scrape all games for a given month."""
    schedule_url = f"{base_url}/Groups/{group_id}/Schedule/?Month={month}&Year={year}"
    print(f"  Fetching schedule: {schedule_url}")

    schedule_html = await fetch_html(session, schedule_url)
    game_urls = extract_game_links(schedule_html, base_url)

    if not game_urls:
        print(f"  No games found for {year}-{month:02d}")
        return []

    print(f"  Found {len(game_urls)} games, fetching details...")
    results = await fetch_all_games(session, game_urls)

    rows = []
    for url, html in results:
        row = parse_game_details(html, url)
        rows.append(row)

    # Dedupe by game_url
    seen = {}
    for row in rows:
        url = row.get("game_url", "")
        if url:
            seen[url] = row

    return list(seen.values())


def games_changed(old_rows: List[Dict[str, str]], new_rows: List[Dict[str, str]]) -> bool:
    """Check if game data has changed (ignoring scraped_at)."""
    old_normalized = sorted(normalize_game_row(r) for r in old_rows)
    new_normalized = sorted(normalize_game_row(r) for r in new_rows)
    return old_normalized != new_normalized


async def cmd_scrape_games(args: argparse.Namespace) -> int:
    """Handle scrape-games subcommand."""
    project_root = get_project_root()
    exports_dir = project_root / "exports"

    months = args.months or get_default_months()

    for month_str in months:
        if not validate_month(month_str):
            print(f"Error: Invalid month format '{month_str}'. Use YYYY-MM.", file=sys.stderr)
            return 1

    print(f"Scraping games for: {', '.join(months)}")

    async with aiohttp.ClientSession() as session:
        for month_str in months:
            year = int(month_str[:4])
            month = int(month_str[5:7])
            out_path = exports_dir / f"{month_str}.csv"

            print(f"\n[{month_str}]")

            old_rows = read_existing_games_csv(out_path)
            new_rows = await scrape_games_for_month(session, year, month)

            if not new_rows:
                write_games_csv(out_path, [])
                print(f"  Wrote empty CSV: {out_path}")
                continue

            if old_rows and not games_changed(old_rows, new_rows):
                print(f"  No changes detected, keeping existing file")
            else:
                write_games_csv(out_path, new_rows)
                print(f"  Wrote {len(new_rows)} games to: {out_path}")

    return 0


# ============================================================================
# Standings Scraping
# ============================================================================

STANDINGS_COLUMN_MAP = {
    "team": "team", "team_name": "team",
    "gp": "gp", "games_played": "gp", "games": "gp",
    "w": "w", "wins": "w",
    "l": "l", "losses": "l",
    "t": "t", "ties": "t",
    "pts": "pts", "points": "pts",
    "w_pct": "w_pct", "win_pct": "w_pct", "w_pct_": "w_pct",
    "gf": "gf", "ga": "ga",
    "diff": "diff", "gd": "diff",
    "gf_pct": "gf_pct", "gf_pct_": "gf_pct",
    "l10": "l10", "strk": "strk",
}

STANDINGS_COLUMNS = ["team", "gp", "w", "l", "t", "pts", "w_pct", "gf", "ga", "diff", "gf_pct", "l10", "strk"]


def normalize_header(header: str) -> str:
    """Normalize table header to snake_case."""
    text = header.strip().lower()
    text = text.replace("%", "pct")
    text = re.sub(r"[^a-z0-9]+", "_", text)
    text = re.sub(r"_+", "_", text).strip("_")
    return text


def parse_standings(html: str) -> List[Dict[str, str]]:
    """Parse standings table from HTML."""
    soup = BeautifulSoup(html, "html.parser")
    table = soup.find("table")
    if not table:
        raise RuntimeError("Could not find standings table")

    header_row = table.find("thead")
    if header_row:
        header_row = header_row.find("tr")
    else:
        header_row = table.find("tr")

    if not header_row:
        raise RuntimeError("Standings table missing header row")

    headers = [normalize_header(cell.get_text(" ", strip=True)) for cell in header_row.find_all(["th", "td"])]

    tbody = table.find("tbody") or table
    rows = []

    for tr in tbody.find_all("tr"):
        cells = [cell.get_text(" ", strip=True) for cell in tr.find_all(["th", "td"])]
        if not cells:
            continue

        entry = {col: "" for col in STANDINGS_COLUMNS}
        for idx, text in enumerate(cells):
            if idx >= len(headers):
                break
            mapped = STANDINGS_COLUMN_MAP.get(headers[idx])
            if mapped:
                entry[mapped] = text

        if entry["team"]:
            rows.append(entry)

    return rows


def sort_standings(rows: List[Dict[str, str]]) -> List[Dict[str, str]]:
    """Sort standings by points, win%, diff."""
    def to_int(val: str) -> int:
        try:
            return int(val.replace("+", ""))
        except ValueError:
            return 0

    def to_float(val: str) -> float:
        try:
            return float(val.replace("+", ""))
        except ValueError:
            return 0.0

    return sorted(rows, key=lambda r: (to_int(r.get("pts", "0")), to_float(r.get("w_pct", "0")), to_int(r.get("diff", "0"))), reverse=True)


def read_existing_standings_csv(path: Path) -> List[Dict[str, str]]:
    """Read existing standings CSV if it exists."""
    if not path.exists():
        return []
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def write_standings_csv(path: Path, rows: List[Dict[str, str]]) -> None:
    """Write standings data to CSV."""
    fieldnames = ["scraped_at"] + STANDINGS_COLUMNS
    scraped_at = toronto_now_iso()
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({"scraped_at": scraped_at, **{k: row.get(k, "") for k in STANDINGS_COLUMNS}})


def standings_changed(old_rows: List[Dict[str, str]], new_rows: List[Dict[str, str]]) -> bool:
    """Check if standings data has changed (ignoring scraped_at)."""
    old_normalized = sorted(normalize_standings_row(r) for r in old_rows)
    new_normalized = sorted(normalize_standings_row(r) for r in new_rows)
    return old_normalized != new_normalized


async def cmd_scrape_standings(args: argparse.Namespace) -> int:
    """Handle scrape-standings subcommand."""
    project_root = get_project_root()
    url = args.url or DEFAULT_STANDINGS_URL
    out_path = Path(args.out) if args.out else project_root / "exports" / "2025-2026_u14aa_standings.csv"

    print(f"Scraping standings from: {url}")

    async with aiohttp.ClientSession() as session:
        html = await fetch_html(session, url)

    rows = parse_standings(html)
    rows = sort_standings(rows)

    old_rows = read_existing_standings_csv(out_path)

    if old_rows and not standings_changed(old_rows, rows):
        print(f"No changes detected, keeping existing file")
    else:
        write_standings_csv(out_path, rows)
        print(f"Wrote {len(rows)} standings rows to: {out_path}")

    return 0


# ============================================================================
# Combine & JSON Output
# ============================================================================

def parse_scraped_at(value: str) -> Optional[datetime]:
    """Parse scraped_at timestamp."""
    if not value:
        return None
    s = value.strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None


def file_mtime_utc(path: Path) -> datetime:
    """Get file modification time in UTC."""
    ts = path.stat().st_mtime
    return datetime.fromtimestamp(ts, tz=timezone.utc)


def cmd_combine(args: argparse.Namespace) -> int:
    """Handle combine subcommand."""
    project_root = get_project_root()
    exports_dir = project_root / "exports"
    data_dir = project_root / "data"

    season_start_year = args.season_start_year or DEFAULT_SEASON_START_YEAR

    # Find all game CSVs (exclude standings files)
    csv_files = sorted(exports_dir.glob("*.csv"))
    game_csvs = [p for p in csv_files if not "standings" in p.name.lower()]

    if not game_csvs:
        print("Error: No game CSV files found in exports/", file=sys.stderr)
        return 1

    print(f"Combining {len(game_csvs)} game CSV files...")

    combined: Dict[str, Dict[str, str]] = {}
    latest_time: Dict[str, datetime] = {}
    all_fieldnames: List[str] = []
    seen_fields = set()

    for csv_path in game_csvs:
        with open(csv_path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            rows = list(reader)
            fieldnames = reader.fieldnames or []

        for fn in fieldnames:
            if fn not in seen_fields:
                seen_fields.add(fn)
                all_fieldnames.append(fn)

        source_mtime = file_mtime_utc(csv_path)

        for row in rows:
            game_url = (row.get("game_url") or "").strip()
            if not game_url:
                continue

            scraped_at = parse_scraped_at(row.get("scraped_at", ""))
            scraped_time = scraped_at if scraped_at else source_mtime

            row["game_date_iso"] = make_game_date_iso(row.get("date_text", ""), season_start_year)

            if game_url not in combined or scraped_time > latest_time[game_url]:
                combined[game_url] = row
                latest_time[game_url] = scraped_time

    if "game_date_iso" not in seen_fields:
        all_fieldnames.append("game_date_iso")

    out_rows = list(combined.values())

    # Sort by date, time, teams
    def sort_key(r: Dict[str, str]):
        date_iso = (r.get("game_date_iso") or "").strip()
        date_sort = date_iso if date_iso else "9999-99-99"
        return (date_sort, r.get("time", ""), r.get("away", ""), r.get("home", ""))

    out_rows.sort(key=sort_key)

    # Write combined CSV
    data_dir.mkdir(parents=True, exist_ok=True)
    csv_out = data_dir / "combined.csv"

    with open(csv_out, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=all_fieldnames, extrasaction="ignore")
        writer.writeheader()
        for row in out_rows:
            for fn in all_fieldnames:
                row.setdefault(fn, "")
            writer.writerow(row)

    print(f"Wrote {len(out_rows)} games to: {csv_out}")

    # Write JSON
    json_out = data_dir / "games.json"
    with open(json_out, "w", encoding="utf-8") as f:
        json.dump(out_rows, f, indent=2)

    print(f"Wrote {len(out_rows)} games to: {json_out}")

    return 0


# ============================================================================
# Update (Full Pipeline)
# ============================================================================

async def cmd_update(args: argparse.Namespace) -> int:
    """Handle update subcommand - full pipeline."""
    project_root = get_project_root()
    log_dir = project_root / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)

    log_file = log_dir / f"update_{datetime.now().strftime('%Y-%m-%d_%H%M%S')}.log"

    print("=" * 50)
    print("LHL Data Update")
    print("=" * 50)
    print(f"Project: {project_root}")
    print(f"Log: {log_file}")
    print()

    # Scrape games
    print("[1/3] Scraping games...")
    months = args.months or get_default_months()

    for month_str in months:
        if not validate_month(month_str):
            print(f"Error: Invalid month format '{month_str}'", file=sys.stderr)
            return 1

    async with aiohttp.ClientSession() as session:
        for month_str in months:
            year = int(month_str[:4])
            month = int(month_str[5:7])
            out_path = project_root / "exports" / f"{month_str}.csv"

            print(f"\n  [{month_str}]")

            old_rows = read_existing_games_csv(out_path)
            new_rows = await scrape_games_for_month(session, year, month)

            if not new_rows:
                write_games_csv(out_path, [])
                print(f"    Wrote empty CSV")
            elif old_rows and not games_changed(old_rows, new_rows):
                print(f"    No changes")
            else:
                write_games_csv(out_path, new_rows)
                print(f"    Wrote {len(new_rows)} games")

    # Scrape standings
    print("\n[2/3] Scraping standings...")
    standings_url = args.standings_url or DEFAULT_STANDINGS_URL
    standings_out = project_root / "exports" / "2025-2026_u14aa_standings.csv"

    async with aiohttp.ClientSession() as session:
        html = await fetch_html(session, standings_url)

    rows = parse_standings(html)
    rows = sort_standings(rows)
    old_standings = read_existing_standings_csv(standings_out)

    if old_standings and not standings_changed(old_standings, rows):
        print("  No changes")
    else:
        write_standings_csv(standings_out, rows)
        print(f"  Wrote {len(rows)} standings rows")

    # Combine
    print("\n[3/3] Combining and generating JSON...")

    # Create a namespace for combine args
    combine_args = argparse.Namespace(season_start_year=args.season_start_year or DEFAULT_SEASON_START_YEAR)
    result = cmd_combine(combine_args)

    if result != 0:
        return result

    print("\n" + "=" * 50)
    print("Done!")
    print("=" * 50)

    return 0


# ============================================================================
# CLI Entry Point
# ============================================================================

def main() -> int:
    parser = argparse.ArgumentParser(
        prog="lhl_data",
        description="Unified CLI for Lakeshore Hockey League data pipeline",
    )
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # scrape-games
    sg = subparsers.add_parser("scrape-games", help="Scrape game data for specified months")
    sg.add_argument("--months", nargs="+", help="Months to scrape (YYYY-MM format). Default: current + next month")

    # scrape-standings
    ss = subparsers.add_parser("scrape-standings", help="Scrape standings table")
    ss.add_argument("--url", help=f"Standings page URL (default: {DEFAULT_STANDINGS_URL})")
    ss.add_argument("--out", help="Output CSV path")

    # combine
    cb = subparsers.add_parser("combine", help="Combine CSVs and output JSON")
    cb.add_argument("--season-start-year", type=int, help=f"Season start year (default: {DEFAULT_SEASON_START_YEAR})")

    # update
    up = subparsers.add_parser("update", help="Full pipeline: scrape games + standings + combine")
    up.add_argument("--months", nargs="+", help="Months to scrape (YYYY-MM format). Default: current + next month")
    up.add_argument("--standings-url", help=f"Standings page URL")
    up.add_argument("--season-start-year", type=int, help=f"Season start year (default: {DEFAULT_SEASON_START_YEAR})")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return 0

    if args.command == "scrape-games":
        return asyncio.run(cmd_scrape_games(args))
    elif args.command == "scrape-standings":
        return asyncio.run(cmd_scrape_standings(args))
    elif args.command == "combine":
        return cmd_combine(args)
    elif args.command == "update":
        return asyncio.run(cmd_update(args))

    return 0


if __name__ == "__main__":
    sys.exit(main())
