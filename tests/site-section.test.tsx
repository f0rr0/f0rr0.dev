import { expect, test } from "bun:test";

import { renderToStaticMarkup } from "react-dom/server";

import { SiteSection } from "../src/components/site-page";

test("section archive links use the internal work and writing pages", () => {
  for (const title of ["Work", "Writing"]) {
    const path = `/${title.toLowerCase()}`;
    const html = renderToStaticMarkup(
      <SiteSection href={path} id={title.toLowerCase()} title={title}>
        <p>Preview</p>
      </SiteSection>
    );
    expect(html).toContain(`href="${path}"`);
    expect(html).toContain(`All ${title.toLowerCase()}`);
    expect(html).not.toContain('target="_blank"');
  }
  const html = renderToStaticMarkup(
    <SiteSection id="open-source" title="Open source">
      <p>Projects</p>
    </SiteSection>
  );
  expect(html).not.toContain("<a ");
});

test("section headers preserve actions alongside custom archive links", () => {
  const html = renderToStaticMarkup(
    <SiteSection
      action={<span>Updated recently</span>}
      href="/tokens"
      linkLabel="All token usage"
      id="tokens"
      title="Tokens"
      description="Token activity"
    >
      <p>Preview</p>
    </SiteSection>
  );
  expect(html).toContain("Updated recently");
  expect(html).toContain('href="/tokens"');
  expect(html).toContain("All token usage");
  expect(html).toContain('id="tokens-title"');
});
