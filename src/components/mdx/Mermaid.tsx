"use client";

import { useEffect, useMemo, useState } from "react";

const sanitizeId = (value: string) => value.replace(/[^a-zA-Z0-9-_]/g, "");

type MermaidProps = {
  chart: string;
  className?: string;
};

export default function Mermaid({ chart, className }: MermaidProps) {
  const [svg, setSvg] = useState<string | null>(null);
  const mermaidId = useMemo(
    () => sanitizeId(`mermaid-${Math.random().toString(36).slice(2)}`),
    [],
  );

  useEffect(() => {
    let cancelled = false;

    const render = async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
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

    render();

    return () => {
      cancelled = true;
    };
  }, [chart, mermaidId]);

  if (!svg) {
    return (
      <pre className={className}>
        <code>{chart}</code>
      </pre>
    );
  }

  return (
    <div
      className={className}
      aria-label="Mermaid diagram"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: Mermaid renders trusted diagrams.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
