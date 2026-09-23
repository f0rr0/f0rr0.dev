import { formatDate } from "@/lib/date";

export const TokenMonthAxis = ({
  calendarOffset,
  values,
  className = "",
}: {
  calendarOffset?: number;
  className?: string;
  values: readonly { day: string }[];
}) => {
  const columns = Math.ceil(((calendarOffset ?? 0) + values.length) / 7);
  const ticks = values.flatMap((point, index) =>
    index === 0 ||
    point.day.slice(0, 7) === (values[index - 1]?.day ?? point.day).slice(0, 7)
      ? []
      : [{ day: point.day, index }]
  );
  return (
    <div
      aria-hidden="true"
      className={`relative mt-2 h-4 max-sm:[&>span:nth-child(even)]:hidden ${className}`}
    >
      {ticks.map((tick) => {
        const position =
          calendarOffset === undefined
            ? tick.index / Math.max(1, values.length - 1)
            : Math.floor((calendarOffset + tick.index) / 7) /
              Math.max(1, columns - 1);
        return (
          <span
            className={`absolute -translate-x-1/2 font-sans text-xs text-muted-foreground ${position > 0.95 ? "-translate-x-full" : position < 0.05 ? "translate-x-0" : ""}`}
            key={tick.day}
            style={{ left: `${String(position * 100)}%` }}
          >
            {formatDate(tick.day, "month")}
          </span>
        );
      })}
    </div>
  );
};
