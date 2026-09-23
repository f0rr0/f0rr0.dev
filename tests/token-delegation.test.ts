import { expect, test } from "bun:test";

import { delegationLabelPositions } from "../src/components/token-delegation";

test("donut callouts stay separated for narrow charts and adjacent small slices", () => {
  for (const radius of [40, 75, 128]) {
    const height = radius === 128 ? 384 : 288;
    for (const values of [
      [50.2, 37, 12.8],
      [87.89, 12.1, 0.01],
      [18.1, 13.4, 68.5],
    ]) {
      const labels = delegationLabelPositions(
        values.map((value) => ({ value })),
        radius,
        height
      );
      for (const label of labels) {
        expect(label.y).toBeGreaterThanOrEqual(36);
        expect(label.y).toBeLessThanOrEqual(height - 36);
        for (const other of labels) {
          if (label !== other && label.side === other.side) {
            expect(Math.abs(label.y - other.y)).toBeGreaterThanOrEqual(72);
          }
        }
      }
    }
  }
});
