import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export const TokenStatGrid = ({
  className,
  ...props
}: ComponentProps<"dl">) => (
  <dl
    className={cn(
      "grid grid-cols-2 gap-x-4 empty:hidden min-[34rem]:grid-cols-3 md:grid-cols-4 [&>div]:row-span-2 [&>div]:grid [&>div]:min-w-0 [&>div]:grid-rows-subgrid [&>div]:wrap-anywhere",
      className
    )}
    {...props}
  />
);
