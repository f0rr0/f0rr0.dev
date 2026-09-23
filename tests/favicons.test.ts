import { expect, test } from "bun:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

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
