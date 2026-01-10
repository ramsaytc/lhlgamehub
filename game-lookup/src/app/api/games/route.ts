import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

type Game = {
  game_url?: string;
  date_text?: string;
  time?: string;
  game_date_iso?: string; // ✅ from your combined/sorted CSV
  away?: string;
  home?: string;
  away_score?: string;
  home_score?: string;
  venue?: string;
  game_code?: string;
  scraped_at?: string;
};

function safeReadGames(): Game[] {
  const dataPath = path.join(process.cwd(), "data", "games.json");
  const raw = fs.readFileSync(dataPath, "utf8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

function sortGamesAsc(games: Game[]) {
  // Sort by ISO date (then time as tie-breaker)
  return games.sort((a, b) => {
    const ad = (a.game_date_iso || "").trim();
    const bd = (b.game_date_iso || "").trim();

    // Missing dates at end
    if (!ad && !bd) return 0;
    if (!ad) return 1;
    if (!bd) return -1;

    if (ad !== bd) return ad.localeCompare(bd);

    const at = (a.time || "").trim();
    const bt = (b.time || "").trim();
    return at.localeCompare(bt);
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const team = (url.searchParams.get("team") || "").trim();
  const all = (url.searchParams.get("all") || "").trim();

  let games = safeReadGames();

  if (all === "1") {
    // return everything
  } else if (team) {
    const q = team.toLowerCase();
    games = games.filter((g) => {
      const away = (g.away || "").toLowerCase();
      const home = (g.home || "").toLowerCase();
      // substring match
      return away.includes(q) || home.includes(q);
    });
  } else {
    games = [];
  }

  sortGamesAsc(games);

  // Find the most recent scraped_at timestamp
  const lastUpdated = games.reduce((latest, g) => {
    if (!g.scraped_at) return latest;
    return !latest || g.scraped_at > latest ? g.scraped_at : latest;
  }, "" as string);

  return NextResponse.json({ games, lastUpdated: lastUpdated || null });
}
