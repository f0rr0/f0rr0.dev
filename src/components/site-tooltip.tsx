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
        className="site-preview-positioner [transition-property:top,_left,_right,_bottom,_transform] [transition-duration:240ms] [transition-timing-function:var(--ease-settle)] motion-reduce:transition-none isolate z-50"
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
          className="site-preview w-80 max-w-[calc(100vw-2rem)] rounded-xl border bg-popover text-sm text-popover-foreground shadow-site-floating [height:var(--popup-height,_auto)] [--popup-enter-x:0px] [--popup-enter-y:-4px] [transform-origin:var(--transform-origin)] [transition:opacity_160ms_ease-out,_transform_220ms_var(--ease-settle),_height_240ms_var(--ease-settle)] [&[data-side='top']]:[--popup-enter-y:4px] [&[data-side='left']]:[--popup-enter-x:4px] [&[data-side='left']]:[--popup-enter-y:0px] [&[data-side='right']]:[--popup-enter-x:-4px] [&[data-side='right']]:[--popup-enter-y:0px] [&:is(_[data-starting-style],_[data-ending-style]_)]:opacity-0 [&:is(_[data-starting-style],_[data-ending-style]_)]:[transform:translate(var(--popup-enter-x),_var(--popup-enter-y))_scale(0.985)] [&[data-ending-style]]:[transition-duration:100ms] motion-reduce:transition-none block overflow-hidden"
          data-slot="tooltip-content"
          {...props}
        >
          <TooltipPrimitive.Viewport className="preview-viewport relative size-full overflow-clip [--preview-enter-y:4px] [&[data-activation-direction='up']]:[--preview-enter-y:-4px] [&_>_:is([data-current],_[data-previous])]:w-full [&_>_:is([data-current],_[data-previous])]:[transition:opacity_140ms_ease-out,_translate_200ms_var(--ease-settle)] [&[data-transitioning]_>_[data-current]]:[transition-delay:45ms,_0ms] [&_>_[data-starting-style]]:opacity-0 [&_>_[data-starting-style]]:[translate:0_var(--preview-enter-y)] [&_>_[data-ending-style]]:opacity-0 [&_>_[data-ending-style]]:[translate:0_calc(-1_*_var(--preview-enter-y))] [&_>_[data-ending-style]]:[transition-duration:80ms] motion-reduce:[&_>_:is([data-current],_[data-previous])]:transition-none">
            <div className={cn("p-4", className)}>{children}</div>
          </TooltipPrimitive.Viewport>
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

export { TooltipGroup, TooltipContent, TooltipProvider, TooltipTrigger };
