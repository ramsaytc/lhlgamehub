import { promises as fs } from "fs";
import path from "path";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Image from "next/image";
import Link from "next/link";

const TEAM_COLORS: Record<string, string> = {
  "Clarington Toros": "#ac172b",
  "Kingston Canadians": "#ed1c24",
  "Quinte West Hawks": "#b5975a",
  "North Durham Warriors": "#f05322",
  "Oshawa Generals": "#e31736",
  "Peterborough Petes": "#76283e",
  "Ajax-Pickering Raiders": "#c00001",
  "Belleville Bulls": "#ffd658",
  "Whitby Wildcats": "#f3ae23",
  "Northumberland Nighthawks": "#1e428a",
};

function teamColor(team: string) {
  return TEAM_COLORS[team] || "#d4d4d8";
}

function teamSlug(team: string) {
  return team
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function TeamLogo({ team }: { team: string }) {
  const slug = teamSlug(team);
  return (
    <div
      className="relative h-9 w-9 flex-shrink-0 overflow-hidden rounded-full border"
      style={{ borderColor: teamColor(team) }}
    >
      <Image
        src={`/logos/${slug}.svg`}
        alt={`${team} logo`}
        fill
        sizes="36px"
        className="object-cover"
      />
    </div>
  );
}

const STANDINGS_CSV =
  process.env.STANDINGS_CSV_PATH ||
  path.join(process.cwd(), "exports", "2025-2026_u14aa_standings.csv");

type StandingRow = {
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

async function loadStandings(): Promise<StandingRow[]> {
  try {
    const raw = await fs.readFile(STANDINGS_CSV, "utf-8");
    const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length <= 1) return [];

    const headers = lines[0]
      .split(",")
      .map((value) => value.trim().toLowerCase());

    const indexOf = (column: string) => headers.indexOf(column);

    return lines.slice(1).map((line) => {
      const columns = line.split(",");
      return {
        scraped_at: columns[indexOf("scraped_at")]?.trim() ?? "",
        team: columns[indexOf("team")]?.trim() ?? "",
        gp: columns[indexOf("gp")]?.trim() ?? "",
        w: columns[indexOf("w")]?.trim() ?? "",
        l: columns[indexOf("l")]?.trim() ?? "",
        t: columns[indexOf("t")]?.trim() ?? "",
        pts: columns[indexOf("pts")]?.trim() ?? "",
        gf: columns[indexOf("gf")]?.trim() ?? "",
        ga: columns[indexOf("ga")]?.trim() ?? "",
        l10: columns[indexOf("l10")]?.trim() ?? "",
        strk: columns[indexOf("strk")]?.trim() ?? "",
      };
    });
  } catch (error) {
    console.error("Unable to read standings CSV:", error);
    return [];
  }
}

export const metadata = {
  title: "Standings | Lakeshore HL Game Hub",
  description: "Up-to-date U14 AA standings with wins, losses, goals, and streaks.",
};

export default async function StandingsPage() {
  const standings = await loadStandings();
  const updatedAt = standings[0]?.scraped_at;

  return (
    <main className="min-h-screen bg-gradient-to-b from-muted/40 to-background">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <header className="mb-6 flex flex-col gap-2">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground">
            Lakeshore HL • U14 AA
          </p>
          <h1 className="text-4xl font-bold tracking-tight">League Standings</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Sorted by points, these standings give you the clearest view of the current
            U14 AA season along with rolling streak and goal data.
          </p>
        </header>

        <Card className="border-muted/60 shadow-lg shadow-black/5">
          <CardHeader className="pb-3 pt-4 sm:pt-3">
            <div className="flex justify-between">
              <span></span>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs uppercase tracking-widest">
                  Last updated
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {updatedAt ? new Date(updatedAt).toLocaleString() : "Awaiting data"}
                </span>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4 pt-0">
            <div className="overflow-x-auto rounded-xl border border-muted/60">
              <table className="w-full divide-y divide-muted/40 text-sm">
                <thead className="sticky top-0 bg-gradient-to-r from-muted/30 via-muted/20 to-muted/0">
                  <tr className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                    <th className="p-3 text-left font-semibold">Team</th>
                    <th className="p-3 text-right">GP</th>
                    <th className="p-3 text-right">W</th>
                    <th className="p-3 text-right">L</th>
                    <th className="p-3 text-right">T</th>
                    <th className="p-3 text-right">PTS</th>
                    <th className="p-3 text-right">GF</th>
                    <th className="p-3 text-right">GA</th>
                    <th className="p-3 text-right">L10</th>
                    <th className="p-3 text-right">STRK</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((row, idx) => (
                    <tr
                      key={`${row.team}-${row.scraped_at}-${idx}`}
                      className={idx % 2 ? "bg-muted/5" : undefined}
                    >
                      <td className="max-w-[220px] px-3 py-2">
                        <div className="flex items-center gap-3">
                          <TeamLogo team={row.team} />
                          <div className="flex max-w-[140px] flex-col text-left leading-tight">
                            <Link
                              className="font-semibold text-foreground"
                              href={`/?team=${encodeURIComponent(row.team)}`}
                            >
                              {row.team}
                            </Link>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">{row.gp}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.w}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.l}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.t}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{row.pts}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.gf}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.ga}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.l10}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.strk || "—"}</td>
                    </tr>
                  ))}
                  {standings.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-6 text-center text-sm text-muted-foreground">
                        Standings are being generated. Run the scraper to populate them.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
