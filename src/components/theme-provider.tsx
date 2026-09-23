"use client";

import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { useEffect, useState } from "react";
import type * as React from "react";

type ThemeProviderProps = React.ComponentProps<typeof NextThemesProvider>;

function ThemeIcons() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  // Match server markup before reading the saved client theme.
  const theme = mounted ? resolvedTheme : undefined;

  return ["light", "dark"].map((variant) => (
    <link
      key={variant}
      rel="icon"
      type="image/png"
      sizes="48x48"
      href={`/portraits/icon-${variant}.png`}
      media={
        theme === undefined
          ? `(prefers-color-scheme: ${variant})`
          : theme === variant
            ? "all"
            : "not all"
      }
    />
  ));
}

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider {...props}>
      <ThemeIcons />
      {children}
    </NextThemesProvider>
  );
}
