import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";

import { JsonLd } from "@/components/json-ld";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { pages } from "@/content/pages";
import { env } from "@/env";
import { buildPageMetadata } from "@/lib/page-metadata";
import { siteConfig } from "@/lib/site";
import { buildRootJsonLd } from "@/lib/structured-data";

import "./globals.css";

const sans = Geist({
  display: "swap",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-geist",
});

const mono = Geist_Mono({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-geist-mono",
  weight: "400",
});

const serif = Instrument_Serif({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-instrument-serif",
  weight: "400",
});

export const metadata: Metadata = {
  ...buildPageMetadata(pages.home),
  alternates: {
    canonical: "/",
    types: {
      "application/rss+xml": `${siteConfig.url}/rss.xml`,
      "application/json": [
        {
          title: "JSON Resume",
          url: "/resume.json",
        },
      ],
      "text/plain": [
        {
          title: "LLMs profile context",
          url: "/llms.txt",
        },
      ],
    },
  },
  authors: [
    {
      name: siteConfig.author.name,
      url: siteConfig.url,
    },
  ],
  creator: siteConfig.author.name,
  metadataBase: new URL(siteConfig.url),
  publisher: siteConfig.author.name,
  robots: {
    follow: true,
    googleBot: {
      follow: true,
      index: env.VERCEL_ENV !== "preview",
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
    index: env.VERCEL_ENV !== "preview",
  },
  title: {
    default: siteConfig.name,
    template: `%s | ${siteConfig.name}`,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      className={`${sans.variable} ${mono.variable} ${serif.variable}`}
      lang="en"
      suppressHydrationWarning
    >
      <head>
        <link href="/llms.txt" rel="describedby" />
      </head>
      <body className="min-h-screen font-sans antialiased [&_:is(a,button,summary)]:decoration-wavy [&_:is(a,button,summary)]:decoration-1 [&_:is(a,button,summary)]:underline-offset-4 [&_:is(a,button)_:is(h3,span)]:decoration-wavy [&_:is(a,button)_:is(h3,span)]:decoration-1 [&_:is(a,button)_:is(h3,span)]:underline-offset-4">
        <JsonLd data={buildRootJsonLd()} />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          disableTransitionOnChange
          enableSystem
        >
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
