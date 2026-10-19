"use client";

import { useEffect } from "react";

import { articleDepth, track } from "@/lib/analytics";

export const ArticleAnalytics = ({ slug }: Readonly<{ slug: string }>) => {
  useEffect(() => {
    const article = document.querySelector("[data-article-body]");
    const reached = new Set<number>();
    let frame = 0;
    const measure = () => {
      frame = 0;
      if (article === null || document.visibilityState !== "visible") {
        return;
      }
      const { top, height } = article.getBoundingClientRect();
      const depth = articleDepth(top, height, window.innerHeight);
      for (const threshold of [25, 50, 75, 100]) {
        if (depth >= threshold && !reached.has(threshold)) {
          reached.add(threshold);
          track("article_depth_reached", {
            article_slug: slug,
            depth_percent: threshold,
          });
        }
      }
    };
    const schedule = () => {
      if (!frame) {
        frame = requestAnimationFrame(measure);
      }
    };
    const observer = new ResizeObserver(schedule);
    if (article !== null) {
      observer.observe(article);
    }
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    document.addEventListener("visibilitychange", schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [slug]);
  return null;
};
