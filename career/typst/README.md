# Typst Resume Workflow

The canonical resume content lives in `src/content/resume.ts`.

The current PDF workflow uses `scripts/build-resume-pdf.ts` to generate Typst
from that shared resume data, then compiles it with the pinned Typst toolchain.
The generated Typst file is an output, not the source of truth.

## Files

- `../../src/content/resume.ts`: canonical resume content for the web resume,
  `/resume.json`, `/llms.txt`, and the public PDF.
- `../../scripts/build-resume-pdf.ts`: generator that writes Typst from the
  canonical resume data.
- `../generated/sid-jain-resume-dark.typ`: generated Typst output.
- `../../public/resume/sid-jain-resume.pdf`: public PDF served by the site.
- `fonts/`: project-local IBM Plex Sans and Source Sans 3 files used by Typst.

## Build

From the repo root:

```sh
mise run resume-pdf
```

or:

```sh
bun run resume:pdf
```

This produces:

```text
career/generated/sid-jain-resume-dark.typ
public/resume/sid-jain-resume.pdf
```

## Validation

The target is a selectable-text PDF generated from the same data as the web
resume. After changing `src/content/resume.ts`, rebuild the PDF and inspect the
served resume link at `/resume/sid-jain-resume.pdf`.

## Font Source

IBM Plex Sans is pulled from the official IBM Plex repository:

- https://github.com/IBM/plex

Source Sans 3 is pulled from the official Adobe Source Sans repository:

- https://github.com/adobe-fonts/source-sans

Both font families are distributed under the SIL Open Font License.
