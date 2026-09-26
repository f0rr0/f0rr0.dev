"use client";

import type { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";
import { ChevronRight } from "lucide-react";

import {
  Collapsible as UpstreamCollapsible,
  CollapsibleContent as UpstreamCollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { track } from "@/lib/analytics";
import type { DetailProperties } from "@/lib/analytics";
import { cn } from "@/lib/utils";

function Collapsible({
  analytics,
  onOpenChange,
  ...props
}: CollapsiblePrimitive.Root.Props & { analytics?: DetailProperties }) {
  return (
    <UpstreamCollapsible
      data-slot="collapsible"
      {...props}
      onOpenChange={(open, details) => {
        onOpenChange?.(open, details);
        if (
          open &&
          !details.isCanceled &&
          details.reason === "trigger-press" &&
          analytics
        ) {
          track("details_opened", analytics);
        }
      }}
    />
  );
}

function CollapsibleContent({
  className,
  children,
  ...props
}: CollapsiblePrimitive.Panel.Props) {
  return (
    <UpstreamCollapsibleContent
      className={cn(
        "disclosure-panel h-(--collapsible-panel-height) overflow-clip [transition:height_280ms_var(--ease-settle)] [[data-starting-style],[data-ending-style]]:h-0 data-ending-style:duration-200 motion-reduce:transition-none [&[hidden]:not([hidden='until-found'])]:hidden",
        className
      )}
      data-slot="collapsible-content"
      {...props}
    >
      <div className="flow-root opacity-100 [translate:0_0] [transition:opacity_180ms_ease-out_35ms,translate_240ms_var(--ease-settle)_35ms] [.disclosure-panel:is([data-starting-style],[data-ending-style])_>_&]:opacity-0 [.disclosure-panel:is([data-starting-style],[data-ending-style])_>_&]:[translate:0_-4px] [.disclosure-panel:is([data-starting-style],[data-ending-style])_>_&]:duration-100 [.disclosure-panel:is([data-starting-style],[data-ending-style])_>_&]:[transition-delay:0ms] motion-reduce:transition-none">
        {children}
      </div>
    </UpstreamCollapsibleContent>
  );
}

function DisclosureChevron() {
  return (
    <ChevronRight
      aria-hidden="true"
      className="[--chevron-inset:5px] size-4 shrink-0 [transition:rotate_220ms_var(--ease-settle)] in-aria-expanded:rotate-90 [.site-row-meta_>_&]:-me-(--chevron-inset) [.site-text-link_>_&:last-child]:-me-(--chevron-inset) [.site-text-link_>_&:first-child]:-ms-(--chevron-inset) motion-reduce:transition-none"
      strokeWidth={1.5}
    />
  );
}

export {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  DisclosureChevron,
};
