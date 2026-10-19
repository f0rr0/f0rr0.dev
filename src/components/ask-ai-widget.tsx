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

export const AskAiWidget = ({
  profilePrompt,
  pageContext,
}: Readonly<{ profilePrompt: string; pageContext?: AskAiPageContext }>) => {
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
        className="group bg-muted text-popover-foreground ring-border hover:bg-accent focus-visible:outline-ring z-40 inline-flex min-h-11 items-center gap-2 rounded-full py-2 pr-2 pl-3 text-sm font-normal shadow-sm ring-1 transition-colors duration-(--motion-fast) focus-visible:outline-2 focus-visible:outline-offset-4 motion-reduce:transition-none min-[92rem]:fixed min-[92rem]:inset-e-6 min-[92rem]:bottom-6 dark:ring-0 print:hidden"
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
          <Popover.Popup className="bg-popover text-popover-foreground ring-border site-popup max-h-[min(70dvh,var(--available-height))] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain rounded-2xl px-4 pt-3 pb-4 shadow-md ring-1 outline-none dark:ring-0">
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
              <fieldset className="bg-muted mt-2 grid grid-cols-2 gap-1 rounded-lg p-1">
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
                    <span className="text-muted-foreground peer-checked:bg-background peer-checked:text-foreground peer-focus-visible:outline-ring flex min-h-11 items-center justify-center rounded-sm px-2 peer-checked:shadow-sm peer-focus-visible:outline-2">
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
                    className="bg-muted hover:bg-accent focus-visible:outline-ring flex h-20 flex-col items-center justify-center gap-2 rounded-lg px-2 text-sm font-normal transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
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
              className="text-muted-foreground mt-3 min-h-11 w-full"
            />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
};
