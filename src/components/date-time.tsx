"use client";

import type { ComponentProps } from "react";

import { sitePreferences } from "@/content/site";
import { dateFormats, formatDate } from "@/lib/date";

const browser = typeof window !== "undefined";
const visitorTimeZone = browser
  ? Intl.DateTimeFormat().resolvedOptions().timeZone
  : sitePreferences.timeZone;

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
  const localize =
    timeZone === undefined && !/^\d{4}-\d{2}-\d{2}$/u.test(dateTime);
  const zone = timeZone ?? visitorTimeZone;
  const titleFormat = format === "time" ? "dateTime" : format;
  return (
    <>
      <time
        {...props}
        dateTime={dateTime}
        suppressHydrationWarning={localize}
        title={formatDate(dateTime, titleFormat, zone)}
      >
        {formatDate(dateTime, format, zone)}
      </time>
      {localize ? (
        // Initial HTML is localized during parsing; navigation formats during render.
        <script
          type={browser ? "text/plain" : "text/javascript"}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `((t)=>{const d=new Date(t.dateTime);const f=o=>new Intl.DateTimeFormat(${JSON.stringify(sitePreferences.language)},o).format(d);t.textContent=f(${JSON.stringify(dateFormats[format])});t.title=f(${JSON.stringify(dateFormats[titleFormat])});})(document.currentScript.previousElementSibling);`,
          }}
        />
      ) : null}
    </>
  );
}
