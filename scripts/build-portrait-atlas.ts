// Run with bun scripts/build-portrait-atlas.ts [output-directory].
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";
import { z } from "zod";

import { FACE_MOTION_ATLAS_FRAME_ORDER } from "../src/lib/face-motion";

const root = path.resolve(import.meta.dirname, "..");
const source = path.join(root, "output/imagegen/face-motion-v7");
const output = path.resolve(
  process.argv[2] ?? path.join(root, "public/portraits")
);
// 48px header portrait at 2x DPR.
const cellSize = 96;
const encoding = { quality: 93, effort: 6 };
const { frames } = z
  .object({
    frames: z.array(
      z.object({ code: z.string().regex(/^F\d{2}$/u), key: z.string() })
    ),
  })
  .parse(
    JSON.parse(await readFile(path.join(source, "manifest.json"), "utf-8"))
  );
assert.deepEqual(
  frames.map(({ key }) => key),
  FACE_MOTION_ATLAS_FRAME_ORDER
);

const cells = await Promise.all(
  frames.map(async ({ code }) => {
    const image = sharp(path.join(source, "preview", `${code}.webp`));
    const { width, height } = await image.metadata();
    assert.equal(width, 656);
    assert.equal(height, 656);
    return await image
      .resize(cellSize, cellSize, { kernel: "lanczos3" })
      .png()
      .toBuffer();
  })
);
const [neutral] = cells;
assert.notEqual(neutral, undefined);
await mkdir(output, { recursive: true });
await sharp(neutral).webp(encoding).toFile(path.join(output, "neutral.webp"));
await sharp({
  create: {
    width: cellSize * 8,
    height: cellSize * 8,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite(
    cells.map((input, index) => ({
      input,
      left: (index % 8) * cellSize,
      top: Math.floor(index / 8) * cellSize,
    }))
  )
  .webp(encoding)
  .toFile(path.join(output, "atlas.webp"));
console.log(
  `Packed ${frames.length} frames at ${cellSize}px per cell into ${output}`
);
