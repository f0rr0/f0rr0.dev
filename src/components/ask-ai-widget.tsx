"use client";

import { Popover } from "@base-ui/react/popover";
import { X } from "lucide-react";
import Image from "next/image";
import { useId, useState } from "react";

import { AnimatedCopyButton } from "@/components/animated-copy-button";
import { AskAiFace } from "@/components/ask-ai-face";
import { Button } from "@/components/ui/button";
import { buildAssistantActions } from "@/lib/ask-ai";
import type { AskAiPageContext } from "@/lib/ask-ai";

export function AskAiWidget({
  profilePrompt,
  pageContext,
}: Readonly<{ profilePrompt: string; pageContext?: AskAiPageContext }>) {
  const topicId = useId();
  const [topic, setTopic] = useState(
    pageContext === undefined ? "profile" : "page"
  );
  const context = topic === "page" ? pageContext : undefined;
  const prompt = context?.prompt ?? profilePrompt;
  const actions = buildAssistantActions(prompt);
  const subject = context?.title ?? "Sid";
  const [open, setOpen] = useState(false);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label="Ask an AI"
        className="group z-40 inline-flex min-h-11 items-center gap-2 rounded-full bg-muted py-2 pr-2 pl-3 text-sm font-normal text-popover-foreground shadow-site-floating ring-1 ring-border dark:ring-0 transition-colors duration-150 hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring motion-reduce:transition-none min-[92rem]:fixed min-[92rem]:inset-e-6 min-[92rem]:bottom-6 print:hidden"
        openOnHover
        delay={250}
        closeDelay={300}
      >
        <span>Ask an AI</span>
        <AskAiFace />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          align="end"
          side="top"
          sideOffset={12}
          collisionPadding={16}
          className="z-50 print:hidden"
        >
          <Popover.Popup className="w-80 max-w-[calc(100vw-2rem)] max-h-[min(70dvh,var(--available-height))] overflow-y-auto overscroll-contain rounded-2xl bg-popover px-4 pt-3 pb-4 text-popover-foreground shadow-site-floating ring-1 ring-border dark:ring-0 outline-none origin-bottom-right transition-[opacity,transform] duration-150 data-starting-style:translate-y-1 data-starting-style:opacity-0 data-ending-style:translate-y-1 data-ending-style:opacity-0 motion-reduce:transition-none">
            <div className="flex items-start justify-between gap-3">
              <Popover.Title className="text-sm font-medium">
                Ask an AI
              </Popover.Title>
              <Popover.Close
                aria-label="Close AI picker"
                render={
                  <Button
                    variant="ghost"
                    className="-mt-1 -mr-1 size-8 rounded-full"
                  />
                }
              >
                <X aria-hidden="true" className="size-4" />
              </Popover.Close>
            </div>
            {pageContext === undefined ? null : (
              <fieldset className="mt-2 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
                <legend className="sr-only">Question context</legend>
                {[
                  { value: "page", label: pageContext.label },
                  { value: "profile", label: "About Sid" },
                ].map((option) => (
                  <label
                    key={option.value}
                    className="relative cursor-pointer text-center text-sm"
                  >
                    <input
                      className="peer sr-only"
                      type="radio"
                      name={topicId}
                      value={option.value}
                      checked={topic === option.value}
                      onChange={() => {
                        setTopic(option.value);
                      }}
                    />
                    <span className="flex min-h-11 items-center justify-center rounded-md px-2 text-muted-foreground peer-checked:bg-background peer-checked:text-foreground peer-checked:shadow-sm peer-focus-visible:outline-2 peer-focus-visible:outline-ring">
                      {option.label}
                    </span>
                  </label>
                ))}
              </fieldset>
            )}
            <ul
              aria-label="AI assistants"
              className="mt-2 grid grid-cols-2 gap-2"
            >
              {actions.map((action) => (
                <li key={action.label}>
                  <a
                    aria-label={`Ask ${action.label} about ${subject} (opens in a new tab)`}
                    className="flex h-20 flex-col items-center justify-center gap-2 rounded-lg bg-muted px-2 text-sm font-normal transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    data-analytics-placement="ai-widget"
                    href={action.href}
                    onClick={() => {
                      setOpen(false);
                    }}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <Image
                      alt=""
                      className={
                        action.label === "ChatGPT" ||
                        action.label === "Perplexity"
                          ? "size-5 dark:invert"
                          : "size-5"
                      }
                      height={20}
                      width={20}
                      src={action.iconSrc}
                    />
                    <span>{action.label}</span>
                  </a>
                </li>
              ))}
            </ul>
            <AnimatedCopyButton
              key={`${open}:${prompt}`}
              value={prompt}
              label="Copy prompt"
              className="mt-3 min-h-11 w-full text-muted-foreground"
            />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
