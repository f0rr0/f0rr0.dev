"use client";

import { toast } from "sonner";

import { track } from "@/lib/analytics";

export async function copyEmail(email: string) {
  const method = navigator.clipboard === undefined ? "fallback" : "clipboard";
  try {
    if (navigator.clipboard === undefined) {
      // HTTP previews lack the Clipboard API; keep this fallback synchronous.
      const field = document.createElement("textarea");
      const focused = document.activeElement;
      field.value = email;
      field.readOnly = true;
      field.style.cssText = "position:fixed;opacity:0;pointer-events:none";
      document.body.append(field);
      try {
        field.select();
        // oxlint-disable-next-line typescript/no-deprecated -- Only fallback available on insecure HTTP previews.
        if (!document.execCommand("copy")) {
          throw new Error("Copy failed");
        }
      } finally {
        field.remove();
        if (focused instanceof HTMLElement) {
          focused.focus({ preventScroll: true });
        }
      }
    } else {
      await navigator.clipboard.writeText(email);
    }
    track("email_copied", { method });
    toast.success("Copied");
  } catch {
    toast.error("Copy failed");
  }
}

export function CopyEmailButton({ email }: Readonly<{ email: string }>) {
  return (
    <button
      aria-label={`Copy email address ${email}`}
      className="site-text-link inline-flex min-h-11 items-center gap-1.5 rounded-sm text-sm text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 cursor-pointer"
      onClick={() => {
        void copyEmail(email);
      }}
      title={email}
      type="button"
    >
      {email}
    </button>
  );
}
