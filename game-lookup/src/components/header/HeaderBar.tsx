"use client";

import * as React from "react";
import { Laptop, Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
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

function themeIcon(pref: ThemePref) {
  if (pref === "system") return Laptop;
  if (pref === "dark") return Moon;
  return Sun;
}

export function HeaderBar() {
  const [themePref, setThemePref] = React.useState<ThemePref>("system");
  const ThemeIcon = themeIcon(themePref);

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
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <div className="flex items-center gap-4 text-sm font-medium uppercase">
          <span className="whitespace-nowrap">Lakeshore HL • U14 AA Game Hub</span>
          <nav className="flex items-center gap-3 text-xs font-semibold uppercase text-muted-foreground">
            <a className="transition-colors hover:text-foreground" href="/">
              GAME SCORES
            </a>
            <a className="transition-colors hover:text-foreground" href="/standings">
              STANDINGS
            </a>
          </nav>
        </div>

        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <ThemeIcon className="h-4 w-4" />
              {themeLabel(themePref)}
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
      </div>
    </div>
  );
}
