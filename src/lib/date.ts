import { sitePreferences } from "@/content/site";

const calendarDate = /^\d{4}-\d{2}-\d{2}$/u;

export const dateFormats = {
  date: { dateStyle: "medium" },
  weekday: {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  },
  day: { dateStyle: "full" },
  month: { month: "short" },
  time: { hour: "numeric", minute: "2-digit", hour12: true },
  dateTime: { dateStyle: "medium", timeStyle: "short", hour12: true },
} satisfies Record<string, Intl.DateTimeFormatOptions>;

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

export const formatDate = (
  value: Date | string,
  format: keyof typeof dateFormats = "date",
  timeZone = sitePreferences.timeZone
) => {
  // A provider's calendar date has no clock to convert.
  const zone =
    typeof value === "string" && calendarDate.test(value) ? "UTC" : timeZone;
  const key = `${format}:${zone}`;
  const formatter =
    dateFormatters.get(key) ??
    new Intl.DateTimeFormat(sitePreferences.language, {
      ...dateFormats[format],
      timeZone: zone,
    });
  dateFormatters.set(key, formatter);
  return formatter.format(new Date(value));
};

export const dateKey = (
  value: Date | string,
  timeZone = sitePreferences.timeZone
) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone:
      typeof value === "string" && calendarDate.test(value) ? "UTC" : timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
