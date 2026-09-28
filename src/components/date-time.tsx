"use client";

import { useSyncExternalStore } from "react";
import type { ComponentProps } from "react";

import { sitePreferences } from "@/content/site";
import { formatDate } from "@/lib/date";
import type { dateFormats } from "@/lib/date";

const subscribe = () => () => {
  // The browser timezone is fixed for this page view; no subscription is needed.
};
const visitorTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const browserTimeZone = () => visitorTimeZone;
const serverTimeZone = () => sitePreferences.timeZone;

export function DateTime({
  dateTime,
  format = "date",
  timeZone,
  ...props
}: Omit<ComponentProps<"time">, "dateTime" | "children"> & {
  dateTime: string;
  format?: keyof typeof dateFormats;
  timeZone?: string;
}) {
  const localTimeZone = useSyncExternalStore(
    subscribe,
    browserTimeZone,
    serverTimeZone
  );
  const zone = timeZone ?? localTimeZone;
  return (
    <time
      {...props}
      dateTime={dateTime}
      title={formatDate(
        dateTime,
        format === "time" ? "dateTime" : format,
        zone
      )}
    >
      {formatDate(dateTime, format, zone)}
    </time>
  );
}
