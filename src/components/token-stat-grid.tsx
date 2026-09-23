import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export function TokenStatGrid({ className, ...props }: ComponentProps<"dl">) {
  return (
    <dl
      className={cn(
        "grid grid-cols-2 min-[34rem]:grid-cols-3 md:grid-cols-4 gap-x-4 empty:hidden [&>div]:grid [&>div]:row-span-2 [&>div]:grid-rows-subgrid [&>div]:min-w-0 [&>div]:wrap-anywhere",
        className
      )}
      {...props}
    />
  );
}
