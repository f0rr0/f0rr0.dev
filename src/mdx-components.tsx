import type { MDXComponents } from "mdx/types";
import MDXImage from "@/components/mdx/MDXImage";
import MDXLink from "@/components/mdx/MDXLink";
import Mermaid from "@/components/mdx/Mermaid";

const components: MDXComponents = {
  a: MDXLink,
  img: MDXImage,
  Image: MDXImage,
  Mermaid,
};

export function useMDXComponents(): MDXComponents {
  return components;
}
