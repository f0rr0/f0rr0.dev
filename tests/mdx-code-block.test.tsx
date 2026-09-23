import { expect, test } from "bun:test";

import { renderToStaticMarkup } from "react-dom/server";

import CodeBlock from "../src/components/mdx/CodeBlock";

test("fenced blocks and GitHub excerpts keep one code region and accessible copy controls", () => {
  for (const github of [false, true]) {
    const html = renderToStaticMarkup(
      <CodeBlock
        data-github-code-embed={github ? "true" : undefined}
        data-language="ts"
      >
        <code>const answer = 42;</code>
      </CodeBlock>
    );

    expect(html.match(/<pre\b/g)).toHaveLength(1);
    expect(html).toContain("const answer = 42;");
    expect(html).toContain("Copy TypeScript code to clipboard");
  }
});
