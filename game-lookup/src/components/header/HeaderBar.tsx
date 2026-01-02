"use client";

import * as React from "react";
import { Menu, Moon, Sun } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function systemIsDark() {
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
}

function setThemeCookie(value: "dark" | "light") {
  document.cookie = `theme=${value}; path=/; max-age=31536000; samesite=lax`;
}

function applyTheme(theme: "light" | "dark") {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function HeaderBar() {
  const [theme, setTheme] = React.useState<"light" | "dark">("light");

  React.useEffect(() => {
    const stored = window.localStorage.getItem("theme");
    const initial: "light" | "dark" =
      stored === "light" || stored === "dark"
        ? stored
        : systemIsDark()
        ? "dark"
        : "light";
    setTheme(initial);
    setThemeCookie(initial);
    applyTheme(initial);
  }, []);

  const Icon = theme === "light" ? Sun : Moon;
  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    setThemeCookie(next);
    applyTheme(next);
    window.localStorage.setItem("theme", next);
  };

  return (
    <div className="sticky top-0 z-40 border-b bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/50">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-2">
        <div className="flex flex-1 flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em]">
          <Link
            href="/"
            className="text-[12px] truncate cursor-pointer hover:text-foreground"
          >
            <span className="hidden sm:inline">Lakeshore HL • U14 AA Game Hub</span>
            <span className="inline sm:hidden">LHL • U14 AA</span>
          </Link>
          <nav className="hidden md:flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            <Link className="transition-colors hover:text-foreground" href="/">
              GAME SCORES
            </Link>
            <Link className="transition-colors hover:text-foreground" href="/standings">
              STANDINGS
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-muted/40 bg-background/60 p-0 text-muted-foreground hover:text-foreground"
            aria-label="Toggle theme"
            onClick={toggleTheme}
          >
            <Icon className="h-4 w-4" />
          </Button>
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
              <DropdownMenuItem asChild>
                <Link
                  href="/"
                  className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
                >
                  Game Scores
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link
                  href="/standings"
                  className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
                >
                  Standings
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
