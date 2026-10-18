import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { Glob } from "bun";
import { PeleError, renderAsync } from "pele/lazy";

import remarkMermaid from "../src/lib/remark-mermaid.mjs";

const diagrams = [
  ...new Glob("**/page.mdx").scanSync("src/content/blog"),
].flatMap((path) => {
  const source = readFileSync(`src/content/blog/${path}`, "utf-8");

  return [...source.matchAll(/```mermaid\n([\s\S]*?)```/gu)].map(
    (match, index): [string, string] => [
      `${path} diagram ${index + 1}`,
      match[1],
    ]
  );
});

describe("Pele blog diagrams", () => {
  test("finds the published diagram fixtures", () => {
    expect(diagrams.length).toBeGreaterThan(0);
  });

  test.each(diagrams)(
    "renders %s at mobile and desktop widths",
    async (_, chart) => {
      for (const maxWidth of [320, 960]) {
        const result = await renderAsync(chart, {
          directionBreakpoint: 1024,
          idPrefix: "article-diagram",
          maxWidth,
        });

        expect(result.svg).toContain('class="pele pele-');
        expect(Number.isFinite(result.width)).toBe(true);
        expect(Number.isFinite(result.height)).toBe(true);
        expect(result.width).toBeGreaterThan(0);
        expect(result.height).toBeGreaterThan(0);

        const title = /accTitle:\s*(.+)/u.exec(chart)?.[1];
        const description = /accDescr:\s*(.+)/u.exec(chart)?.[1];

        if (typeof title === "string") {
          expect(result.svg).toContain(
            'aria-labelledby="article-diagram-title"'
          );
          expect(result.svg).toContain(
            `<title id="article-diagram-title">${title}</title>`
          );
        }

        if (typeof description === "string") {
          expect(result.svg).toContain(
            'aria-describedby="article-diagram-desc"'
          );
          expect(result.svg).toContain(
            `<desc id="article-diagram-desc">${description}</desc>`
          );
        }
      }
    }
  );

  test("preserves Mermaid source through the MDX transform", async () => {
    const chart = "---\nconfig:\n  layout: elk\n---\nflowchart LR\n  A --> B";
    const tree: { type: string; children: unknown[] } = {
      type: "root",
      children: [{ type: "code", lang: "mermaid", value: chart }],
    };

    remarkMermaid()(tree);

    expect(tree.children[0]).toEqual({
      type: "mdxJsxFlowElement",
      name: "Mermaid",
      attributes: [{ type: "mdxJsxAttribute", name: "chart", value: chart }],
      children: [],
    });
    expect((await renderAsync(chart)).type).toBe("flowchart");
  });

  test("reports malformed source instead of returning a broken diagram", async () => {
    const result = await renderAsync("flowchart TD\n  A[Unclosed").catch(
      (error: unknown) => error
    );
    expect(result).toBeInstanceOf(PeleError);
  });
});
