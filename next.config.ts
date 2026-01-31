import type { NextConfig } from "next";
import createMDX from '@next/mdx'

const nextConfig: NextConfig = {
  /* config options here */
};

const withMDX = createMDX({
  options: {
    remarkPlugins: [
      'remark-gfm',
    ],
    rehypePlugins: [
      'rehype-slug',
    ],
  },
})

export default withMDX(nextConfig);
