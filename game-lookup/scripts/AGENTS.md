# Repository Guidelines

## Project Structure & Module Organization
- `game-lookup/` is the Next.js app (TypeScript, Tailwind, App Router).
- Routes and API handlers live in `game-lookup/src/app/` (e.g., `api/games/route.ts`).
- Reusable UI and feature components are in `game-lookup/src/components/`.
- Shared utilities are in `game-lookup/src/lib/`.
- Static assets live in `game-lookup/public/`.
- Data pipeline artifacts are split by stage: raw CSV in `game-lookup/exports/`, combined CSV/JSON in `game-lookup/data/`, and logs in `game-lookup/logs/`.
- Python scrapers and helpers live in `game-lookup/*.py`; data conversion scripts are in `game-lookup/scripts/`.

## Build, Test, and Development Commands
Run commands from `game-lookup/` unless noted.
- `npm run dev`: start the local dev server at `http://localhost:3000`.
- `npm run build`: build the production bundle.
- `npm run start`: run the production server after `build`.
- `npm run lint`: run ESLint with `eslint-config-next`.
- `./scripts/update_data.sh 2025-11 2025-12`: scrape, normalize, and regenerate `data/combined.csv` and `data/games.json`.

## Coding Style & Naming Conventions
- TypeScript/React with Next.js App Router; follow existing patterns in `game-lookup/src/app/`.
- React components use PascalCase; API route files are named `route.ts`.
- Prefer Tailwind utility classes; CSS modules live in `game-lookup/src/app/*.module.css`.
- No repo-wide formatter; keep diffs minimal and consistent with surrounding code.

## Testing Guidelines
- No automated test framework is configured yet.
- If adding tests, colocate them near the feature (e.g., `game-lookup/src/components/...`) and document how to run them in your PR.

## Commit & Pull Request Guidelines
- Commit messages are short and descriptive; the `fix:` prefix appears in history.
- Automated data updates use `Automated game-lookup data update (YYYY-MM-DD HH:MM UTC)`.
- PRs should include a brief summary, key changes, and screenshots for UI updates; link related issues when applicable.

## Security & Configuration Tips
- Scraping configuration is driven by environment variables in `game-lookup/scripts/update_data.sh`
  (e.g., `SEASON_START_YEAR`, `STANDINGS_URL`).
- Keep scraped outputs in `game-lookup/exports/` and derived data in `game-lookup/data/`.
