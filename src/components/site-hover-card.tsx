"use client";

import { PreviewCard as HoverCardPrimitive } from "@base-ui/react/preview-card";
import { createContext, use, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import {
  HoverCard,
  HoverCardTrigger as UpstreamHoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";

const WarmPreview = createContext(false);

function HoverCardGroup({ children }: { children: ReactNode }) {
  const [warm, setWarm] = useState(false);
  const reset = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (reset.current !== null) {
        clearTimeout(reset.current);
      }
    },
    []
  );
  return (
    <WarmPreview value={warm}>
      <HoverCard
        onOpenChange={(open) => {
          if (reset.current !== null) {
            clearTimeout(reset.current);
          }
          if (open) {
            setWarm(true);
          } else {
            reset.current = setTimeout(() => {
              setWarm(false);
            }, 400);
          }
        }}
      >
        {({ payload }) => (
          <>
            {children}
            {payload as ReactNode}
          </>
        )}
      </HoverCard>
    </WarmPreview>
  );
}

function HoverCardTrigger(props: HoverCardPrimitive.Trigger.Props) {
  const warm = use(WarmPreview);
  return (
    <UpstreamHoverCardTrigger
      delay={warm ? 0 : 250}
      closeDelay={100}
      {...props}
    />
  );
}

function HoverCardContent({
  className,
  children,
  side = "left",
  ...props
}: HoverCardPrimitive.Popup.Props &
  Pick<HoverCardPrimitive.Positioner.Props, "side">) {
  return (
    <HoverCardPrimitive.Portal>
      <HoverCardPrimitive.Positioner
        align="start"
        className="[transition-property:top,left,right,bottom,transform] duration-240 ease-(--ease-settle) motion-reduce:transition-none z-50"
        side={side}
        sideOffset={24}
        collisionPadding={16}
        collisionAvoidance={{
          side: "flip",
          align: "shift",
          fallbackAxisSide: "end",
        }}
      >
        <HoverCardPrimitive.Popup
          className={cn(
            "w-80 max-w-[calc(100vw-2rem)] rounded-xl border bg-popover text-sm text-popover-foreground shadow-site-floating h-(--popup-height,auto) [--popup-enter-x:0px] [--popup-enter-y:-4px] origin-(--transform-origin) [transition:opacity_160ms_ease-out,transform_220ms_var(--ease-settle),height_240ms_var(--ease-settle)] data-[side='top']:[--popup-enter-y:4px] data-[side='left']:[--popup-enter-x:4px] data-[side='left']:[--popup-enter-y:0px] data-[side='right']:[--popup-enter-x:-4px] data-[side='right']:[--popup-enter-y:0px] [[data-starting-style],[data-ending-style]]:opacity-0 [[data-starting-style],[data-ending-style]]:transform-[translate(var(--popup-enter-x),var(--popup-enter-y))_scale(0.985)] data-ending-style:duration-100 motion-reduce:transition-none overflow-hidden outline-none",
            className
          )}
          data-slot="hover-card-content"
          {...props}
        >
          <HoverCardPrimitive.Viewport className="relative size-full overflow-clip [--preview-enter-y:4px] data-[activation-direction='up']:[--preview-enter-y:-4px] [&_>_:is([data-current],[data-previous])]:w-full [&_>_:is([data-current],[data-previous])]:[transition:opacity_140ms_ease-out,translate_200ms_var(--ease-settle)] [&[data-transitioning]_>_[data-current]]:[transition-delay:45ms,0ms] *:data-starting-style:opacity-0 *:data-starting-style:[translate:0_var(--preview-enter-y)] *:data-ending-style:opacity-0 *:data-ending-style:[translate:0_calc(-1*var(--preview-enter-y))] *:data-ending-style:duration-80 motion-reduce:[&_>_:is([data-current],[data-previous])]:transition-none">
            {children}
          </HoverCardPrimitive.Viewport>
        </HoverCardPrimitive.Popup>
      </HoverCardPrimitive.Positioner>
    </HoverCardPrimitive.Portal>
  );
}

export { HoverCardGroup, HoverCardContent, HoverCardTrigger };
