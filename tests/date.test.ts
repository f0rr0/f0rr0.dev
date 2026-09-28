import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DateTime } from "../src/components/date-time";
import { dateKey, formatDate } from "../src/lib/date.ts";

test("date formatting handles UTC, local midnight, and daylight saving transitions", () => {
  const instant = "2026-09-06T01:00:00.000Z";
  expect(formatDate(instant, "dateTime", "UTC")).toBe("Sep 6, 2026, 1:00 AM");
  expect(dateKey(instant, "America/Los_Angeles")).toBe("2026-09-05");
  expect(formatDate(instant, "time", "Asia/Kolkata")).toBe("6:30 AM");
  expect(
    formatDate("2026-03-08T09:59:00Z", "time", "America/Los_Angeles")
  ).toBe("1:59 AM");
  expect(
    formatDate("2026-03-08T10:00:00Z", "time", "America/Los_Angeles")
  ).toBe("3:00 AM");
});

test("logical token dates have no time, timezone, or end date", () => {
  expect(formatDate("2026-08-28")).toBe("Aug 28, 2026");
  expect(formatDate("2026-04-27")).toBe("Apr 27, 2026");
  expect(formatDate("2026-09-07", "weekday")).toBe("Mon, Sep 7, 2026");
  expect(formatDate("2026-09-07", "date", "America/Los_Angeles")).toBe(
    "Sep 7, 2026"
  );
  expect(dateKey("2026-09-07", "America/Los_Angeles")).toBe("2026-09-07");
});

test("stored work days and server timestamps use IST at midnight and year boundaries", () => {
  expect(dateKey("2026-12-31T18:29:59Z")).toBe("2026-12-31");
  expect(dateKey("2026-12-31T18:30:00Z")).toBe("2027-01-01");
  expect(dateKey("2027-01-01T00:00:00+05:30")).toBe("2027-01-01");
  expect(formatDate("2026-12-31T18:30:00Z", "dateTime")).toBe(
    "Jan 1, 2027, 12:00 AM"
  );
  expect(formatDate(new Date("2026-12-31T18:30:00Z"), "time")).toBe("12:00 AM");
});

test("the initial timestamp script localizes text and title without touching calendar dates or pinned clocks", () => {
  const dateTime = "2026-12-31T18:30:00Z";
  const markup = renderToStaticMarkup(
    createElement(DateTime, { dateTime, format: "time" })
  );
  expect(markup).toContain("Jan 1, 2027, 12:00 AM");
  const script = /<script[^>]*>([\s\S]*?)<\/script>/u.exec(markup)?.[1] ?? "";
  expect(script).not.toBe("");
  for (const [timeZone, text, title] of [
    ["America/Los_Angeles", "10:30 AM", "Dec 31, 2026, 10:30 AM"],
    ["Asia/Kolkata", "12:00 AM", "Jan 1, 2027, 12:00 AM"],
    ["Pacific/Kiritimati", "8:30 AM", "Jan 1, 2027, 8:30 AM"],
  ]) {
    const node = { dateTime, textContent: "", title: "" };
    runInNewContext(script, {
      document: { currentScript: { previousElementSibling: node } },
      Intl: {
        DateTimeFormat: class extends Intl.DateTimeFormat {
          constructor(locale: string, options: Intl.DateTimeFormatOptions) {
            super(locale, { ...options, timeZone });
          }
        },
      },
    });
    expect(node.textContent).toBe(text);
    expect(node.title).toBe(title);
  }
  expect(
    renderToStaticMarkup(createElement(DateTime, { dateTime: "2026-12-31" }))
  ).toBe(
    '<time dateTime="2026-12-31" title="Dec 31, 2026">Dec 31, 2026</time>'
  );
  expect(
    renderToStaticMarkup(
      createElement(DateTime, { dateTime, timeZone: "Asia/Kolkata" })
    )
  ).not.toContain("<script");
});
