#!/usr/bin/env python3
"""
month_to_scrape.py

Scrape one month of LHL schedule + game detail pages and export to CSV.

Usage:
  python3 month_to_scrape.py --group-id 1313 --month 11 --year 2025 --out exports/2025-11.csv

Requires:
  pip install requests beautifulsoup4
"""

import argparse
import csv
import re
import sys
import time
from datetime import datetime, timezone
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup


DEFAULT_BASE_URL = "https://lakeshorehockeyleague.net"
DEFAULT_GROUP_ID = 1313

GAME_LINK_RE = re.compile(r"^/Groups/\d+/Games/\d+/?$")

# Example (flattened text) we want to parse:
# Oct 04 Sat 5:30 PM North Durham Warriors 5 @ Belleville Bulls 0 U14AA-041 Quinte Sports & Wellness Centre ...
#
# Anchor on the real game code to prevent parsing drift:
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
    "More Venue Details",
    "Officials",
    "Game Notes",
    "Box Score",
    "Webmail",
    "Safe Sport",
    "Privacy Policy",
    "Terms of Use",
    "Website Help",
    "Sitemap",
    "Contact",
    "Subscribe",
]


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _clean_space(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "")).strip()


def fetch_html(session: requests.Session, url: str, timeout: int) -> str:
    r = session.get(url, timeout=timeout, headers={"User-Agent": "Mozilla/5.0"})
    r.raise_for_status()
    return r.text


def extract_game_links(schedule_html: str, base_url: str) -> list[str]:
    soup = BeautifulSoup(schedule_html, "html.parser")
    links: set[str] = set()

    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if GAME_LINK_RE.match(href):
            links.add(urljoin(base_url, href))

    return sorted(links)


def strip_at_stop_phrases(s: str) -> str:
    s_clean = _clean_space(s)
    lower = s_clean.lower()
    cut_at = None
    for phrase in STOP_PHRASES:
        idx = lower.find(phrase.lower())
        if idx != -1:
            cut_at = idx if cut_at is None else min(cut_at, idx)
    if cut_at is not None:
        s_clean = s_clean[:cut_at].strip(" -|•\t")
    return s_clean


def parse_game_details(game_html: str, game_url: str) -> dict:
    soup = BeautifulSoup(game_html, "html.parser")

    # Flatten all visible text
    text = soup.get_text("\n", strip=True)
    text = _clean_space(text)

    # 1) Parse the front matter: Month Day DOW Time ...
    hm = HEADER_RE.search(text)
    if not hm:
        return {
            "scraped_at": utc_now_iso(),
            "date_text": "",
            "time": "",
            "away": "",
            "away_score": "",
            "home": "",
            "home_score": "",
            "game_code": "",
            "venue": "",
            "game_url": game_url,
        }

    mon = hm.group("mon")
    day = (hm.group("day") or "").zfill(2)
    dow = hm.group("dow")
    time_str = _clean_space(hm.group("time"))
    rest = _clean_space(hm.group("rest"))

    # 2) Find the REAL game code (U14AA-###) and split around it
    cm = GAME_CODE_RE.search(rest)
    if not cm:
        # If code not found, bail gracefully
        return {
            "scraped_at": utc_now_iso(),
            "date_text": f"{mon} {day} ({dow})",
            "time": time_str,
            "away": "",
            "away_score": "",
            "home": "",
            "home_score": "",
            "game_code": "",
            "venue": "",
            "game_url": game_url,
        }

    game_code = cm.group(0)

    left = _clean_space(rest[: cm.start()])   # "Away ... @ Home ..."
    right = _clean_space(rest[cm.end() :])   # "Venue ... (Pad) More Venue Details ..."

    # 3) Parse away/home + optional scores from the LEFT side
    tm = TEAMS_RE.match(left)
    if not tm:
        away = home = away_score = home_score = ""
    else:
        away = _clean_space(tm.group("away"))
        home = _clean_space(tm.group("home"))
        away_score = _clean_space(tm.group("away_score") or "")
        home_score = _clean_space(tm.group("home_score") or "")

    # 4) Venue is the RIGHT side, but strip footer/menu noise aggressively
    venue = strip_at_stop_phrases(right)

    date_text = f"{mon} {day} ({dow})"

    return {
        "scraped_at": utc_now_iso(),
        "date_text": date_text,
        "time": time_str,
        "away": away,
        "away_score": away_score,
        "home": home,
        "home_score": home_score,
        "game_code": game_code,
        "venue": venue,
        "game_url": game_url,
    }


def write_csv(out_path: str, rows: list[dict]) -> None:
    fieldnames = [
        "scraped_at",
        "date_text",
        "time",
        "away",
        "away_score",
        "home",
        "home_score",
        "game_code",
        "venue",
        "game_url",
    ]
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(
            f,
            fieldnames=fieldnames,
            quoting=csv.QUOTE_MINIMAL,
            lineterminator="\n",
        )
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in fieldnames})


def main():
    ap = argparse.ArgumentParser(description="Scrape one month of LHL schedule + game details to CSV.")
    ap.add_argument("--group-id", type=int, default=DEFAULT_GROUP_ID, help="Group ID")
    ap.add_argument("--month", type=int, required=True, help="Month number (1-12)")
    ap.add_argument("--year", type=int, required=True, help="Year (e.g. 2025)")
    ap.add_argument("--out", required=True, help="Output CSV path (caller controls filename)")
    ap.add_argument("--base-url", default=DEFAULT_BASE_URL, help="Base URL")
    ap.add_argument("--timeout", type=int, default=30, help="HTTP timeout seconds")
    ap.add_argument("--delay", type=float, default=0.25, help="Delay between game requests (seconds)")
    args = ap.parse_args()

    if not (1 <= args.month <= 12):
        print("❌ --month must be 1-12", file=sys.stderr)
        sys.exit(1)

    schedule_url = f"{args.base_url}/Groups/{args.group_id}/Schedule/?Month={args.month}&Year={args.year}"

    session = requests.Session()

    print(f"📄 Fetching schedule: {schedule_url}")
    schedule_html = fetch_html(session, schedule_url, timeout=args.timeout)

    game_links = extract_game_links(schedule_html, args.base_url)
    if not game_links:
        print("⚠️ No game links found on schedule page. Writing empty CSV.")
        write_csv(args.out, [])
        print(f"✅ Wrote: {args.out}")
        return

    print(f"🔎 Found {len(game_links)} game links. Fetching details...")

    rows: list[dict] = []
    for i, game_url in enumerate(game_links, start=1):
        try:
            game_html = fetch_html(session, game_url, timeout=args.timeout)
            row = parse_game_details(game_html, game_url)
            rows.append(row)
        except Exception as e:
            print(f"⚠️ Failed {game_url}: {e}", file=sys.stderr)
            rows.append(
                {
                    "scraped_at": utc_now_iso(),
                    "date_text": "",
                    "time": "",
                    "away": "",
                    "away_score": "",
                    "home": "",
                    "home_score": "",
                    "game_code": "",
                    "venue": "",
                    "game_url": game_url,
                }
            )

        if args.delay > 0 and i < len(game_links):
            time.sleep(args.delay)

    # Deduplicate by game_url (paranoia)
    dedup: dict[str, dict] = {}
    for r in rows:
        u = r.get("game_url", "")
        if u:
            dedup[u] = r

    final_rows = list(dedup.values())
    write_csv(args.out, final_rows)

    print(f"✅ Wrote {len(final_rows)} games to: {args.out}")


if __name__ == "__main__":
    main()
