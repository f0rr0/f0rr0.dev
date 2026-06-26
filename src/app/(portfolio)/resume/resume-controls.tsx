"use client";

import { Menu, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { useEffect, useState } from "react";

const baseIconButton =
  "rounded-full p-2 text-[#78716c] transition-colors hover:text-[#b45309] dark:text-[#a8a29e] dark:hover:text-[#f59e0b]";

export function ResumeThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <button
      type="button"
      aria-label="Toggle dark mode"
      className={baseIconButton}
      onClick={() => {
        setTheme(isDark ? "light" : "dark");
      }}
    >
      {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}

export function ResumePrintButton() {
  return (
    <button
      type="button"
      className="rounded-lg border border-[#e7e5e4] px-4 py-2 text-sm font-medium text-[#292524] transition-colors hover:bg-[#b45309]/5 print:hidden dark:border-[#3a3836] dark:text-[#e7e5e4] dark:hover:bg-[#d97706]/10"
      onClick={() => {
        window.print();
      }}
    >
      Download PDF
    </button>
  );
}

export function ResumeMobileMenu() {
  return (
    <details className="relative md:hidden">
      <summary className={`${baseIconButton} list-none cursor-pointer`}>
        <Menu className="h-5 w-5" />
      </summary>
      <ul className="absolute right-0 top-full z-50 mt-2 w-48 rounded-xl bg-white p-2 shadow-lg ring-1 ring-[#e7e5e4] dark:bg-[#242322] dark:ring-[#3a3836]">
        <li>
          <Link
            href="/blog"
            className="block rounded-lg px-3 py-2 text-sm text-[#78716c] transition-colors hover:text-[#292524] dark:text-[#a8a29e] dark:hover:text-[#e7e5e4]"
          >
            Blog
          </Link>
        </li>
        <li>
          <Link
            href="/resume"
            className="block rounded-lg px-3 py-2 text-sm text-[#b45309] transition-colors hover:text-[#92400e] dark:text-[#d97706] dark:hover:text-[#f59e0b]"
          >
            Resume
          </Link>
        </li>
        <li>
          <a
            href="https://github.com/f0rr0"
            className="block rounded-lg px-3 py-2 text-sm text-[#78716c] transition-colors hover:text-[#292524] dark:text-[#a8a29e] dark:hover:text-[#e7e5e4]"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
        </li>
      </ul>
    </details>
  );
}
