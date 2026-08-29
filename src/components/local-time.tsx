"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => null;

const utcTimeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
});

const localTimeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

export function LocalTime({
  className,
  dateTime,
}: Readonly<{ className?: string; dateTime: string }>) {
  const date = new Date(dateTime);
  const localLabel = localTimeFormatter.format(date);
  const serverLabel = utcTimeFormatter.format(date);
  const label = useSyncExternalStore(
    subscribe,
    () => localLabel,
    () => serverLabel
  );

  return (
    <time className={className} dateTime={dateTime}>
      {label}
    </time>
  );
}
