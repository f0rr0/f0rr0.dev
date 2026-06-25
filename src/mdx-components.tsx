import type { MDXComponents } from "mdx/types";

import MDXLink from "@/components/mdx/MDXLink";
import Mermaid from "@/components/mdx/Mermaid";

const components: MDXComponents = {
  Mermaid,
  a: MDXLink,
};

export function useMDXComponents(overrides: MDXComponents = {}): MDXComponents {
  return {
    ...components,
    ...overrides,
  };
}
