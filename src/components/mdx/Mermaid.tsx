"use client";

/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- Scrollable diagram source needs keyboard access. */

import { Maximize2, Minimize2, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import type {
  Mermaid as MermaidApi,
  MermaidConfig,
  RenderResult,
} from "mermaid";
import { useTheme } from "next-themes";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

interface MermaidProps {
  chart: string;
  className?: string;
}

interface RenderedDiagram {
  diagramType: string;
  naturalWidth: number;
  svg: string;
}

type RenderStatus = "error" | "loading" | "ready";
type SiteTheme = "dark" | "light";

const MAX_ZOOM = 2;
const MIN_ZOOM = 0.75;
const ZOOM_STEP = 0.25;
const FALLBACK_DIAGRAM_WIDTH = 720;
const ELK_LAYOUT_PATTERN =
  /(?:^|\n)\s*flowchart-elk\b|layout\s*:\s*["']?elk(?:\.[a-zA-Z]+)?["']?/u;

const diagramTypeNames: Record<string, string> = {
  architecture: "Architecture",
  block: "Block diagram",
  c4: "C4 architecture",
  class: "Class diagram",
  classDiagram: "Class diagram",
  "classDiagram-v2": "Class diagram",
  er: "Entity relationship",
  eventModeling: "Event model",
  flowchart: "Flowchart",
  "flowchart-elk": "Flowchart",
  "flowchart-v2": "Flowchart",
  gantt: "Gantt chart",
  gitGraph: "Git graph",
  journey: "User journey",
  mindmap: "Mind map",
  pie: "Pie chart",
  sankey: "Sankey diagram",
  sequence: "Sequence diagram",
  stateDiagram: "State diagram",
  "stateDiagram-v2": "State diagram",
  timeline: "Timeline",
  xychart: "XY chart",
};

let mermaidPromise: Promise<MermaidApi> | undefined;
let elkRegistrationPromise: Promise<void> | undefined;
let renderQueue: Promise<null> = Promise.resolve(null);

const fullscreenSubscribers = new Set<() => void>();

function emitFullscreenChange() {
  for (const subscriber of fullscreenSubscribers) {
    subscriber();
  }
}

function subscribeToFullscreen(subscriber: () => void) {
  fullscreenSubscribers.add(subscriber);

  if (fullscreenSubscribers.size === 1) {
    document.addEventListener("fullscreenchange", emitFullscreenChange);
  }

  return () => {
    fullscreenSubscribers.delete(subscriber);

    if (fullscreenSubscribers.size === 0) {
      document.removeEventListener("fullscreenchange", emitFullscreenChange);
    }
  };
}

function getFullscreenSnapshot() {
  return document.fullscreenElement?.id ?? null;
}

function getServerFullscreenSnapshot() {
  return null;
}

async function importMermaid() {
  const { default: mermaid } = await import("mermaid");
  return mermaid;
}

async function loadMermaid() {
  mermaidPromise ??= importMermaid();
  return await mermaidPromise;
}

async function importAndRegisterElk(mermaid: MermaidApi) {
  const { default: elkLayouts } = await import("@mermaid-js/layout-elk");
  mermaid.registerLayoutLoaders(elkLayouts);
}

async function registerElkLayouts(mermaid: MermaidApi) {
  elkRegistrationPromise ??= importAndRegisterElk(mermaid);
  await elkRegistrationPromise;
}

async function enqueueRender<T>(render: () => Promise<T>) {
  const previousRender = renderQueue;
  const queueTurn = Promise.withResolvers<null>();
  renderQueue = queueTurn.promise;

  await previousRender;

  try {
    return await render();
  } finally {
    queueTurn.resolve(null);
  }
}

function getDiagramTypeName(diagramType: string) {
  const knownName = diagramTypeNames[diagramType];

  if (knownName !== undefined) {
    return knownName;
  }

  return diagramType
    .replaceAll(/[-_]+/gu, " ")
    .replaceAll(/([a-z])([A-Z])/gu, "$1 $2")
    .replaceAll(/\bv\d+\b/gu, "")
    .trim()
    .replace(/^./u, (character) => character.toUpperCase());
}

function createMermaidConfig({
  id,
  element,
  theme,
}: {
  id: string;
  element: HTMLElement;
  theme: SiteTheme;
}): MermaidConfig {
  const isDark = theme === "dark";
  const styles = getComputedStyle(element);
  const color = (token: string) => styles.getPropertyValue(token).trim();

  return {
    darkMode: isDark,
    deterministicIDSeed: id,
    deterministicIds: true,
    flowchart: {
      curve: "basis",
      nodeSpacing: 32,
      padding: 12,
      rankSpacing: 40,
      useMaxWidth: true,
    },
    fontFamily: "var(--font-sans), ui-sans-serif, sans-serif",
    fontSize: 14,
    look: "classic",
    markdownAutoWrap: true,
    securityLevel: "strict",
    startOnLoad: false,
    suppressErrorRendering: true,
    theme: "base",
    themeCSS: `
      text, foreignObject, .label, .nodeLabel, .edgeLabel, .messageText, .loopText {
        font-size: 14px;
        font-weight: 400;
        line-height: calc(20 / 14);
      }
      .edgeLabel {
        border-radius: 0.375rem;
      }
    `,
    themeVariables: {
      darkMode: isDark,
      fontSize: "14px",
      background: color("--muted"),
      primaryColor: color("--background"),
      primaryBorderColor: color("--muted-foreground"),
      primaryTextColor: color("--foreground"),
      secondaryColor: color("--accent"),
      secondaryBorderColor: color("--primary"),
      secondaryTextColor: color("--foreground"),
      tertiaryColor: color("--muted"),
      tertiaryBorderColor: color("--border"),
      tertiaryTextColor: color("--foreground"),
      lineColor: color("--muted-foreground"),
      textColor: color("--foreground"),
      mainBkg: color("--background"),
      nodeBorder: color("--muted-foreground"),
      clusterBkg: color("--muted"),
      clusterBorder: color("--border"),
      edgeLabelBackground: color("--muted"),
      noteBkgColor: color("--accent"),
      noteBorderColor: color("--primary"),
      noteTextColor: color("--foreground"),
    },
    wrap: true,
  };
}

function normalizeSvg(svg: string, diagramType: string) {
  const template = document.createElement("template");
  template.innerHTML = svg.trim();
  const element = template.content.querySelector("svg");

  if (element === null) {
    throw new Error("Mermaid did not return an SVG element");
  }

  const viewBox = element
    .getAttribute("viewBox")
    ?.trim()
    .split(/\s+/u)
    .map(Number);
  const viewBoxWidth = viewBox?.length === 4 ? viewBox[2] : undefined;
  const naturalWidth =
    viewBoxWidth !== undefined && Number.isFinite(viewBoxWidth)
      ? Math.max(viewBoxWidth, 1)
      : FALLBACK_DIAGRAM_WIDTH;

  element.classList.add("mermaid-svg");
  element.removeAttribute("height");
  element.removeAttribute("style");
  element.removeAttribute("width");
  element.setAttribute("focusable", "false");
  element.setAttribute("preserveAspectRatio", "xMidYMid meet");

  if (
    !element.hasAttribute("aria-label") &&
    !element.hasAttribute("aria-labelledby")
  ) {
    element.setAttribute(
      "aria-label",
      `${getDiagramTypeName(diagramType)} diagram`
    );
  }

  if (!element.hasAttribute("role")) {
    element.setAttribute("role", "img");
  }

  return {
    naturalWidth,
    svg: element.outerHTML,
  };
}

export default function Mermaid({ chart, className }: Readonly<MermaidProps>) {
  const { resolvedTheme } = useTheme();
  const generatedId = useId();
  const mermaidId = useMemo(
    () => `mermaid-${generatedId.replaceAll(/[^a-zA-Z0-9-_]/gu, "")}`,
    [generatedId]
  );
  const frameId = `${mermaidId}-frame`;
  const frameRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const bindFunctionsRef = useRef<RenderResult["bindFunctions"] | null>(null);
  const [diagram, setDiagram] = useState<RenderedDiagram | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<RenderStatus>("loading");
  const [zoom, setZoom] = useState(1);
  const fullscreenElementId = useSyncExternalStore(
    subscribeToFullscreen,
    getFullscreenSnapshot,
    getServerFullscreenSnapshot
  );
  const isFullscreen = fullscreenElementId === frameId;
  const siteTheme: SiteTheme = resolvedTheme === "dark" ? "dark" : "light";

  useEffect(() => {
    let cancelled = false;

    const renderDiagram = async () => {
      const element = frameRef.current;
      if (element === null) {
        throw new Error("Diagram container is unavailable");
      }
      const mermaid = await loadMermaid();

      if (ELK_LAYOUT_PATTERN.test(chart)) {
        await registerElkLayouts(mermaid);
      }

      return await enqueueRender(async () => {
        mermaid.initialize(
          createMermaidConfig({
            id: mermaidId,
            element,
            theme: siteTheme,
          })
        );

        return await mermaid.render(mermaidId, chart);
      });
    };

    const runRender = async () => {
      try {
        const result = await renderDiagram();
        const normalizedSvg = normalizeSvg(result.svg, result.diagramType);

        if (cancelled) {
          return;
        }

        bindFunctionsRef.current = result.bindFunctions;
        setDiagram({
          diagramType: getDiagramTypeName(result.diagramType),
          naturalWidth: normalizedSvg.naturalWidth,
          svg: normalizedSvg.svg,
        });
        setStatus("ready");
      } catch (error) {
        if (!cancelled) {
          bindFunctionsRef.current = null;
          setDiagram(null);
          setErrorMessage(
            error instanceof Error ? error.message : "Unknown rendering error"
          );
          setStatus("error");
        }
      }
    };

    if (resolvedTheme === "dark" || resolvedTheme === "light") {
      setErrorMessage(null);
      setStatus("loading");
      void runRender();
    }

    return () => {
      cancelled = true;
    };
  }, [chart, mermaidId, resolvedTheme, siteTheme]);

  useEffect(() => {
    if (status === "ready" && canvasRef.current !== null) {
      bindFunctionsRef.current?.(canvasRef.current);
    }
  }, [diagram, status]);

  const changeZoom = (change: number) => {
    setZoom((currentZoom) =>
      Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, currentZoom + change))
    );
  };

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

  const diagramStyle =
    diagram === null
      ? undefined
      : ({
          "--mermaid-render-width": `${Math.round(
            diagram.naturalWidth * zoom
          )}px`,
        } as CSSProperties);
  const diagramType = diagram?.diagramType ?? "Diagram";

  return (
    <figure
      aria-busy={status === "loading"}
      className={cn(
        "mermaid-block min-w-0 overflow-hidden [&.mermaid-block:fullscreen]:flex [&.mermaid-block:fullscreen]:w-screen [&.mermaid-block:fullscreen]:h-screen [&.mermaid-block:fullscreen]:m-0 [&.mermaid-block:fullscreen]:flex-col [&.mermaid-block:fullscreen]:border-0 [&.mermaid-block:fullscreen]:rounded-none [&.mermaid-block:fullscreen]:bg-background print:break-inside-avoid print:shadow-none",
        className
      )}
      data-error={status === "error" ? errorMessage : null}
      data-rendering={
        status === "loading" && diagram !== null ? "true" : "false"
      }
      id={frameId}
      ref={frameRef}
      tabIndex={-1}
    >
      <div
        aria-label={`${diagramType}. Scroll horizontally to inspect larger diagrams.`}
        className="relative overflow-x-auto [overscroll-behavior-inline:contain] p-4 [scrollbar-color:color-mix(in_oklab,var(--muted-foreground)_52%,transparent)_color-mix(in_oklab,var(--muted)_58%,transparent)] scrollbar-thin focus-visible:[outline:2px_solid_var(--ring)] focus-visible:-outline-offset-2 [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar-track]:[border-top:1px_solid_color-mix(in_oklab,var(--border)_72%,transparent)] [&::-webkit-scrollbar-track]:[background:color-mix(in_oklab,var(--muted)_58%,transparent)] [&::-webkit-scrollbar-thumb]:[border:0.2rem_solid_transparent] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:[background:color-mix(in_oklab,var(--muted-foreground)_52%,transparent)] [&::-webkit-scrollbar-thumb]:bg-clip-padding [.mermaid-block:fullscreen_&]:flex [.mermaid-block:fullscreen_&]:min-h-0 [.mermaid-block:fullscreen_&]:flex-1 [.mermaid-block:fullscreen_&]:items-center [.mermaid-block:fullscreen_&]:p-[clamp(1rem,4vw,4rem)] print:min-h-0 print:overflow-visible print:[background:transparent] print:p-3"
        tabIndex={diagram === null ? -1 : 0}
      >
        {diagram === null ? null : (
          <div
            className="flex w-max min-w-full items-start justify-center [&_.mermaid-svg]:block [&_.mermaid-svg]:w-(--mermaid-render-width) [&_.mermaid-svg]:max-w-none [&_.mermaid-svg]:h-auto [&_.mermaid-svg]:flex-none [&_.mermaid-svg]:overflow-visible [&_.mermaid-svg]:bg-transparent [.mermaid-block[data-rendering='true']_&]:opacity-[0.58] [.mermaid-block:fullscreen_&]:items-center print:w-full print:[&_.mermaid-svg]:w-full print:[&_.mermaid-svg]:max-w-full"
            dangerouslySetInnerHTML={{ __html: diagram.svg }}
            ref={canvasRef}
            style={diagramStyle}
          />
        )}
        {status === "loading" && diagram === null ? (
          <div
            aria-live="polite"
            className="flex min-h-30 items-center justify-center gap-3 text-muted-foreground font-sans text-sm"
            role="status"
          >
            <span
              aria-hidden="true"
              className="motion-reduce:animate-none w-9 h-[1.4rem] [border:2px_solid_color-mix(in_oklab,var(--primary)_72%,transparent)] rounded-[48%_54%_46%_52%] animate-mermaid-sketch-pulse transform-[rotate(-3deg)]"
            />
            <span>Drawing diagram…</span>
          </div>
        ) : null}
        {status === "error" ? (
          <div
            className="flex min-h-30 flex-col items-center justify-center gap-3 text-center font-sans text-sm text-muted-foreground [&_strong]:font-medium [&_strong]:text-foreground"
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
                className="overflow-x-auto rounded-sm bg-background p-4 text-sm"
              >
                <code>{chart}</code>
              </pre>
            </details>
          </div>
        ) : null}
      </div>
      <div className="mermaid-toolbar print:hidden">
        <span className="min-w-0 text-sm font-normal text-muted-foreground">
          {diagramType}
        </span>
        <div className="mermaid-toolbar-actions flex shrink-0 items-center gap-1">
          <button
            aria-label="Zoom diagram out"
            className="mermaid-control"
            disabled={zoom <= MIN_ZOOM || diagram === null}
            onClick={() => {
              changeZoom(-ZOOM_STEP);
            }}
            title="Zoom out"
            type="button"
          >
            <ZoomOut aria-hidden="true" />
          </button>
          <button
            aria-label={`Reset diagram zoom (currently ${Math.round(zoom * 100)}%)`}
            className="mermaid-control tabular-nums min-w-16 max-sm:[&_span]:hidden"
            disabled={zoom === 1 || diagram === null}
            onClick={() => {
              setZoom(1);
            }}
            title="Reset zoom"
            type="button"
          >
            <RotateCcw aria-hidden="true" />
            <span>{Math.round(zoom * 100)}%</span>
          </button>
          <button
            aria-label="Zoom diagram in"
            className="mermaid-control"
            disabled={zoom >= MAX_ZOOM || diagram === null}
            onClick={() => {
              changeZoom(ZOOM_STEP);
            }}
            title="Zoom in"
            type="button"
          >
            <ZoomIn aria-hidden="true" />
          </button>
          <button
            aria-label={
              isFullscreen
                ? "Exit full screen diagram"
                : "View diagram full screen"
            }
            className="mermaid-control"
            disabled={diagram === null}
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
}
