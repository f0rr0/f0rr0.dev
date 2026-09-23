import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";

import { ThemeProvider } from "../src/components/theme-provider";

test("server-rendered favicons follow system preference before hydration", () => {
  const html = renderToStaticMarkup(createElement(ThemeProvider));
  const icons = html.match(/<link[^>]+rel="icon"[^>]*>/gu);
  expect(icons).toHaveLength(2);
  for (const [index, theme] of ["light", "dark"].entries()) {
    expect(icons?.[index]).toContain(`href="/portraits/icon-${theme}.png"`);
    expect(icons?.[index]).toContain(
      `media="(prefers-color-scheme: ${theme})"`
    );
  }
});

test("portrait favicons are circular, theme-colored, and have a matching ICO fallback", async () => {
  const css = await readFile(
    new URL("../src/app/globals.css", import.meta.url),
    "utf-8"
  );
  const colors = [...css.matchAll(/--primary: (#[\da-f]+);/gu)].map(
    (match) => match[1]
  );
  for (const [index, theme] of ["light", "dark"].entries()) {
    const png = await readFile(
      new URL(`../public/portraits/icon-${theme}.png`, import.meta.url)
    );
    const { data, info } = await sharp(png)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([48, 48]);
    expect(data[3]).toBe(0);
    // Inside the circle, above the hair: the same primary color as the header.
    const offset = (48 + 24) * 4;
    expect(`#${data.subarray(offset, offset + 3).toString("hex")}`).toBe(
      colors[index]
    );
    expect(data[offset + 3]).toBe(255);
    if (theme === "light") {
      const ico = await readFile(
        new URL("../public/favicon.ico", import.meta.url)
      );
      expect(ico.readUInt16LE(2)).toBe(1);
      expect(ico.readUInt16LE(4)).toBe(1);
      expect(ico.readUInt32LE(14)).toBe(png.length);
      expect(ico.subarray(ico.readUInt32LE(18))).toEqual(png);
    }
  }
});
