"use client";

import * as React from "react";
import Image from "next/image";
import {
  Search,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

import type { StandingRow } from "@/lib/standings";



/* -------------------- Team colours (dots only) -------------------- */

const TEAM_NICKNAMES: Record<string, string> = {
  "Oshawa Generals": "Generals",
  "Clarington Toros": "Toros",
  "North Durham Warriors": "Warriors",
  "Whitby Wildcats": "Wildcats",
  "Ajax-Pickering Raiders": "Raiders",
  "Belleville Bulls": "Bulls",
  "Kingston Canadians": "Canadians",
  "Peterborough Petes": "Petes",
  "Northumberland Nighthawks": "Nighthawks",
  "Quinte West Hawks": "Hawks",
};

const TEAM_LOGOS: Record<string, string> = {
  "Oshawa Generals": "/logos/oshawa-generals.svg",
  "Clarington Toros": "/logos/clarington-toros.svg",
  "North Durham Warriors": "/logos/north-durham-warriors.svg",
  "Whitby Wildcats": "/logos/whitby-wildcats.png",
  "Ajax-Pickering Raiders": "/logos/ajax-pickering-raiders.png",
  "Belleville Bulls": "/logos/belleville-bulls.svg",
  "Kingston Canadians": "/logos/kingston-canadians.svg",
  "Peterborough Petes": "/logos/peterborough-petes.png",
  "Northumberland Nighthawks": "/logos/northumberland-nighthawks.svg",
  "Quinte West Hawks": "/logos/quinte-west-hawks.svg",
};

type Game = {
  date_text?: string;
  time?: string;
  game_date_iso?: string;
  away?: string;
  away_score?: string;
  home?: string;
  home_score?: string;
  game_code?: string;
  venue?: string;
  game_url?: string;
};

function isPlayed(g: Game) {
  return (g.away_score || "").trim() !== "" && (g.home_score || "").trim() !== "";
}

function parseScoreValue(score?: string) {
  const value = (score || "").trim();
  if (!value) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function HighlightMatch({ label, query }: { label: string; query: string }) {
  const q = query.trim();
  if (!q) return <span className="text-foreground">{label}</span>;

  const lowerLabel = label.toLowerCase();
  const lowerQ = q.toLowerCase();
  const idx = lowerLabel.indexOf(lowerQ);

  if (idx === -1) return <span className="text-foreground">{label}</span>;

  const before = label.slice(0, idx);
  const match = label.slice(idx, idx + q.length);
  const after = label.slice(idx + q.length);

  return (
    <span className="text-foreground">
      {before}
      <span className="font-semibold">{match}</span>
      {after}
    </span>
  );
}

/** -------- Default browse behavior -------- */
const DEFAULT_UPCOMING_DAYS = 14;

function startOfTodayLocal(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseIsoDateLocal(iso?: string): Date | null {
  if (!iso) return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const da = Number(m[3]);
  return new Date(y, mo, da);
}

function withinNextDays(date: Date, days: number) {
  const start = startOfTodayLocal().getTime();
  const end = start + days * 24 * 60 * 60 * 1000;
  const t = date.getTime();
  return t >= start && t < end;
}

export default function Home() {

  /** -------- App state -------- */
  const [teams, setTeams] = React.useState<string[]>([]);
  const [loadingTeams, setLoadingTeams] = React.useState(true);

  const [query, setQuery] = React.useState("");
  const [openSuggest, setOpenSuggest] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(-1);

  const [allGames, setAllGames] = React.useState<Game[]>([]);
  const [games, setGames] = React.useState<Game[]>([]);
  const [loadingGames, setLoadingGames] = React.useState(false);
  const [teamRecords, setTeamRecords] = React.useState<Record<string, StandingRow>>({});

  const [view, setView] = React.useState<"all" | "played" | "upcoming">(
    "upcoming"
  );
  const [sortNewestFirst, setSortNewestFirst] = React.useState(false);

  const boxRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const [isMobileView, setIsMobileView] = React.useState(false);

  const lastSearchedRef = React.useRef<string>("");

  // Load teams
  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/teams");
        const data = await res.json();
        setTeams(Array.isArray(data.teams) ? data.teams : []);
      } finally {
        setLoadingTeams(false);
      }
    })();
  }, []);

  // Load ALL games on first visit
  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/games?all=1");
        const data = await res.json();
        setAllGames(Array.isArray(data.games) ? data.games : []);
      } catch {
        setAllGames([]);
      }
    })();
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/standings");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const rows: StandingRow[] = Array.isArray(data.standings)
          ? data.standings
          : [];
        const map: Record<string, StandingRow> = {};
        rows.forEach((row) => {
          const key = row.team?.trim();
          if (key) map[key] = row;
        });
        if (!cancelled) {
          setTeamRecords(map);
        }
      } catch (error) {
        console.error("Unable to load standings for records:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const query = "(max-width: 639px)";
    const mql = window.matchMedia(query);
    const update = () => setIsMobileView(mql.matches);
    update();
    try {
      mql.addEventListener("change", update);
      return () => mql.removeEventListener("change", update);
    } catch {
      mql.addListener(update);
      return () => mql.removeListener(update);
    }
  }, []);

  function formatRecord(row?: StandingRow) {
    if (!row) return null;
    const w = row.w?.trim() || "0";
    const l = row.l?.trim() || "0";
    const t = row.t?.trim() || "0";
    return `${w}-${l}-${t}`;
  }

  function recordFor(team?: string) {
    if (!team) return null;
    const key = team.trim();
    if (!key) return null;
    return formatRecord(teamRecords[key]);
  }

  function stripDayOfWeek(value?: string) {
    if (!value) return "";
    const cleaned = value.replace(/\s*\([^)]*\)/g, "").trim();
    return cleaned || value;
  }

  function formatLocalDateLabel(iso?: string) {
    const parsed = parseIsoDateLocal(iso);
    if (!parsed) return "";
    return parsed.toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
    });
  }

  // Close dropdown on outside click
  React.useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) {
        setOpenSuggest(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // When query is cleared, go back to default view
  React.useEffect(() => {
    if (!query.trim()) {
      setView("upcoming");
      setGames([]);
      lastSearchedRef.current = "";
    }
  }, [query]);

  const search = React.useCallback(async (teamText?: string) => {
    const q = (teamText ?? query).trim();
    if (!q) return;

    if (lastSearchedRef.current.toLowerCase() === q.toLowerCase()) return;
    lastSearchedRef.current = q;

    setLoadingGames(true);
    try {
      const res = await fetch(`/api/games?team=${encodeURIComponent(q)}`);
      const data = await res.json();
      setGames(Array.isArray(data.games) ? data.games : []);
    } finally {
      setLoadingGames(false);
    }
  }, [query]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const teamParam = params.get("team")?.trim();
    if (!teamParam) return;
    setQuery(teamParam);
    search(teamParam);
  }, [search]);

  const suggestions = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return teams.slice(0, 20);
    return teams.filter((t) => t.toLowerCase().includes(q)).slice(0, 20);
  }, [teams, query]);

  React.useEffect(() => {
    if (!openSuggest || suggestions.length === 0) {
      setActiveIndex(-1);
      return;
    }
    setActiveIndex((i) => (i < 0 ? 0 : Math.min(i, suggestions.length - 1)));
  }, [suggestions, openSuggest]);

  React.useEffect(() => {
    if (!listRef.current || activeIndex < 0) return;
    listRef.current
      .querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function chooseTeam(t: string, options?: { focusInput?: boolean }) {
    const focusInput = options?.focusInput ?? true;
    setQuery(t);
    setOpenSuggest(false);
    setActiveIndex(-1);
    lastSearchedRef.current = "";
    search(t);
    if (focusInput) inputRef.current?.focus();
  }

  function chooseTeamFromCard(t: string) {
    setQuery(t);
    setOpenSuggest(false);
    setActiveIndex(-1);
    lastSearchedRef.current = "";
    search(t);
  }

  // Debounced auto-search while typing
  React.useEffect(() => {
    const q = query.trim();
    if (!q) return;
    if (q.length < 2) return;

    const handle = window.setTimeout(() => search(q), 350);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Base dataset
  const baseGames = query.trim() ? games : allGames;

  const orderByPreference = React.useCallback(
    (list: Game[]) => (sortNewestFirst ? [...list].reverse() : list),
    [sortNewestFirst]
  );

  // Default upcoming (browse mode): next 14 days, unplayed
  const defaultUpcoming = React.useMemo(() => {
    const today = startOfTodayLocal();
    return baseGames.filter((g) => {
      if (isPlayed(g)) return false;
      const d = parseIsoDateLocal(g.game_date_iso);
      if (!d) return true;
      return withinNextDays(d, DEFAULT_UPCOMING_DAYS) && d >= today;
    });
  }, [baseGames]);

  const playedGames = baseGames.filter(isPlayed);

  // Upcoming definition changes when searching vs browsing
  const upcomingGames = query.trim()
    ? baseGames.filter((g) => !isPlayed(g))
    : defaultUpcoming;

  const visibleGames =
    view === "played"
      ? orderByPreference(playedGames)
      : view === "upcoming"
      ? orderByPreference(upcomingGames)
      : orderByPreference(baseGames);

  const viewLabel =
    view === "played"
      ? "played games"
      : view === "upcoming"
      ? "upcoming games"
      : "all games";

  const allowSorting = true;
  const sortDirectionText = allowSorting
    ? sortNewestFirst
      ? "newest to oldest"
      : "oldest to newest"
    : "oldest to newest";
  const toggleLabel = sortNewestFirst ? "Show oldest first" : "Show newest first";

  function TeamLabelDesktop({ team }: { team?: string }) {
    if (!team) return null;
    const logoSrc = TEAM_LOGOS[team];
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        {logoSrc ? (
          <div className="flex h-48 w-48 items-center justify-center">
            <Image
              src={logoSrc}
              alt={`${team} logo`}
              width={192}
              height={192}
              className="h-48 w-48 object-contain"
            />
          </div>
        ) : null}
        <span className="text-sm font-semibold leading-tight">{team}</span>
      </div>
    );
  }

  function TeamLabelMobile({
    name,
    record,
  }: {
    name?: string;
    record?: string;
  }) {
    if (!name) return null;
    const nickname = TEAM_NICKNAMES[name] || name;
    const logoSrc = TEAM_LOGOS[name];
    return (
      <button
        type="button"
        className="flex w-full max-w-[160px] flex-col items-center gap-1 border-0 bg-transparent p-0 text-center cursor-pointer hover:opacity-90"
        onClick={(e) => {
          e.stopPropagation();
          chooseTeamFromCard(name);
        }}
      >
        {logoSrc ? (
          <Image
            src={logoSrc}
            alt={`${name} logo`}
            loading="lazy"
            width={64}
            height={64}
            className="h-16 w-16 object-contain"
          />
        ) : null}
        <span className="sr-only">{nickname}</span>
        {record ? (
          <span className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
            {record}
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-muted/40 to-background">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <header className="mb-8 flex flex-col gap-2">
          <h1 className="text-4xl font-bold tracking-tight">Game Scores</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Search for a team, or browse upcoming games by default.
          </p>
        </header>

        <Card className="border-muted/60 shadow-lg shadow-black/5">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end">
              <CardTitle className="text-lg">Search</CardTitle>
            </div>
          </CardHeader>

          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:max-w-4xl sm:mx-auto">
            <div ref={boxRef} className="relative w-full sm:w-[560px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={inputRef}
                  value={query}
                  placeholder={loadingTeams ? "Loading teams..." : "Search team… (type 2+ letters)"}
                  disabled={loadingTeams}
                  className="h-11 pl-9"
                  onFocus={() => setOpenSuggest(true)}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setOpenSuggest(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setOpenSuggest(false);
                      setActiveIndex(-1);
                    }
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
                    }
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setActiveIndex((i) => Math.max(i - 1, 0));
                    }
                    if (e.key === "Enter") {
                      if (openSuggest && activeIndex >= 0 && activeIndex < suggestions.length) {
                        chooseTeam(suggestions[activeIndex]);
                      } else {
                        lastSearchedRef.current = "";
                        search(query);
                      }
                    }
                  }}
                />
              </div>

              {openSuggest && !loadingTeams ? (
                <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border bg-popover shadow-xl shadow-black/10">
                  <Command>
                    <CommandList ref={listRef} className="max-h-64 overflow-auto">
                      {suggestions.length === 0 ? (
                        <CommandEmpty className="px-4 py-3 text-sm text-muted-foreground">
                          No teams match.
                        </CommandEmpty>
                      ) : (
                        <CommandGroup>
                          {suggestions.map((t, idx) => (
                            <CommandItem
                              key={t}
                              value={t}
                              data-index={idx}
                              onMouseEnter={() => setActiveIndex(idx)}
                              onSelect={() => chooseTeam(t)}
                              className={idx === activeIndex ? "bg-accent" : undefined}
                            >
                              <HighlightMatch label={t} query={query} />
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      )}
                    </CommandList>
                  </Command>
                </div>
              ) : null}

              <div className="mt-2 text-xs text-muted-foreground">
                Default: upcoming next {DEFAULT_UPCOMING_DAYS} days • ↑/↓ + Enter to select.
              </div>
            </div>

            <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
              <div className="flex gap-2">
                <Button
                  className="h-11"
                  onClick={() => {
                    lastSearchedRef.current = "";
                    search(query);
                  }}
                  disabled={!query.trim() || loadingGames}
                >
                  {loadingGames ? "Searching…" : "Search"}
                </Button>

                <Button
                  variant="ghost"
                  className="h-11"
                  onClick={() => {
                    setQuery("");
                    setOpenSuggest(false);
                    setActiveIndex(-1);
                    inputRef.current?.blur();
                  }}
                  disabled={loadingGames}
                >
                  <X className="mr-2 h-4 w-4" />
                  Clear
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Tabs
              value={view}
              onValueChange={(value) => {
                if (value === "upcoming" || value === "played" || value === "all") {
                  setView(value);
                }
              }}
            >
              <TabsList className="rounded-xl">
                <TabsTrigger value="upcoming">Upcoming ({upcomingGames.length})</TabsTrigger>
                <TabsTrigger value="played">Played ({playedGames.length})</TabsTrigger>
                <TabsTrigger value="all">All ({baseGames.length})</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="text-xs text-muted-foreground">
              {allowSorting && (
                <button
                  type="button"
                  onClick={() => setSortNewestFirst((prev) => !prev)}
                  className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                  aria-label={`Sort by date: ${sortDirectionText}`}
                >
                  {toggleLabel}
                </button>
              )}
            </div>
          </div>
        </div>

        <section className="mt-4 grid gap-3" aria-label={viewLabel}>
          {loadingGames ? (
            <Card className="border-muted/60">
              <CardContent className="py-10 text-sm text-muted-foreground">
                Loading games…
              </CardContent>
            </Card>
          ) : visibleGames.length === 0 ? (
            <Card className="border-muted/60">
              <CardContent className="py-10 text-sm text-muted-foreground">
                No games found for this view.
              </CardContent>
            </Card>
          ) : (
            visibleGames.map((g, idx) => {
              const awayScoreValue = parseScoreValue(g.away_score);
              const homeScoreValue = parseScoreValue(g.home_score);
              const played = isPlayed(g);
              const winner =
                played && awayScoreValue !== null && homeScoreValue !== null
                  ? awayScoreValue > homeScoreValue
                    ? "away"
                    : awayScoreValue < homeScoreValue
                    ? "home"
                    : "tie"
                  : null;
              const awayScoreClass =
                winner === "home" ? "text-muted-foreground" : "text-foreground";
              const homeScoreClass =
                winner === "away" ? "text-muted-foreground" : "text-foreground";
              const awayRecord = !played ? recordFor(g.away) : null;
              const homeRecord = !played ? recordFor(g.home) : null;
              const canOpenGamePage = isMobileView && !!g.game_url;
              const mobileDateText =
                stripDayOfWeek(g.date_text) ||
                formatLocalDateLabel(g.game_date_iso) ||
                g.date_text;
              const handleCardClick = () => {
                if (!canOpenGamePage) return;
                window.open(g.game_url, "_blank", "noreferrer");
              };
              const handleCardKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
                if (!canOpenGamePage) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  window.open(g.game_url, "_blank", "noreferrer");
                }
              };
              return (
                <Card
                  key={g.game_url || idx}
                  className={`border-muted/60 transition-shadow hover:shadow-md hover:shadow-black/5 ${
                    canOpenGamePage ? "cursor-pointer" : ""
                  }`}
                >
                  <CardContent
                    className="py-4"
                    role={canOpenGamePage ? "link" : undefined}
                    tabIndex={canOpenGamePage ? 0 : undefined}
                    aria-label={
                      canOpenGamePage ? "Open the game page in a new tab" : undefined
                    }
                    onClick={handleCardClick}
                    onKeyDown={handleCardKeyDown}
                  >
                    <div className="mx-auto max-w-4xl">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
                            <div className="hidden sm:flex flex-col gap-3">
                              <div className="flex items-center justify-between gap-8">
                                <div className="flex-1 flex justify-start">
                                  <TeamLabelDesktop team={g.away} />
                                </div>
                                <div className="flex-1 max-w-lg flex flex-col items-center justify-center gap-2 text-center">
                                  {played ? (
                                    <div className="flex items-baseline gap-1 text-2xl font-semibold tabular-nums">
                                      <span className={awayScoreClass}>
                                        {awayScoreValue ?? "-"}
                                      </span>
                                      <span className="text-2xl font-semibold text-muted-foreground">
                                        -
                                      </span>
                                      <span className={homeScoreClass}>
                                        {homeScoreValue ?? "-"}
                                      </span>
                                    </div>
                                  ) : (
                                    <div className="flex flex-col items-center gap-0.5 text-sm text-muted-foreground">
                                      <span className="text-[11px] font-semibold tabular-nums">
                                        {g.time || "TBD"}
                                      </span>
                                      <span className="uppercase tracking-[0.08em] text-[11px]">
                                        {mobileDateText || "DATE TBD"}
                                      </span>
                                    </div>
                                  )}
                                  {played && canOpenGamePage ? (
                                    <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                                      GAME PAGE
                                    </span>
                                  ) : null}
                                  {played ? (
                                    <div className="flex flex-col items-center gap-0.5 text-sm text-muted-foreground">
                                      <span className="uppercase tracking-[0.08em] text-[11px] text-muted-foreground">
                                        {mobileDateText || "DATE TBD"}
                                      </span>
                                    </div>
                                  ) : null}
                                  {g.game_url ? (
                                    <a
                                      className="text-sm underline underline-offset-4 hover:opacity-80"
                                      href={g.game_url}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      Game page
                                    </a>
                                  ) : null}
                                </div>
                                <div className="flex-1 flex justify-end">
                                  <TeamLabelDesktop team={g.home} />
                                </div>
                              </div>
                            </div>
                            <div className="w-full sm:hidden">
                              <div className="flex items-center justify-between gap-4">
                                <div className="flex flex-1 justify-start items-center">
                                  <TeamLabelMobile
                                    name={g.away}
                                    record={awayRecord ?? undefined}
                                  />
                                </div>
                                <div className="flex flex-1 flex-col items-center justify-center gap-1">
                                  {played ? (
                                    <div className="flex items-baseline gap-1 text-2xl font-semibold tabular-nums">
                                      <span className={awayScoreClass}>
                                        {awayScoreValue ?? "-"}
                                      </span>
                                      <span className="text-2xl font-semibold text-muted-foreground">
                                        -
                                      </span>
                                      <span className={homeScoreClass}>
                                        {homeScoreValue ?? "-"}
                                      </span>
                                    </div>
                                  ) : (
                                    <div className="flex flex-col items-center gap-0.5 text-sm text-muted-foreground">
                                      <span className="text-[11px] font-semibold tabular-nums">
                                        {g.time || "TBD"}
                                      </span>
                                      <span className="uppercase tracking-[0.08em] text-[11px]">
                                        {mobileDateText || "DATE TBD"}
                                      </span>
                                    </div>
                                  )}
                                  {played ? (
                                    <span className="uppercase tracking-[0.08em] text-[11px] text-muted-foreground">
                                      {mobileDateText || "DATE TBD"}
                                    </span>
                                  ) : null}
                                  {played && canOpenGamePage ? (
                                    <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                                      GAME PAGE
                                    </span>
                                  ) : null}
                                </div>
                                <div className="flex flex-1 justify-end items-center">
                                  <TeamLabelMobile
                                    name={g.home}
                                    record={homeRecord ?? undefined}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </section>
      </div>
    </main>
  );
}
