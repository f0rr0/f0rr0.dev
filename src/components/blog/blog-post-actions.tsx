"use client";

import { ChevronDownIcon, FileTextIcon, SparklesIcon } from "lucide-react";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLinkItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { buildAskAiLinks, buildAskAiPrompt } from "@/lib/ask-ai";

interface BlogPostActionsProps {
  markdownHref: string;
  sourceUrl: string;
  title: string;
}

const externalLinkProps = {
  rel: "noopener noreferrer",
  target: "_blank",
} as const;

export function BlogPostActions({
  markdownHref,
  sourceUrl,
  title,
}: Readonly<BlogPostActionsProps>) {
  const context = { sourceUrl, title };
  const links = buildAskAiLinks(context);

  const copyPromptForGemini = async () => {
    if (navigator.clipboard === undefined) {
      return;
    }

    try {
      await navigator.clipboard.writeText(buildAskAiPrompt(context));
    } catch {
      // Gemini still opens when clipboard access is unavailable.
    }
  };

  return (
    <nav
      aria-label="Post actions"
      className="flex min-h-10 items-center border-t border-border sm:border-t-0"
    >
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Ask AI about ${title}`}
          render={
            <Button
              className="group/ask-ai px-2 text-muted-foreground shadow-none hover:text-foreground"
              size="sm"
              variant="ghost"
            />
          }
        >
          <SparklesIcon aria-hidden="true" className="size-3.5" />
          Ask AI
          <ChevronDownIcon
            aria-hidden="true"
            className="size-3.5 transition-transform group-data-[popup-open]/ask-ai:rotate-180"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          aria-label="Choose an AI assistant"
          className="w-52 p-1.5"
          sideOffset={6}
        >
          <DropdownMenuLinkItem
            aria-label="Open this post in ChatGPT"
            closeOnClick
            href={links.chatGpt}
            {...externalLinkProps}
          >
            <Image
              alt=""
              aria-hidden="true"
              className="size-4 dark:invert"
              height={16}
              src="/brands/chatgpt.svg"
              width={16}
            />
            ChatGPT
          </DropdownMenuLinkItem>
          <DropdownMenuLinkItem
            aria-label="Open this post in Claude"
            closeOnClick
            href={links.claude}
            {...externalLinkProps}
          >
            <Image
              alt=""
              aria-hidden="true"
              className="size-4"
              height={16}
              src="/brands/claude.svg"
              width={16}
            />
            Claude
          </DropdownMenuLinkItem>
          <DropdownMenuLinkItem
            aria-label="Copy the prompt and open this post in Gemini"
            closeOnClick
            href={links.gemini}
            onClick={() => void copyPromptForGemini()}
            {...externalLinkProps}
          >
            <Image
              alt=""
              aria-hidden="true"
              className="size-4"
              height={16}
              src="/brands/gemini.svg"
              width={16}
            />
            Gemini
            <span className="ml-auto text-[0.6875rem] text-muted-foreground">
              copies prompt
            </span>
          </DropdownMenuLinkItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Separator className="mx-1" orientation="vertical" />

      <Button
        className="px-2 text-muted-foreground shadow-none hover:text-foreground"
        render={
          <a
            aria-label="View this post as Markdown"
            href={markdownHref}
            {...externalLinkProps}
          />
        }
        nativeButton={false}
        size="sm"
        variant="ghost"
      >
        <FileTextIcon aria-hidden="true" className="size-3.5" />
        Markdown
      </Button>
    </nav>
  );
}
