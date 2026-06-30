"use client";

import { Menu, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import type { ResumeNavItem } from "@/content/resume";
import type { AskAgentAction } from "@/lib/resume";

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
    <a
      href="/resume/sid-jain-resume.pdf"
      download
      className="rounded-lg border border-[#e7e5e4] px-4 py-2 text-sm font-medium text-[#292524] transition-colors hover:bg-[#b45309]/5 print:hidden dark:border-[#3a3836] dark:text-[#e7e5e4] dark:hover:bg-[#d97706]/10"
    >
      Download PDF
    </a>
  );
}

const agentButtonClass =
  "group inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 font-medium text-[#292524] underline-offset-4 transition-colors hover:text-[#b45309] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b45309] dark:text-[#e7e5e4] dark:hover:text-[#f59e0b] dark:focus-visible:outline-[#f59e0b]";

export function ResumeAskAgents({
  actions,
}: Readonly<{
  actions: readonly AskAgentAction[];
}>) {
  return (
    <footer className="mt-12 border-t border-[#e7e5e4] pt-6 print:hidden dark:border-[#3a3836]">
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-sm text-[#78716c] dark:text-[#a8a29e]">
        <span>Ask</span>
        {actions.map((action, index) => (
          <span
            key={action.label}
            className="inline-flex items-center gap-x-1.5"
          >
            <a
              href={action.href}
              className={agentButtonClass}
              target={action.external === true ? "_blank" : undefined}
              rel={action.external === true ? "noopener noreferrer" : undefined}
              aria-label={action.description}
            >
              <Image
                alt=""
                aria-hidden="true"
                className="h-3.5 w-3.5 shrink-0 object-contain"
                height={14}
                src={action.iconSrc}
                width={14}
              />
              {action.label}
            </a>
            {index === 0 ? <span>or</span> : null}
          </span>
        ))}
        <span>about me.</span>
      </div>
    </footer>
  );
}

export function ResumeMobileMenu({
  navItems,
}: Readonly<{ navItems: readonly ResumeNavItem[] }>) {
  return (
    <details className="relative md:hidden">
      <summary className={`${baseIconButton} list-none cursor-pointer`}>
        <Menu className="h-5 w-5" />
      </summary>
      <ul className="absolute right-0 top-full z-50 mt-2 w-48 rounded-xl bg-white p-2 shadow-lg ring-1 ring-[#e7e5e4] dark:bg-[#242322] dark:ring-[#3a3836]">
        {navItems.map((item) => {
          const className = `block rounded-lg px-3 py-2 text-sm transition-colors ${
            item.active === true
              ? "text-[#b45309] hover:text-[#92400e] dark:text-[#d97706] dark:hover:text-[#f59e0b]"
              : "text-[#78716c] hover:text-[#292524] dark:text-[#a8a29e] dark:hover:text-[#e7e5e4]"
          }`;

          return (
            <li key={item.href}>
              {item.external === true ? (
                <a
                  href={item.href}
                  className={className}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {item.label}
                </a>
              ) : (
                <Link href={item.href} className={className}>
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
