import type { ComponentProps } from "react";

import { formatDate } from "@/lib/date";
import type { dateFormats } from "@/lib/date";

export function DateTime({
  dateTime,
  format = "date",
  ...props
}: Omit<ComponentProps<"time">, "dateTime" | "children"> & {
  dateTime: string;
  format?: keyof typeof dateFormats;
}) {
  return (
    <time
      {...props}
      dateTime={dateTime}
      title={formatDate(dateTime, format === "time" ? "dateTime" : format)}
    >
      {formatDate(dateTime, format)}
    </time>
  );
}
