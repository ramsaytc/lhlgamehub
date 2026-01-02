"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";

import type { StandingRow } from "@/lib/standings";

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

function TeamLogo({ team, logo }: { team: string; logo?: string }) {
  const src = logo || `/logos/${teamSlug(team)}.svg`;
  return (
    <div
      className="relative h-9 w-9 flex-shrink-0 overflow-hidden rounded-full border"
      style={{ borderColor: teamColor(team) }}
    >
      <Image
        src={src}
        alt={`${team} logo`}
        fill
        sizes="36px"
        className="object-cover"
      />
    </div>
  );
}

type SortKey = "gp" | "w" | "l" | "t" | "pts" | "gf" | "ga" | "l10" | "strk";

const columns: { label: string; key: SortKey }[] = [
  { label: "GP", key: "gp" },
  { label: "W", key: "w" },
  { label: "L", key: "l" },
  { label: "T", key: "t" },
  { label: "PTS", key: "pts" },
  { label: "GF", key: "gf" },
  { label: "GA", key: "ga" },
  { label: "L10", key: "l10" },
  { label: "STRK", key: "strk" },
];

const parseValue = (value?: string) => {
  if (!value) return "";
  const num = Number(value);
  if (Number.isFinite(num)) return num;
  return value.toLowerCase();
};

const compare =
  (direction: "asc" | "desc", key: SortKey) =>
  (a: StandingRow, b: StandingRow) => {
    const va = parseValue(a[key]);
    const vb = parseValue(b[key]);
    if (typeof va === "number" && typeof vb === "number") {
      return direction === "asc" ? va - vb : vb - va;
    }
    if (va === vb) return 0;
    return direction === "asc"
      ? String(va) < String(vb)
        ? -1
        : 1
      : String(va) < String(vb)
      ? 1
      : -1;
  };

type Props = {
  standings: StandingRow[];
  teamLogos: Record<string, string>;
};

export function SortableStandingsTable({ standings, teamLogos }: Props) {
  const [sortKey, setSortKey] = React.useState<SortKey>("pts");
  const [direction, setDirection] = React.useState<"asc" | "desc">("desc");

  const rows = React.useMemo(() => {
    return [...standings].sort(compare(direction, sortKey));
  }, [standings, direction, sortKey]);

  const toggleSort = (key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setDirection((dir) => (dir === "asc" ? "desc" : "asc"));
        return prev;
      }
      setDirection("desc");
      return key;
    });
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-muted/60 bg-background/90 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]">
      <table className="w-full divide-y divide-muted/40 text-sm">
        <thead className="sticky top-0 bg-muted/80 text-muted-foreground shadow-[inset_0_-1px_0_rgba(15,23,42,0.35)]">
          <tr className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            <th className="p-3 text-left font-semibold bg-background/70 sticky left-0 z-10 shadow-none border-b-0 border-t-0 sm:bg-transparent sm:static">
              <span className="sr-only">Logo</span>
            </th>
            <th className="p-3 text-left font-semibold">Team</th>
            {columns.map((col) => (
              <th key={col.key} className="p-3 text-right">
                <button
                  type="button"
                  className="flex items-center justify-end gap-1 text-[10px] uppercase tracking-[0.3em] text-muted-foreground"
                  onClick={() => toggleSort(col.key)}
                >
                  {col.label}
                  {sortKey === col.key ? (direction === "asc" ? "▲" : "▼") : null}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr
              key={`${row.team}-${row.scraped_at}-${idx}`}
              className={`border-b border-muted/30 ${
                idx % 2 ? "bg-muted/10" : "bg-muted/5"
              } hover:bg-muted/20 transition-colors`}
            >
              <td className="px-3 py-2 bg-background/70 sticky left-0 z-0 border-b-0 border-t-0 shadow-none sm:bg-transparent sm:border-none sm:static">
                <TeamLogo team={row.team} logo={teamLogos[row.team]} />
              </td>
              <td className="max-w-[220px] px-3 py-2">
                <div className="flex max-w-[140px] flex-col text-left leading-tight">
                  <Link
                    className="font-semibold text-foreground"
                    href={`/?team=${encodeURIComponent(row.team)}`}
                  >
                    {row.team}
                  </Link>
                </div>
              </td>
              {columns.map((col) => (
                <td key={col.key} className="px-3 py-2 text-right tabular-nums">
                  {row[col.key] || "—"}
                </td>
              ))}
            </tr>
          ))}
          {standings.length === 0 ? (
            <tr>
              <td colSpan={columns.length + 2} className="p-6 text-center text-sm text-muted-foreground">
                Standings are being generated. Run the scraper to populate them.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
