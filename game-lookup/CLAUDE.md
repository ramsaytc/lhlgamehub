# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Game Lookup is a Next.js web app for viewing hockey game scores and standings for Lakeshore Hockey League (LHL). It scrapes game/standings data from the LHL website, stores it in CSV/JSON, and displays it via a client-side React UI.

## Commands

All commands run from the `game-lookup/` directory:

```bash
npm run dev          # Start dev server at http://localhost:3000
npm run build        # Production build
npm run lint         # ESLint check

# Data pipeline - scrape, normalize, and regenerate data files
./scripts/update_data.sh [months...]   # e.g., ./scripts/update_data.sh 2025-11 2025-12

# Individual pipeline steps
python3 month_to_scrape.py --month 11 --year 2025 --out exports/2025-11.csv
python3 standings_to_scrape.py --url <url> exports/standings.csv
python3 combine_dedupe.py exports/*.csv --out data/combined.csv --season-start-year 2025
node scripts/csv_to_json.mjs   # Converts data/combined.csv to data/games.json
```

## Architecture

### Data Pipeline (Python/Bash)
1. **Scrapers** (`month_to_scrape.py`, `standings_to_scrape.py`) - fetch HTML from LHL website, parse game details and standings tables
2. **Combiner** (`combine_dedupe.py`) - merges monthly CSVs, dedupes by `game_url`, adds `game_date_iso` field, handles season year rollover (Oct-Dec = start year, Jan-Mar = start year + 1)
3. **Converter** (`scripts/csv_to_json.mjs`) - converts combined CSV to JSON for the web app
4. **Orchestrator** (`scripts/update_data.sh`) - runs full pipeline with change detection to avoid unnecessary updates

### Data Files
- `exports/*.csv` - raw scraped data per month + standings
- `data/combined.csv` - merged/deduped game data with ISO dates
- `data/games.json` - JSON version consumed by the web app

### Next.js App (TypeScript/React)
- **API Routes** (`src/app/api/`) - read from `data/games.json` and `exports/*_standings.csv`
  - `/api/games?team=X` - filter games by team name substring
  - `/api/games?all=1` - return all games
  - `/api/standings` - return standings table
  - `/api/teams` - return unique team list
- **Main Page** (`src/app/page.tsx`) - client-side SPA with team search, game filtering (played/upcoming/all), sort toggle
- **UI Components** (`src/components/ui/`) - shadcn/ui components (Button, Card, Input, Tabs, Command, etc.)
- **Lib** (`src/lib/standings.ts`) - CSV parsing for standings data

### Key Types
```typescript
type Game = {
  date_text?: string;      // "Dec 03 (Wed)"
  time?: string;           // "5:30 PM"
  game_date_iso?: string;  // "2025-12-03"
  away?: string;           // team name
  home?: string;
  away_score?: string;
  home_score?: string;
  game_code?: string;      // "U14AA-041"
  venue?: string;
  game_url?: string;
};
```

## Configuration

Environment variables (set in `update_data.sh` or override when running):
- `SEASON_START_YEAR` - e.g., 2025 for 2025-26 season
- `STANDINGS_URL` - URL to scrape standings from

Python dependencies: `requests`, `beautifulsoup4`
