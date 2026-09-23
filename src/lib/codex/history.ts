export interface TokenHistory {
  partial: boolean;
  values: { day: string; tokens: number | null }[];
}

export function summarizeTokenHistory(history: TokenHistory, today: string) {
  const rows = history.values.filter((row) => row.day <= today);
  let total = 0;
  const cumulativeRows: TokenHistory["values"] = [];
  let peak: (typeof rows)[number] | undefined;
  for (const row of rows) {
    if (row.tokens === null) {
      cumulativeRows.push({ day: row.day, tokens: null });
      continue;
    }
    total += row.tokens;
    cumulativeRows.push({ day: row.day, tokens: total });
    if (peak === undefined || row.tokens > (peak.tokens ?? 0)) {
      peak = row;
    }
  }
  return {
    rows,
    cumulativeRows,
    total,
    peak,
    partial: history.partial || rows.some((row) => row.tokens === null),
  };
}
