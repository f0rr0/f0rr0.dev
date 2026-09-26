"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";

import {
  TooltipContent,
  TooltipGroup,
  TooltipTrigger,
} from "@/components/site-tooltip";
import { track } from "@/lib/analytics";

type CopyStatus = "copied" | "error" | "idle";

const RESET_DELAY_MS = 2000;

const buttonContent: Record<
  CopyStatus,
  { accessibleLabel: (language: string) => string; label: string }
> = {
  copied: {
    accessibleLabel: (language) => `${language} code copied to clipboard`,
    label: "Copied",
  },
  error: {
    accessibleLabel: (language) => `Copying ${language} code failed. Try again`,
    label: "Retry",
  },
  idle: {
    accessibleLabel: (language) => `Copy ${language} code to clipboard`,
    label: "Copy",
  },
};

export default function CopyCodeButton({
  language,
}: Readonly<{ language: string }>) {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const resetTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current !== null) {
        window.clearTimeout(resetTimer.current);
      }
    },
    []
  );

  const handleCopy = async (event: MouseEvent<HTMLButtonElement>) => {
    const code = event.currentTarget
      .closest(".code-block")
      ?.querySelector("pre code")
      ?.textContent?.replace(/\n$/u, "");

    if (resetTimer.current !== null) {
      window.clearTimeout(resetTimer.current);
    }

    try {
      if (code === undefined) {
        throw new Error("Code content was not found");
      }

      await navigator.clipboard.writeText(code);
      track("code_copied", { language });
      setStatus("copied");
    } catch {
      setStatus("error");
    }

    resetTimer.current = window.setTimeout(() => {
      setStatus("idle");
      resetTimer.current = null;
    }, RESET_DELAY_MS);
  };

  const content = buttonContent[status];

  return (
    <TooltipGroup>
      <TooltipTrigger
        aria-label={content.accessibleLabel(language)}
        className="code-block-copy shrink-0 print:hidden"
        payload={<TooltipContent>{content.label}</TooltipContent>}
        onClick={(event) => {
          void handleCopy(event);
        }}
        type="button"
      >
        {status === "copied" ? (
          <Check aria-hidden="true" />
        ) : (
          <Copy aria-hidden="true" />
        )}
        <span aria-live="polite" className="sr-only">
          {content.label}
        </span>
      </TooltipTrigger>
    </TooltipGroup>
  );
}
