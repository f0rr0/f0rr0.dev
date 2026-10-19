"use client";

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import type { ReactNode } from "react";

import {
  TooltipContent as UpstreamTooltipContent,
  TooltipProvider as UpstreamTooltipProvider,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const TooltipProvider = ({
  delay = 250,
  ...props
}: TooltipPrimitive.Provider.Props) => (
  <UpstreamTooltipProvider
    data-slot="tooltip-provider"
    delay={delay}
    closeDelay={100}
    timeout={400}
    {...props}
  />
);

const TooltipGroup = ({ children }: { children: ReactNode }) => (
  <TooltipPrimitive.Root<ReactNode>>
    {({ payload }) => (
      <>
        {children}
        {payload}
      </>
    )}
  </TooltipPrimitive.Root>
);

const TooltipContent = ({
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
  >) => {
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
        className="isolate z-50 h-(--positioner-height) w-(--positioner-width) transition-[top,left,right,bottom,transform] duration-(--motion-layout) ease-(--ease-settle) motion-reduce:transition-none"
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
          className="bg-popover text-popover-foreground site-popup block h-(--popup-height,auto) w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border text-sm shadow-md"
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
};

export { TooltipGroup, TooltipContent, TooltipProvider };
export { TooltipTrigger } from "@/components/ui/tooltip";
