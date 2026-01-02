import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { loadStandings } from "@/lib/standings";
import fs from "fs";
import path from "path";
import { SortableStandingsTable } from "@/components/standings/SortableStandingsTable";

const LOGO_DIR = path.join(process.cwd(), "public", "logos");

function teamSlug(team: string) {
  return team
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resolveLogoPath(slug: string) {
  const svgPath = `/logos/${slug}.svg`;
  const pngPath = `/logos/${slug}.png`;
  if (fs.existsSync(path.join(LOGO_DIR, `${slug}.svg`))) {
    return svgPath;
  }
  if (fs.existsSync(path.join(LOGO_DIR, `${slug}.png`))) {
    return pngPath;
  }
  return svgPath;
}

export const metadata = {
  title: "Standings | Lakeshore HL Game Hub",
  description: "Up-to-date U14 AA standings with wins, losses, goals, and streaks.",
};

export default async function StandingsPage() {
  const standings = await loadStandings();
  const logoMap: Record<string, string> = {};
  standings.forEach((row) => {
    const slug = teamSlug(row.team);
    logoMap[row.team] = resolveLogoPath(slug);
  });
  const updatedAt = standings[0]?.scraped_at;

  return (
    <main className="min-h-screen bg-gradient-to-b from-muted/40 to-background">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <header className="mb-8 flex flex-col gap-2">
          <h1 className="text-4xl font-bold tracking-tight">Standings</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Sorted by points, these standings give you the clearest view of the current
            U14 AA season along with rolling streak and goal data.
          </p>
        </header>

        <Card className="border-muted/60 shadow-lg shadow-black/5">
          <CardHeader className="pb-3 pt-4 sm:pt-3" />

          <CardContent className="space-y-4 pt-0">
            <SortableStandingsTable standings={standings} teamLogos={logoMap} />
            <div className="flex justify-end gap-2 text-xs text-muted-foreground items-center">
              <Badge variant="secondary" className="text-xs uppercase tracking-widest">
                Last updated
              </Badge>
              <span>
                {updatedAt ? new Date(updatedAt).toLocaleString() : "Awaiting data"}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
