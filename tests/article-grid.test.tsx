import { expect, test } from "bun:test";

import { evaluate } from "@mdx-js/mdx";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as runtime from "react/jsx-runtime";
import { rehypePrettyCode } from "rehype-pretty-code";
import remarkGfm from "remark-gfm";

import rehypeArticleGrid from "../src/lib/rehype-article-grid.mjs";

test("article grid preserves MDX and groups notes at the first visible reference without duplication", async () => {
  const { default: Content } = await evaluate(
    `export const metadata = { title: "Grid" };

## Heading

First[^a] and second[^b].

Again[^a].

<figure className="article-wide">
  <img src="/example.svg" alt="Example" />

Caption reference[^c].

</figure>

<details>
  <summary>More</summary>

Hidden reference[^c].

~~~js
const nested = true;
~~~

</details>

![An ordinary Markdown image](/another.svg)

| Label | Value |
| --- | --- |
| A | 1 |

- [x] A **labelled** task.

<figure>
  <a href="/original.svg"><img src="/original.svg" alt="Linked image" /></a>
</figure>

A note before code[^d].

~~~js
const answer = 42;
~~~

~~~
plain text
~~~

<pre data-github-code-embed="true"><code>const fromGitHub = true;</code></pre>

[^a]: Note A.

[^b]: Note B.

    Another paragraph.

[^c]: Note C stays at the end.

[^d]: This note can continue beside reading-width code blocks.
`,
    {
      ...runtime,
      remarkPlugins: [remarkGfm],
      rehypePlugins: [rehypePrettyCode, rehypeArticleGrid],
    }
  );
  const html = renderToStaticMarkup(createElement(Content));

  expect(html.match(/class="article-block"/g)).toHaveLength(13);
  expect(html).toContain('<figure class="article-wide">');
  expect(html).toContain("<h2>Heading</h2>");
  expect(html.match(/class="article-sidenotes"/g)).toHaveLength(2);
  expect(html).toContain('style="--article-row:2;--article-span:2"');
  expect(html).toContain('style="--article-row:10;--article-span:4"');
  expect(html.match(/data-article-wide="true"/g)).toHaveLength(4);
  for (const row of [11, 12, 13]) {
    const block = new RegExp(
      `<div[^>]*style="--article-row:${row}"[^>]*>`
    ).exec(html)?.[0];
    expect(block).toBeDefined();
    expect(block).not.toContain("data-article-wide");
  }
  expect(html).toContain(
    'style="--article-row:11"><figure data-rehype-pretty-code-figure'
  );
  expect(html).toContain(
    'style="--article-row:13"><pre data-github-code-embed="true"'
  );
  expect(html).toContain('<ol start="3"><li id="user-content-fn-c" value="3">');
  expect(html).toContain('href="#user-content-fnref-a-2"');
  expect(html).toContain('aria-describedby="footnote-label"');
  expect(html.match(/id="user-content-fn-a"/g)).toHaveLength(1);
  expect(html.match(/Note A\./g)).toHaveLength(1);
  expect(html).toContain("Another paragraph.");
  expect(html).toContain(
    'data-article-kind="media" data-article-after="list" data-article-wide="true"'
  );
  expect(html).toContain('aria-label="A labelled task."');
  expect(html).toContain(
    'data-article-kind="paragraph" data-article-after="h2"'
  );
  expect(html).toContain(
    'data-article-kind="media" data-article-after="disclosure" data-article-wide="true"'
  );
  expect(html).toContain(
    'tabindex="0" role="region" aria-label="Table. Scroll horizontally to read all columns."'
  );
  expect(html).toContain('<figure><img src="/another.svg"');
});
