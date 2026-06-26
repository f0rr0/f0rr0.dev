# Typst Resume Workflow

This folder contains Typst assets for Sid Jain's resume.

The current canonical resume is generated from RenderCV YAML in `../rendercv/sid-jain-resume.yaml`. RenderCV writes a clean Typst file to `../rendercv/rendercv-resume.typ`, which can also be compiled directly with the pinned Typst toolchain.

## Files

- `../rendercv/sid-jain-resume.yaml`: canonical resume content and RenderCV design configuration.
- `../rendercv/rendercv-resume.typ`: generated Typst source from RenderCV.
- `fonts/`: project-local IBM Plex Sans and Source Sans 3 files used by direct Typst compiles.
- `../sid-jain-resume-2026-rendercv.pdf`: canonical PDF output from RenderCV.
- `../sid-jain-resume-2026-rendercv-typst.pdf`: PDF compiled directly from the generated Typst file.
- `sid-jain-resume.typ`: original Typst baseline kept for comparison.

The older Markdown/HTML/PDF files in `career/` are kept as reference outputs while the Typst version is evaluated.

## Install Tooling

Tooling is pinned in the repo root `mise.toml` / `mise.lock`.

```sh
mise install
```

Typst `0.15.0` is pinned through mise. The canonical RenderCV build uses `uvx 'rendercv[full]==2.8'`.

## Build

From the repo root, build the canonical RenderCV output:

```sh
mise run resume-rendercv
```

To compile the generated Typst file directly:

```sh
mise run resume-typst
```

To build the older comparison files:

```sh
mise run resume-typst-v1
```

To create page PNGs for visual review:

```sh
mise run resume-typst-png
```

## Validation

Render page PNGs and review them visually:

```sh
ls -lh /tmp/sid-jain-rendercv-final-*.png /tmp/sid-jain-rendercv-typst-*.png
```

Optional text extraction check if `pypdf` is installed:

```sh
python - <<'PY'
from pypdf import PdfReader
p = "career/sid-jain-resume-2026-rendercv.pdf"
r = PdfReader(p)
print("pages", len(r.pages))
print("\\n".join(page.extract_text() or "" for page in r.pages)[:2000])
PY
```

The target is a two-page, selectable-text PDF with a single-column ATS-safe reading order.

## Font Source

IBM Plex Sans is pulled from the official IBM Plex repository:

- https://github.com/IBM/plex

Source Sans 3 is pulled from the official Adobe Source Sans repository:

- https://github.com/adobe-fonts/source-sans

Both font families are distributed under the SIL Open Font License.
