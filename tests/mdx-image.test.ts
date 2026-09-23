import { expect, test } from "bun:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import MDXImage from "../src/components/mdx/MDXImage.tsx";

test("fallback images preserve dimensions so the page reserves their aspect ratio", () => {
  const html = renderToStaticMarkup(
    createElement(MDXImage, {
      alt: "Architecture overview",
      height: "450",
      src: "https://example.com/diagram.svg",
      width: "800",
    })
  );

  expect(html).toContain('width="800"');
  expect(html).toContain('height="450"');
  expect(html).toContain('alt="Architecture overview"');
  expect(html).toContain('loading="lazy"');
});
