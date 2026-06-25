"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const TRANSITION_CLASS = "theme-transition";

export default function ThemeToggle() {
  const { theme, setTheme, systemTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="h-6 w-12" aria-hidden />;
  }

  const resolvedTheme = theme === "system" ? systemTheme : theme;
  const isDark = resolvedTheme === "dark";

  const handleToggle = (checked: boolean) => {
    const root = window.document.documentElement;
    root.classList.add(TRANSITION_CLASS);
    window.setTimeout(() => {
      root.classList.remove(TRANSITION_CLASS);
    }, 500);
    setTheme(checked ? "dark" : "light");
  };

  return (
    <div className="flex items-center gap-2 text-foreground/70">
      <Sun
        className={cn("h-4 w-4 transition", isDark && "text-foreground/40")}
      />
      <Switch
        size="sm"
        checked={isDark}
        onCheckedChange={handleToggle}
        aria-label="Toggle dark mode"
      />
      <Moon
        className={cn("h-4 w-4 transition", !isDark && "text-foreground/40")}
      />
    </div>
  );
}
