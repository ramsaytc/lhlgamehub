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

# Data pipeline - unified CLI
python3 lhl_data.py update                           # Full pipeline (current + next month)
python3 lhl_data.py update --months 2025-11 2025-12  # Full pipeline with specific months
python3 lhl_data.py scrape-games --months 2025-11    # Scrape games only
python3 lhl_data.py scrape-standings                 # Scrape standings only
python3 lhl_data.py combine                          # Combine CSVs and generate JSON
```

## Architecture

### Data Pipeline (`lhl_data.py`)
Single Python CLI with subcommands:
- **scrape-games** - async fetches game details from LHL website (5 concurrent requests)
- **scrape-standings** - fetches standings table
- **combine** - merges monthly CSVs, dedupes by `game_url`, adds `game_date_iso`, outputs JSON
- **update** - runs full pipeline with change detection

Features:
- Async HTTP fetching with `aiohttp` for faster scraping
- In-memory change detection (no temp files)
- Automatic Toronto timezone handling for default months
- Season year rollover (Oct-Dec = start year, Jan-Mar = start year + 1)

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

CLI arguments for `lhl_data.py`:
- `--months` - specific months to scrape (YYYY-MM format)
- `--season-start-year` - e.g., 2025 for 2025-26 season (default: 2025)
- `--standings-url` - URL to scrape standings from

Python dependencies: `requests`, `beautifulsoup4`, `aiohttp`
