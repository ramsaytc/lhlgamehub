import { promises as fs } from "fs";
import path from "path";

const STANDINGS_CSV =
  process.env.STANDINGS_CSV_PATH ||
  path.join(process.cwd(), "exports", "2025-2026_u14aa_standings.csv");

export type StandingRow = {
  scraped_at: string;
  team: string;
  gp: string;
  w: string;
  l: string;
  t: string;
  pts: string;
  gf: string;
  ga: string;
  l10: string;
  strk: string;
};

function parseRow(columns: string[], indexOf: (column: string) => number): StandingRow {
  const getValue = (col: string) => columns[indexOf(col)]?.trim() ?? "";
  return {
    scraped_at: getValue("scraped_at"),
    team: getValue("team"),
    gp: getValue("gp"),
    w: getValue("w"),
    l: getValue("l"),
    t: getValue("t"),
    pts: getValue("pts"),
    gf: getValue("gf"),
    ga: getValue("ga"),
    l10: getValue("l10"),
    strk: getValue("strk"),
  };
}

export async function loadStandings(): Promise<StandingRow[]> {
  try {
    const raw = await fs.readFile(STANDINGS_CSV, "utf-8");
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length <= 1) return [];

    const headers = lines[0]
      .split(",")
      .map((value) => value.trim().toLowerCase());

    const indexOf = (column: string) => headers.indexOf(column);

    return lines.slice(1).map((line) => parseRow(line.split(","), indexOf));
  } catch (error) {
    console.error("Unable to read standings CSV:", error);
    return [];
  }
}
