import { expect, test } from "bun:test";

import { renderToStaticMarkup } from "react-dom/server";

import MDXImage from "../src/components/mdx/MDXImage";

test("invalid dimensions fall back to the image's natural size", () => {
  const html = renderToStaticMarkup(
    <MDXImage
      src={{ src: "/photo.png", width: 640, height: 480 }}
      alt="Example"
      width="1200px"
      height={Number.POSITIVE_INFINITY}
    />
  );
  expect(html).toContain('width="640"');
  expect(html).toContain('height="480"');
});
