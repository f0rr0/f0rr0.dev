# Resume content customization

Edit [src/content/resume.ts](../src/content/resume.ts). Its `resumeData` object
supplies the web résumé, `/resume.json`, `/llms.txt`, and the PDF generator.

## What to edit

- `person`, `links`, and `summary`: name, contact details, location, professional
  focus, and introduction.
- `experience` and `education`: companies or schools, roles, dates, and bullets.
  Keep the current job and role first; the site uses them as the current position.
- `machineReadable`: supporting career context, role fit, and public references.
  Update this when changing career facts so it stays consistent with the résumé.
- `openSource`: project and publication links.
- `lastUpdated`: set to the date of your content update (`YYYY-MM-DD`).

Copy an existing experience entry when adding a job. Bullets can be plain strings
or objects with `label`, `text`, and an optional `logo`. Use dates such as
`Jan 2025 - Present` or `Apr 2024 - Jan 2025`.

Store photos and logos in [public/resume](../public/resume), then reference them
with paths such as `/resume/logos/company.png`. Optional role `markers` accept
`hands-on` and `leadership`; `leadershipScope` adds team context to the leadership
marker.

## Preview and build

Run `bun run dev` and open [localhost:3000/journey](http://localhost:3000/journey).
Check `/resume.json` and `/llms.txt` if you changed supporting career context.

The `/resume/sid-jain-resume.pdf` Route Handler uses `force-static`: Next.js
generates and caches the PDF during `next build`, using the existing Typst renderer.
Commit your content changes; no manual PDF update is needed.

In development, open `/resume/sid-jain-resume.pdf` to preview or download the PDF.
Review it for overflow and page breaks. Set `pdfPageBreakBefore: true` on an
experience or education entry when a manual break is needed.

The generator uses Typst 0.15 from the pinned `@flukxr/typst-cli` package,
installed with the project's dependencies. Edit [resume.typ](../career/typst/resume.typ)
for PDF layout, sizing, logo, badge, and section helpers. The
[renderer](../src/lib/resume-pdf.ts) passes shared résumé data as JSON and returns
PDF/A-2u bytes. Fonts live in [career/typst/fonts](../career/typst/fonts).
