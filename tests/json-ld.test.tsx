import { expect, test } from "bun:test";

import { renderToStaticMarkup } from "react-dom/server";

import { JsonLd } from "../src/components/json-ld";

test("JSON-LD preserves JSON characters and cannot close its script element", () => {
  const data = {
    "@context": "https://schema.org" as const,
    "@type": "Person" as const,
    name: 'A & B "quoted" </script><script>alert(1)</script>',
  };
  const html = renderToStaticMarkup(<JsonLd data={data} />);
  expect(html.match(/<script\b/gu)).toHaveLength(1);
  const contents = /<script[^>]*>([\s\S]*?)<\/script>/u.exec(html)?.[1] ?? "";
  expect(JSON.parse(contents)).toEqual(data);
});
