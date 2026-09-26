import type { ComponentProps } from "react";

import { formatDate } from "@/lib/date";
import type { dateFormats } from "@/lib/date";

export function DateTime({
  dateTime,
  format = "date",
  timeZone = "UTC",
  ...props
}: Omit<ComponentProps<"time">, "dateTime" | "children"> & {
  dateTime: string;
  format?: keyof typeof dateFormats;
  timeZone?: string;
}) {
  return (
    <time
      {...props}
      dateTime={new Date(dateTime).toISOString()}
      title={formatDate(dateTime, "dateTime", timeZone)}
    >
      {formatDate(dateTime, format, timeZone)}
    </time>
  );
}
