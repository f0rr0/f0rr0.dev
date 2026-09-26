"use client";

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import type { ReactNode } from "react";

import {
  TooltipContent as UpstreamTooltipContent,
  TooltipProvider as UpstreamTooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

function TooltipProvider({
  delay = 250,
  ...props
}: TooltipPrimitive.Provider.Props) {
  return (
    <UpstreamTooltipProvider
      data-slot="tooltip-provider"
      delay={delay}
      closeDelay={100}
      timeout={400}
      {...props}
    />
  );
}

function TooltipGroup({ children }: { children: ReactNode }) {
  return (
    <TooltipPrimitive.Root<ReactNode>>
      {({ payload }) => (
        <>
          {children}
          {payload}
        </>
      )}
    </TooltipPrimitive.Root>
  );
}

function TooltipContent({
  className,
  side = "top",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  anchor,
  children,
  preview = false,
  ...props
}: TooltipPrimitive.Popup.Props & { preview?: boolean } & Pick<
    TooltipPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset" | "anchor"
  >) {
  if (!preview) {
    return (
      <UpstreamTooltipContent
        className={cn("text-sm motion-reduce:animate-none", className)}
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        {...props}
      >
        {children}
      </UpstreamTooltipContent>
    );
  }
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        anchor={anchor}
        align={align}
        alignOffset={alignOffset}
        className="transition-[top,left,right,bottom,transform] duration-(--motion-layout) ease-(--ease-settle) motion-reduce:transition-none isolate z-50"
        side={side}
        sideOffset={sideOffset}
        collisionPadding={16}
        collisionAvoidance={{
          side: "flip",
          align: "shift",
          fallbackAxisSide: "end",
        }}
      >
        <TooltipPrimitive.Popup
          className="w-80 max-w-[calc(100vw-2rem)] rounded-xl border bg-popover text-sm text-popover-foreground shadow-site-floating h-(--popup-height,auto) site-popup block overflow-hidden"
          data-slot="tooltip-content"
          {...props}
        >
          <TooltipPrimitive.Viewport className="site-preview-viewport">
            <div className={cn("p-4", className)}>{children}</div>
          </TooltipPrimitive.Viewport>
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

export { TooltipGroup, TooltipContent, TooltipProvider, TooltipTrigger };
