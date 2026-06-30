"use client";

import { Bot, Check, Clipboard, Menu, Moon, Sun, Terminal } from "lucide-react";
import { useTheme } from "next-themes";
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
  "inline-flex items-center gap-1.5 rounded-full bg-[#292524] px-3 py-1.5 text-xs font-semibold text-[#faf9f6] transition-colors hover:bg-[#b45309] dark:bg-[#e7e5e4] dark:text-[#1a1918] dark:hover:bg-[#f59e0b]";

const agentSecondaryButtonClass =
  "inline-flex items-center gap-1.5 rounded-full border border-[#e7e5e4] px-3 py-1.5 text-xs font-medium text-[#57534e] transition-colors hover:border-[#b45309]/40 hover:text-[#b45309] dark:border-[#3a3836] dark:text-[#a8a29e] dark:hover:border-[#d97706]/50 dark:hover:text-[#f59e0b]";

const agentIcon = (label: string) =>
  label === "Codex" ? (
    <Terminal className="h-3.5 w-3.5" />
  ) : (
    <Bot className="h-3.5 w-3.5" />
  );

export function ResumeAskAgents({
  actions,
  contextHref,
  prompt,
}: Readonly<{
  actions: readonly AskAgentAction[];
  contextHref: string;
  prompt: string;
}>) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle"
  );

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }

    window.setTimeout(() => {
      setCopyState("idle");
    }, 1800);
  };

  return (
    <footer className="mt-12 border-t border-[#e7e5e4] pt-6 print:hidden dark:border-[#3a3836]">
      <div className="flex flex-wrap items-center gap-2 text-sm text-[#78716c] dark:text-[#a8a29e]">
        <span>Ask</span>
        {actions.map((action, index) => (
          <span key={action.label} className="inline-flex items-center gap-2">
            <a
              href={action.href}
              className={agentButtonClass}
              target={action.external === true ? "_blank" : undefined}
              rel={action.external === true ? "noopener noreferrer" : undefined}
              aria-label={action.description}
            >
              {agentIcon(action.label)}
              {action.label}
            </a>
            {index === 0 ? <span>or</span> : null}
          </span>
        ))}
        <span>about me</span>
        <button
          type="button"
          className={agentSecondaryButtonClass}
          onClick={() => {
            void copyPrompt();
          }}
        >
          {copyState === "copied" ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Clipboard className="h-3.5 w-3.5" />
          )}
          {copyState === "copied"
            ? "Copied"
            : copyState === "error"
              ? "Copy failed"
              : "Copy prompt"}
        </button>
        <a href={contextHref} className={agentSecondaryButtonClass}>
          llms.txt
        </a>
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
