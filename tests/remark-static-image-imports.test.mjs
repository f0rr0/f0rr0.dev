import { expect, test } from "bun:test";

import remarkStaticImageImports from "../src/lib/remark-static-image-imports.mjs";

const paragraph = () => ({
  type: "paragraph",
  children: [{ type: "image", url: "./photo.jpg", alt: "Portrait" }],
});

test("Markdown images preserve figure and enlargement-link layout without paragraph wrappers", () => {
  const caption = {
    type: "mdxJsxFlowElement",
    name: "figcaption",
    children: [{ type: "text", value: "A portrait study." }],
  };
  const figure = {
    type: "mdxJsxFlowElement",
    name: "figure",
    children: [paragraph(), caption],
  };
  const link = {
    type: "mdxJsxFlowElement",
    name: "a",
    attributes: [
      { type: "mdxJsxAttribute", name: "href", value: "/photo.jpg" },
    ],
    children: [paragraph()],
  };
  const standalone = paragraph();
  const tree = { type: "root", children: [figure, link, standalone] };

  remarkStaticImageImports()(tree);

  for (const parent of [figure, link]) {
    expect(parent.children[0].name).toBe("img");
    expect(parent.children[0].attributes[1].value).toBe("Portrait");
  }
  expect(figure.children[1]).toBe(caption);
  expect(link.attributes[0].value).toBe("/photo.jpg");
  expect(standalone.type).toBe("paragraph");
  expect(standalone.children[0].name).toBe("img");
  expect(
    tree.children.filter((node) => node.value?.startsWith("import ") === true)
  ).toHaveLength(1);
});
