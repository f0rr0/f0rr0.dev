// Run with bun scripts/build-favicons.ts after changing the portrait or theme colors.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const css = await readFile(path.join(root, "src/app/globals.css"), "utf-8");
const colors = [...css.matchAll(/--primary: (#[\da-f]+);/gu)];
assert.equal(colors.length, 2, "Expected light and dark primary colors");
const size = 48;
const portrait = await sharp(path.join(root, "public/portraits/neutral.webp"))
  .resize(size, size)
  .png()
  .toBuffer();
const circle = (fill: string) =>
  Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="24" cy="24" r="24" fill="${fill}"/></svg>`
  );

for (const [index, theme] of ["light", "dark"].entries()) {
  const png = await sharp(circle(colors[index][1]))
    .composite([
      { input: portrait },
      { input: circle("white"), blend: "dest-in" },
    ])
    .png()
    .toBuffer();
  await writeFile(path.join(root, `public/portraits/icon-${theme}.png`), png);

  if (theme === "light") {
    // ICO supports an embedded PNG; keep /favicon.ico for feeds and direct requests.
    const header = Buffer.alloc(22);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(1, 4);
    header[6] = size;
    header[7] = size;
    header.writeUInt16LE(1, 10);
    header.writeUInt16LE(32, 12);
    header.writeUInt32LE(png.length, 14);
    header.writeUInt32LE(22, 18);
    await writeFile(
      path.join(root, "public/favicon.ico"),
      Buffer.concat([header, png])
    );
  }
}
