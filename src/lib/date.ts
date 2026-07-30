export const formatDate = (
  value: Date | string,
  locale: string | string[] = "en-US"
) => {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(date);
};
