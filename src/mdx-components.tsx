import type { MDXComponents } from "mdx/types";

import CodeBlock from "@/components/mdx/CodeBlock";
import MDXLink from "@/components/mdx/MDXLink";
import Mermaid from "@/components/mdx/Mermaid";

const components: MDXComponents = {
  Mermaid,
  a: MDXLink,
  pre: CodeBlock,
};

export function useMDXComponents(overrides: MDXComponents = {}): MDXComponents {
  return {
    ...components,
    ...overrides,
  };
}
