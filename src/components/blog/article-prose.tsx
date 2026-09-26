import type { ReactNode } from "react";

export function ArticleProse({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div data-article-body className="article-prose">
      {children}
    </div>
  );
}
