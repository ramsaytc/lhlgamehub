import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

type Game = {
  home?: string;
  away?: string;
};

function safeReadGames(): Game[] {
  const dataPath = path.join(process.cwd(), "data", "games.json");
  const raw = fs.readFileSync(dataPath, "utf8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

function normalizeName(name: string) {
  return name.replace(/\s+/g, " ").trim();
}

export async function GET() {
  const games = safeReadGames();
  const set = new Set<string>();

  for (const g of games) {
    if (g.home) set.add(normalizeName(g.home));
    if (g.away) set.add(normalizeName(g.away));
  }

  const teams = Array.from(set).sort((a, b) => a.localeCompare(b));

  return NextResponse.json({ teams });
}
