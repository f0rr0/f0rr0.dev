"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export default function ThemeToggle() {
  const { setTheme } = useTheme();

  const handleToggle = () => {
    const root = window.document.documentElement;
    const isDark = root.classList.contains("dark");
    setTheme(isDark ? "light" : "dark");
  };

  return (
    <button
      type="button"
      aria-label="Toggle color theme"
      className="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground transition-transform duration-(--motion-exit) ease-out hover:bg-muted hover:text-brand-hover active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
      onClick={handleToggle}
    >
      <Moon aria-hidden="true" className="size-5 dark:hidden" />
      <Sun aria-hidden="true" className="hidden size-5 dark:block" />
    </button>
  );
}
