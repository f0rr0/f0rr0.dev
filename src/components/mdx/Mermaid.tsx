"use client";

import { useEffect, useMemo, useState } from "react";

const sanitizeId = (value: string) => value.replaceAll(/[^a-zA-Z0-9-_]/g, "");

interface MermaidProps {
  chart: string;
  className?: string;
}

export default function Mermaid({ chart, className }: MermaidProps) {
  const [svg, setSvg] = useState<string | null>(null);
  const mermaidId = useMemo(
    () => sanitizeId(`mermaid-${Math.random().toString(36).slice(2)}`),
    []
  );

  useEffect(() => {
    let cancelled = false;

    const render = async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          securityLevel: "strict",
          startOnLoad: false,
          theme: "neutral",
        });

        const { svg } = await mermaid.render(mermaidId, chart);
        if (!cancelled) {
          setSvg(svg);
        }
      } catch {
        if (!cancelled) {
          setSvg(null);
        }
      }
    };

    void render();

    return () => {
      cancelled = true;
    };
  }, [chart, mermaidId]);

  if (svg === null || svg === "") {
    return (
      <pre className={className}>
        <code>{chart}</code>
      </pre>
    );
  }

  return (
    <div
      className={className}
      role="img"
      aria-label="Mermaid diagram"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
