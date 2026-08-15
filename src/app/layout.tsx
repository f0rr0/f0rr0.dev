import type { Metadata } from "next";
import localFont from "next/font/local";

import { JsonLd } from "@/components/json-ld";
import { ThemeProvider } from "@/components/theme-provider";
import { siteConfig } from "@/lib/site";
import { buildRootJsonLd } from "@/lib/structured-data";

import "./globals.css";

const literata = localFont({
  display: "swap",
  preload: true,
  src: "./fonts/Literata-Latin.woff2",
  variable: "--font-site-heading",
  weight: "400 700",
});

const sourceSans = localFont({
  display: "swap",
  preload: true,
  src: "./fonts/SourceSans3-Latin.woff2",
  variable: "--font-site-body",
  weight: "400 700",
});

export const metadata: Metadata = {
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
  description: siteConfig.description,
  metadataBase: new URL(siteConfig.url),
  openGraph: {
    description: siteConfig.description,
    locale: siteConfig.locale,
    images: [siteConfig.author.image],
    siteName: siteConfig.name,
    title: siteConfig.name,
    type: "website",
    url: siteConfig.url,
  },
  publisher: siteConfig.author.name,
  robots: {
    follow: true,
    googleBot: {
      follow: true,
      index: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
    index: true,
  },
  title: {
    default: siteConfig.name,
    template: `%s · ${siteConfig.name}`,
  },
  twitter: {
    card: "summary",
    description: siteConfig.description,
    images: [siteConfig.author.image],
    title: siteConfig.name,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${literata.variable} ${sourceSans.variable} min-h-screen antialiased`}
      >
        <JsonLd data={buildRootJsonLd()} />
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
