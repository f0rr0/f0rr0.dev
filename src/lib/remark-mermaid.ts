import type { Code, Root } from "mdast";
import type { Parent } from "unist";
import { visit } from "unist-util-visit";

const remarkMermaid = () => (tree: Root) => {
  visit(tree, "code", (node: Code, index, parent) => {
    if (!parent || typeof index !== "number") return;
    if (node.lang !== "mermaid") return;

    const element = {
      type: "mdxJsxFlowElement",
      name: "Mermaid",
      attributes: [
        {
          type: "mdxJsxAttribute",
          name: "chart",
          value: node.value,
        },
      ],
      children: [],
    };

    (parent as Parent).children[index] = element as Parent["children"][number];
  });
};

export default remarkMermaid;
