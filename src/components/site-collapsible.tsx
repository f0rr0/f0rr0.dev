"use client";

import type { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";
import { ChevronRight } from "lucide-react";

import {
  Collapsible as UpstreamCollapsible,
  CollapsibleContent as UpstreamCollapsibleContent,
} from "@/components/ui/collapsible";
import { track } from "@/lib/analytics";
import type { DetailProperties } from "@/lib/analytics";
import { cn } from "@/lib/utils";

const Collapsible = ({
  analytics,
  onOpenChange,
  ...props
}: CollapsiblePrimitive.Root.Props & { analytics?: DetailProperties }) => (
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

const CollapsibleContent = ({
  className,
  children,
  ...props
}: CollapsiblePrimitive.Panel.Props) => (
  <UpstreamCollapsibleContent
    className={cn("disclosure-panel", className)}
    data-slot="collapsible-content"
    {...props}
  >
    {/* Transforms here change Base UI's scrollHeight measurement and cause an end-of-open jump. */}
    <div className="flow-root">{children}</div>
  </UpstreamCollapsibleContent>
);

const DisclosureChevron = () => (
  <ChevronRight
    aria-hidden="true"
    className="size-4 shrink-0 transition-[rotate] duration-(--motion-layout) ease-(--ease-settle) [--chevron-inset:5px] in-aria-expanded:rotate-90 motion-reduce:transition-none [.site-row-meta_>_&]:-me-(--chevron-inset) [.site-text-link_>_&:first-child]:-ms-(--chevron-inset) [.site-text-link_>_&:last-child]:-me-(--chevron-inset)"
    strokeWidth={1.5}
  />
);

export { Collapsible, CollapsibleContent, DisclosureChevron };
export { CollapsibleTrigger } from "@/components/ui/collapsible";
