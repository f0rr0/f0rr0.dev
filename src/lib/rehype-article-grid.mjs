import { CONTINUE, SKIP, visit } from "unist-util-visit";

const tagOf = (node) => node.tagName ?? node.name;
const isImage = (node) => ["img", "Image"].includes(tagOf(node));
const containsImage = (node) =>
  isImage(node) || node.children?.some(containsImage);
const isImageOnly = (node) =>
  isImage(node) ||
  (["a", "p"].includes(tagOf(node)) &&
    node.children?.length === 1 &&
    isImageOnly(node.children[0]));
const isImageParagraph = (node) => tagOf(node) === "p" && isImageOnly(node);
const isCode = (node) =>
  tagOf(node) === "pre" ||
  (tagOf(node) === "figure" &&
    node.children?.some((child) => tagOf(child) === "pre"));

const classNamesOf = (node) => {
  const classes =
    node.properties?.className ??
    node.attributes?.find((attribute) => attribute.name === "className")?.value;
  if (typeof classes === "string") {
    return classes.split(/\s+/);
  }
  return Array.isArray(classes) ? classes : [];
};

const textOf = (node) =>
  node.type === "text"
    ? node.value
    : (node.children?.map(textOf).join("") ?? "");

const kindOf = (node) => {
  const tag = tagOf(node);
  if (/^h[1-6]$/.test(tag)) {
    return tag;
  }
  if (tag === "p") {
    return "paragraph";
  }
  if (["ul", "ol"].includes(tag)) {
    return "list";
  }
  if (tag === "details") {
    return "disclosure";
  }
  if (tag === "hr") {
    return "rule";
  }
  return "block";
};

// Keep GFM's note IDs, numbering and backlinks. CSS changes placement only.
export default function rehypeArticleGrid() {
  return (tree) => {
    // GFM checkboxes are read-only, but still need the item's accessible name.
    visit(tree, "element", (node, _index, parent) => {
      if (
        node.tagName === "input" &&
        node.properties.type === "checkbox" &&
        node.properties.disabled
      ) {
        node.properties.ariaLabel = textOf(parent).trim();
      }
    });
    const references = new Map();
    const wideRows = [];
    let row = 0;
    let previousKind;
    const flows = new Map();
    const footnotes = tree.children.find(
      (node) => node.type === "element" && node.properties?.dataFootnotes
    );

    tree.children = tree.children.map((node) => {
      if (
        node === footnotes ||
        !["element", "mdxJsxFlowElement", "mdxFlowExpression"].includes(
          node.type
        )
      ) {
        return node;
      }
      row += 1;
      const classes = classNamesOf(node);
      const hasClass = (name) => classes.includes(name);
      const image =
        isImage(node) ||
        isImageParagraph(node) ||
        (tagOf(node) === "figure" && containsImage(node));
      const media =
        image ||
        isCode(node) ||
        tagOf(node) === "Mermaid" ||
        tagOf(node) === "table" ||
        hasClass("article-screenshot-grid");
      const wide =
        hasClass("article-wide") ||
        (media &&
          !isCode(node) &&
          !hasClass("article-screenshot") &&
          !hasClass("article-screenshot-grid"));
      if (isImageParagraph(node)) {
        node.tagName = "figure";
      }
      const kind = media || wide ? "media" : kindOf(node);
      const flow = {
        dataArticleKind: kind,
        dataArticleAfter: previousKind,
      };
      flows.set(row, flow);
      previousKind = kind;
      if (wide) {
        wideRows.push(row);
      }
      visit(node, (child) => {
        // Closed disclosures and wide figures cannot anchor a margin note.
        if (wide || child.tagName === "details" || child.name === "details") {
          return SKIP;
        }
        if (child.properties?.dataFootnoteRef !== undefined) {
          const id = child.properties.href?.slice(1);
          if (id && !references.has(id)) {
            references.set(id, row);
          }
        }
        return CONTINUE;
      });
      return {
        type: "element",
        tagName: "div",
        properties: {
          className: ["article-block"],
          ...flow,
          dataArticleWide: wide || undefined,
          ...(tagOf(node) === "table"
            ? {
                tabIndex: 0,
                role: "region",
                ariaLabel: "Table. Scroll horizontally to read all columns.",
              }
            : {}),
          style: `--article-row: ${row}`,
        },
        children: [node],
      };
    });

    const list = footnotes?.children.find((node) => node.tagName === "ol");
    if (!list) {
      return;
    }
    const groups = new Map();
    let number = 0;
    for (const note of list.children.filter((node) => node.tagName === "li")) {
      number += 1;
      note.properties.value = number;
      const noteRow = references.get(note.properties.id);
      let group = groups.get(noteRow);
      if (!group) {
        group = {
          type: "element",
          tagName: "ol",
          properties: {
            start: number,
            ...(noteRow === undefined
              ? {}
              : {
                  className: ["article-sidenotes"],
                  ...flows.get(noteRow),
                  style: `--article-row: ${noteRow}`,
                }),
          },
          children: [],
        };
        groups.set(noteRow, group);
      }
      group.children.push(note);
    }
    // Let prose continue beside a long note, but reserve room before the next
    // note group or wide figure. A spanning grid item cannot overlap either.
    const boundaries = [...groups.keys(), ...wideRows, row + 1]
      .filter((value) => value !== undefined)
      .toSorted((a, b) => a - b);
    for (const [noteRow, group] of groups) {
      if (noteRow !== undefined) {
        const end = boundaries.find((value) => value > noteRow);
        group.properties.style += `; --article-span: ${end - noteRow}`;
      }
    }
    footnotes.children = footnotes.children.flatMap((node) =>
      node === list ? [...groups.values()] : [node]
    );
  };
}
