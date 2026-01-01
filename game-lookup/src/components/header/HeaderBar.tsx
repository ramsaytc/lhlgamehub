"use client";

import * as React from "react";
import { Laptop, Menu, Moon, Sunrise, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type ThemePref = "system" | "light" | "dark";

function systemIsDark() {
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
}

function applyTheme(pref: ThemePref) {
  const root = document.documentElement;
  const dark = pref === "dark" ? true : pref === "light" ? false : systemIsDark();
  root.classList.toggle("dark", dark);
}

function resolvedTheme(pref: ThemePref): "dark" | "light" {
  return pref === "dark"
    ? "dark"
    : pref === "light"
    ? "light"
    : systemIsDark()
    ? "dark"
    : "light";
}

function setThemeCookie(value: "dark" | "light") {
  document.cookie = `theme=${value}; path=/; max-age=31536000; samesite=lax`;
}

function themeLabel(pref: ThemePref) {
  if (pref === "system") return "System ";
  if (pref === "dark") return "Dark";
  return "Light";
}

function themeIconDesktop(pref: ThemePref) {
  if (pref === "system") return Laptop;
  if (pref === "dark") return Moon;
  return Sun;
}

function themeIconMobile(pref: ThemePref) {
  if (pref === "system") return Sunrise;
  if (pref === "dark") return Moon;
  return Sun;
}

export function HeaderBar() {
  const [themePref, setThemePref] = React.useState<ThemePref>("system");
  const DesktopThemeIcon = themeIconDesktop(themePref);
  const MobileThemeIcon = themeIconMobile(themePref);

  React.useEffect(() => {
    const stored = window.localStorage.getItem("theme");
    const initial: ThemePref =
      stored === "light" || stored === "dark" || stored === "system"
        ? (stored as ThemePref)
        : "system";

    const resolved = resolvedTheme(initial);
    setThemePref(initial);
    setThemeCookie(resolved);
    applyTheme(initial);

    const mql = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mql) return;

    const onChange = () => {
      const cur =
        (window.localStorage.getItem("theme") as ThemePref | null) ?? initial;
      if (cur === "system") applyTheme("system");
    };

    try {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    } catch {
      // @ts-ignore
      mql.addListener(onChange);
      // @ts-ignore
      return () => mql.removeListener(onChange);
    }
  }, []);

  return (
    <div className="sticky top-0 z-40 border-b bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/50">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-2">
        <div className="flex flex-1 flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em]">
          <span className="truncate text-[12px]">
            <span className="hidden sm:inline">Lakeshore HL • U14 AA Game Hub</span>
            <span className="inline sm:hidden">LHL • U14 AA</span>
          </span>
          <nav className="hidden md:flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <a className="transition-colors hover:text-foreground" href="/">
              GAME SCORES
            </a>
            <a className="transition-colors hover:text-foreground" href="/standings">
              STANDINGS
            </a>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="flex h-9 rounded-full border border-muted/40 bg-background/60 p-0 text-muted-foreground hover:text-foreground"
                aria-label="Toggle theme"
              >
                <span className="hidden items-center gap-2 px-3 md:flex">
                  <DesktopThemeIcon className="h-4 w-4" />
                  {themeLabel(themePref)}
                </span>
                <span className="flex md:hidden items-center justify-center h-9 w-9">
                  <MobileThemeIcon className="h-4 w-4" />
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel>Theme</DropdownMenuLabel>
              <DropdownMenuSeparator />

              <DropdownMenuRadioGroup
                value={themePref}
                onValueChange={(v) => {
                  const next = v as ThemePref;
                  setThemePref(next);
                  window.localStorage.setItem("theme", next);
                  setThemeCookie(resolvedTheme(next));
                  applyTheme(next);
                }}
              >
                <DropdownMenuRadioItem value="system" className="gap-2">
                  <Laptop className="h-4 w-4" />
                  System
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="light" className="gap-2">
                  <Sun className="h-4 w-4" />
                  Light
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark" className="gap-2">
                  <Moon className="h-4 w-4" />
                  Dark
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-muted/40 bg-background/60 p-0 text-muted-foreground hover:text-foreground md:hidden"
              >
                <Menu className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36 space-y-1">
              <DropdownMenuLabel>Navigate</DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <a href="/">Game Scores</a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href="/standings">Standings</a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
