export interface TokenHistory {
  partial: boolean;
  values: { day: string; tokens: number | null }[];
}

export function summarizeTokenHistory(history: TokenHistory, today: string) {
  const reported = history.values.filter((row) => row.day <= today);
  const rows = reported.map((row) => ({ ...row, tokens: row.tokens ?? 0 }));
  let total = 0;
  const cumulativeRows: TokenHistory["values"] = [];
  let peak: (typeof rows)[number] | undefined;
  for (const row of rows) {
    total += row.tokens;
    cumulativeRows.push({ day: row.day, tokens: total });
    if (row.tokens > 0 && (peak === undefined || row.tokens > peak.tokens)) {
      peak = row;
    }
  }
  return {
    rows,
    cumulativeRows,
    total,
    peak,
    partial: history.partial || reported.some((row) => row.tokens === null),
  };
}
