import Link from "next/link";

import ThemeToggle from "@/components/ThemeToggle";

export default function BlogLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const navLinkClassName =
    "inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted/60 hover:text-foreground";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/blog" className="group">
            <div className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground/80">
              Journal
            </div>
            <div className="text-lg font-semibold tracking-tight transition group-hover:text-foreground/80">
              F0RR0
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/rss.xml" className={navLinkClassName}>
              RSS
            </Link>
            <Link href="/" className={navLinkClassName}>
              Portfolio
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
