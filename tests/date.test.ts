import { expect, test } from "bun:test";

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

test("the site uses IST at midnight and year boundaries for every timestamp", () => {
  expect(dateKey("2026-12-31T18:29:59Z")).toBe("2026-12-31");
  expect(dateKey("2026-12-31T18:30:00Z")).toBe("2027-01-01");
  expect(dateKey("2027-01-01T00:00:00+05:30")).toBe("2027-01-01");
  expect(formatDate("2026-12-31T18:30:00Z", "dateTime")).toBe(
    "Jan 1, 2027, 12:00 AM"
  );
  expect(formatDate(new Date("2026-12-31T18:30:00Z"), "time")).toBe("12:00 AM");
});
