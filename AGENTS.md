# Repository Guidelines

## Project Structure & Module Organization
- `game-lookup/` contains the Next.js app (TypeScript, Tailwind, App Router).
- `game-lookup/src/app/` holds routes and API handlers (e.g., `api/games/route.ts`).
- `game-lookup/src/components/` contains UI and feature components.
- `game-lookup/src/lib/` contains shared utilities.
- `game-lookup/public/` is for static assets.
- Data pipeline assets live under `game-lookup/exports/` (raw CSV), `game-lookup/data/` (combined CSV/JSON), and `game-lookup/logs/`.
- Python scrapers and helpers live in `game-lookup/*.py`; data conversion scripts are in `game-lookup/scripts/`.

## Build, Test, and Development Commands
Run commands from `game-lookup/` unless noted.
- `npm run dev`: start the Next.js dev server at `http://localhost:3000`.
- `npm run build`: build the production bundle.
- `npm run start`: run the production server after `build`.
- `npm run lint`: run ESLint (uses `eslint-config-next`).
- `./scripts/update_data.sh 2025-11 2025-12`: scrape data, normalize, and regenerate `data/combined.csv` and `data/games.json`.

## Coding Style & Naming Conventions
- TypeScript/React with Next.js App Router; follow existing file patterns in `game-lookup/src/app/`.
- Use PascalCase for React components and `route.ts` for API routes.
- Prefer Tailwind utility classes; CSS modules live in `game-lookup/src/app/*.module.css`.
- Lint with `npm run lint`; there is no repo-wide formatter configured.

## Testing Guidelines
- No automated test framework is configured yet.
- If you add tests, colocate them near the feature (e.g., `game-lookup/src/components/...`) and document how to run them.

## Commit & Pull Request Guidelines
- Commit messages are short and descriptive; `fix:` prefix appears in history.
- Automated data updates use the format `Automated game-lookup data update (YYYY-MM-DD HH:MM UTC)`.
- PRs should include a brief summary, list of key changes, and screenshots for UI changes; link related issues when applicable.

## Security & Configuration Tips
- Scraping config is driven by environment variables in `game-lookup/scripts/update_data.sh` (e.g., `SEASON_START_YEAR`, `STANDINGS_URL`).
- Keep scraped outputs in `game-lookup/exports/` and derived data in `game-lookup/data/`.
