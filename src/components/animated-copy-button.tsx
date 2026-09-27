"use client";

import { Check, Copy } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AnimatedCopyButton({
  value,
  label = "Copy",
  className,
}: Readonly<{ value: string; label?: string; className?: string }>) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  const request = useRef(0);
  const timeout = useRef(0);
  const reducedMotion = useReducedMotion() === true;
  const copied = status === "copied";
  const Icon = copied ? Check : Copy;

  useEffect(
    () => () => {
      request.current += 1;
      clearTimeout(timeout.current);
    },
    []
  );

  const copy = async () => {
    const currentRequest = ++request.current;
    clearTimeout(timeout.current);
    try {
      await navigator.clipboard.writeText(value);
      if (currentRequest !== request.current) {
        return;
      }
      setStatus("copied");
      timeout.current = window.setTimeout(() => {
        setStatus("idle");
      }, 1500);
    } catch {
      if (currentRequest === request.current) {
        setStatus("error");
      }
    }
  };

  return (
    <>
      <Button
        className={cn("font-normal", className)}
        variant="ghost"
        onClick={() => {
          void copy();
        }}
      >
        <span
          aria-hidden="true"
          className="relative inline-grid size-4 shrink-0 place-items-center"
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={copied ? "check" : "copy"}
              initial={
                reducedMotion
                  ? false
                  : { opacity: 0, scale: 0.25, filter: "blur(4px)" }
              }
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={
                reducedMotion
                  ? undefined
                  : { opacity: 0, scale: 0.25, filter: "blur(4px)" }
              }
              transition={
                reducedMotion
                  ? { duration: 0 }
                  : { duration: 0.18, ease: [0.23, 1, 0.32, 1] }
              }
              className="col-start-1 row-start-1 inline-flex"
            >
              <Icon className="size-4" />
            </motion.span>
          </AnimatePresence>
        </span>
        {label}
      </Button>
      <p
        role="status"
        className={
          status === "error" ? "text-sm text-muted-foreground" : "sr-only"
        }
      >
        {status === "error"
          ? "Select and copy the text below."
          : copied
            ? "Copied"
            : ""}
      </p>
      {status === "error" ? (
        <textarea
          aria-label="Text to copy"
          className="mt-2 min-h-32 w-full resize-y rounded-lg border border-border bg-background p-3 text-sm text-foreground"
          readOnly
          value={value}
          onFocus={(event) => {
            event.currentTarget.select();
          }}
        />
      ) : null}
    </>
  );
}
