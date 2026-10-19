import type { ReactNode } from "react";

export const ArticleProse = ({
  children,
}: Readonly<{ children: ReactNode }>) => (
  <div data-article-body className="article-prose">
    {children}
  </div>
);
