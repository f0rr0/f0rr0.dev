"use client";

/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- Scrollable diagram source needs keyboard access. */

import { Maximize2, Minimize2 } from "lucide-react";
import type { DiagramType, Mounted } from "pele/lazy";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { cn } from "@/lib/utils";

interface MermaidProps {
  chart: string;
  className?: string;
}

const diagramTypeNames: Partial<Record<DiagramType, string>> = {
  architecture: "Architecture",
  block: "Block diagram",
  c4: "C4 architecture",
  class: "Class diagram",
  er: "Entity relationship",
  eventmodeling: "Event model",
  flowchart: "Flowchart",
  gantt: "Gantt chart",
  gitGraph: "Git graph",
  journey: "User journey",
  mindmap: "Mind map",
  pie: "Pie chart",
  sankey: "Sankey diagram",
  sequence: "Sequence diagram",
  state: "State diagram",
  timeline: "Timeline",
  xychart: "XY chart",
};

function subscribeToFullscreen(subscriber: () => void) {
  document.addEventListener("fullscreenchange", subscriber);
  return () => {
    document.removeEventListener("fullscreenchange", subscriber);
  };
}

function getFullscreenSnapshot() {
  return document.fullscreenElement?.id ?? null;
}

function getServerFullscreenSnapshot() {
  return null;
}

function getDiagramTypeName(diagramType: DiagramType) {
  return (
    diagramTypeNames[diagramType] ??
    diagramType
      .replaceAll(/([a-z])([A-Z])/gu, "$1 $2")
      .replace(/^./u, (character) => character.toUpperCase())
  );
}

const loadDiagramRenderer = async () => await import("pele/lazy");

const Mermaid = ({ chart, className }: Readonly<MermaidProps>) => {
  const generatedId = useId();
  const mermaidId = `mermaid-${generatedId.replaceAll(/[^a-zA-Z0-9-_]/gu, "")}`;
  const frameId = `${mermaidId}-frame`;
  const frameRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [diagramType, setDiagramType] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fullscreenElementId = useSyncExternalStore(
    subscribeToFullscreen,
    getFullscreenSnapshot,
    getServerFullscreenSnapshot
  );
  const isFullscreen = fullscreenElementId === frameId;

  useEffect(() => {
    let cancelled = false;
    let mounted: Mounted | undefined;

    const onError = (error: unknown) => {
      if (!cancelled) {
        setErrorMessage(
          error instanceof Error ? error.message : "Unknown rendering error"
        );
      }
    };

    const renderDiagram = async () => {
      const canvas = canvasRef.current;

      if (canvas === null) {
        return;
      }

      try {
        const { detectType, load, mount } = await loadDiagramRenderer();
        await load(detectType(chart));

        if (cancelled) {
          return;
        }

        mounted = mount(canvas, chart, {
          directionBreakpoint: 1024,
          fontSize: 14,
          idPrefix: mermaidId,
          onError,
          onRender: (result) => {
            const typeName = getDiagramTypeName(result.type);
            const svg = canvas.querySelector("svg");

            if (svg !== null && !svg.hasAttribute("aria-labelledby")) {
              svg.setAttribute("aria-label", typeName);
            }

            setDiagramType(typeName);
            setErrorMessage(null);
          },
          zoom: true,
        });
      } catch (error) {
        onError(error);
      }
    };

    setErrorMessage(null);
    setDiagramType(null);
    void renderDiagram();

    return () => {
      cancelled = true;
      mounted?.destroy();
    };
  }, [chart, mermaidId]);

  const toggleFullscreen = async () => {
    const frame = frameRef.current;

    if (frame === null) {
      return;
    }

    try {
      await (document.fullscreenElement === frame
        ? document.exitFullscreen()
        : frame.requestFullscreen());
    } catch {
      frame.focus();
    }
  };

  const isLoading = diagramType === null && errorMessage === null;
  const isReady = diagramType !== null && errorMessage === null;
  const diagramLabel = diagramType ?? "Diagram";

  return (
    <figure
      aria-busy={isLoading}
      className={cn(
        "mermaid-block [&.mermaid-block:fullscreen]:bg-background min-w-0 overflow-hidden print:break-inside-avoid print:shadow-none [&.mermaid-block:fullscreen]:m-0 [&.mermaid-block:fullscreen]:flex [&.mermaid-block:fullscreen]:h-screen [&.mermaid-block:fullscreen]:w-screen [&.mermaid-block:fullscreen]:flex-col [&.mermaid-block:fullscreen]:rounded-none [&.mermaid-block:fullscreen]:border-0",
        className
      )}
      data-error={errorMessage}
      id={frameId}
      ref={frameRef}
      tabIndex={-1}
    >
      <div
        aria-label={`${diagramLabel}. Zoom in and drag to inspect the diagram.`}
        className="relative overflow-hidden p-4 print:overflow-visible print:p-3 [.mermaid-block:fullscreen_&]:flex [.mermaid-block:fullscreen_&]:min-h-0 [.mermaid-block:fullscreen_&]:flex-1 [.mermaid-block:fullscreen_&]:items-center [.mermaid-block:fullscreen_&]:p-[clamp(1rem,4vw,4rem)]"
        role="group"
      >
        <div
          className="[&>svg.pele:focus-visible]:outline-ring grid w-full min-w-0 place-items-center [&_.pele-error]:hidden print:[&_.pele-zoom]:invisible print:[&>svg.pele]:w-full [&>svg.pele:focus-visible]:outline-2 [&>svg.pele:focus-visible]:outline-offset-2 [.mermaid-block:fullscreen_&]:h-full [.mermaid-block:fullscreen_&>svg.pele]:max-h-full"
          ref={canvasRef}
        />
        {isLoading ? (
          <div
            aria-live="polite"
            className="text-muted-foreground flex min-h-30 items-center justify-center gap-3 font-sans text-sm"
            role="status"
          >
            <span
              aria-hidden="true"
              className="animate-mermaid-sketch-pulse h-[1.4rem] w-9 transform-[rotate(-3deg)] rounded-[48%_54%_46%_52%] [border:2px_solid_color-mix(in_oklab,var(--primary)_72%,transparent)] motion-reduce:animate-none"
            />
            <span>Drawing diagram…</span>
          </div>
        ) : null}
        {errorMessage === null ? null : (
          <div
            className="text-muted-foreground [&_strong]:text-foreground flex min-h-30 flex-col items-center justify-center gap-3 text-center font-sans text-sm [&_strong]:font-medium"
            role="alert"
          >
            <strong>Diagram unavailable</strong>
            <span>Read the diagram source below.</span>
            <details className="w-full text-start">
              <summary>View diagram source</summary>
              <pre
                tabIndex={0}
                role="region"
                aria-label="Diagram source"
                className="bg-background overflow-x-auto rounded-sm p-4 text-sm"
              >
                <code>{chart}</code>
              </pre>
            </details>
          </div>
        )}
      </div>
      <div className="mermaid-toolbar print:hidden">
        <span className="text-muted-foreground min-w-0 text-sm font-normal">
          {diagramLabel}
        </span>
        <div className="mermaid-toolbar-actions flex shrink-0 items-center gap-1">
          <button
            aria-label={
              isFullscreen
                ? "Exit full screen diagram"
                : "View diagram full screen"
            }
            className="mermaid-control"
            disabled={!isReady}
            onClick={() => {
              void toggleFullscreen();
            }}
            title={isFullscreen ? "Exit full screen" : "Full screen"}
            type="button"
          >
            {isFullscreen ? (
              <Minimize2 aria-hidden="true" />
            ) : (
              <Maximize2 aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    </figure>
  );
};

export default Mermaid;
