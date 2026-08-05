"use client";

import { Maximize2, Minimize2, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import type { Mermaid, MermaidConfig, RenderResult } from "mermaid";
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
};

const siteThemeVariables: Record<
  SiteTheme,
  Record<string, boolean | string>
> = {
  dark: {
    background: "#1a1918",
    clusterBkg: "#242322",
    clusterBorder: "#3a3836",
    darkMode: true,
    edgeLabelBackground: "#1a1918",
    lineColor: "#a8a29e",
    mainBkg: "#322619",
    nodeBorder: "#d97706",
    noteBkgColor: "#2b2319",
    noteBorderColor: "#6a4b24",
    noteTextColor: "#e8ae58",
    primaryBorderColor: "#d97706",
    primaryColor: "#322619",
    primaryTextColor: "#e7e5e4",
    secondaryBorderColor: "#6a4b24",
    secondaryColor: "#2b2927",
    secondaryTextColor: "#d6d3d1",
    tertiaryBorderColor: "#3a3836",
    tertiaryColor: "#242322",
    tertiaryTextColor: "#a8a29e",
    textColor: "#e7e5e4",
  },
  light: {
    background: "#faf9f6",
    clusterBkg: "#f2efea",
    clusterBorder: "#d6d3d1",
    darkMode: false,
    edgeLabelBackground: "#faf9f6",
    lineColor: "#78716c",
    mainBkg: "#fff7ed",
    nodeBorder: "#b45309",
    noteBkgColor: "#f9ebd2",
    noteBorderColor: "#e4c184",
    noteTextColor: "#835018",
    primaryBorderColor: "#b45309",
    primaryColor: "#fff7ed",
    primaryTextColor: "#292524",
    secondaryBorderColor: "#e4c184",
    secondaryColor: "#f7ead8",
    secondaryTextColor: "#57534e",
    tertiaryBorderColor: "#d6d3d1",
    tertiaryColor: "#f2efea",
    tertiaryTextColor: "#57534e",
    textColor: "#292524",
  },
};

let mermaidPromise: Promise<Mermaid> | undefined;
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

async function importAndRegisterElk(mermaid: Mermaid) {
  // Keep this lazy. The compatible 0.1.9 release is pinned because 0.2.x
  // serializes live DOM nodes while rendering inside React.
  const { default: elkLayouts } = await import("@mermaid-js/layout-elk");
  mermaid.registerLayoutLoaders(elkLayouts);
}

async function registerElkLayouts(mermaid: Mermaid) {
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

function createHandDrawnSeed(chart: string) {
  let seed = 17;

  for (const character of chart) {
    seed = (seed * 31 + (character.codePointAt(0) ?? 0)) % 2_147_483_647;
  }

  return seed === 0 ? 7 : seed;
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
  seed,
  theme,
}: {
  id: string;
  seed: number;
  theme: SiteTheme;
}): MermaidConfig {
  const isDark = theme === "dark";

  return {
    darkMode: isDark,
    deterministicIDSeed: id,
    deterministicIds: true,
    flowchart: {
      curve: "basis",
      nodeSpacing: 44,
      padding: 16,
      rankSpacing: 52,
      useMaxWidth: true,
    },
    fontFamily: "var(--font-site-body), ui-sans-serif, sans-serif",
    fontSize: 16,
    handDrawnSeed: seed,
    look: "handDrawn",
    markdownAutoWrap: true,
    securityLevel: "strict",
    startOnLoad: false,
    suppressErrorRendering: true,
    theme: "base",
    themeCSS: `
      .label, .nodeLabel, .edgeLabel, .messageText, .loopText {
        font-weight: 600;
      }
      .edgeLabel {
        border-radius: 0.375rem;
      }
    `,
    themeVariables: siteThemeVariables[theme],
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
  const seed = useMemo(() => createHandDrawnSeed(chart), [chart]);
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
      const mermaid = await loadMermaid();

      if (ELK_LAYOUT_PATTERN.test(chart)) {
        await registerElkLayouts(mermaid);
      }

      return await enqueueRender(async () => {
        mermaid.initialize(
          createMermaidConfig({
            id: mermaidId,
            seed,
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
  }, [chart, mermaidId, resolvedTheme, seed, siteTheme]);

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
      className={cn("mermaid-block", className)}
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
        className="mermaid-viewport"
        tabIndex={diagram === null ? -1 : 0}
      >
        {diagram === null ? null : (
          <div
            className="mermaid-canvas"
            dangerouslySetInnerHTML={{ __html: diagram.svg }}
            ref={canvasRef}
            style={diagramStyle}
          />
        )}
        {status === "loading" && diagram === null ? (
          <div aria-live="polite" className="mermaid-placeholder" role="status">
            <span aria-hidden="true" className="mermaid-placeholder-mark" />
            <span>Drawing diagram…</span>
          </div>
        ) : null}
        {status === "error" ? (
          <div className="mermaid-error" role="alert">
            <strong>Diagram unavailable</strong>
            <span>The Mermaid source could not be rendered.</span>
          </div>
        ) : null}
      </div>
      <div className="mermaid-toolbar">
        <span className="mermaid-diagram-type">{diagramType}</span>
        <div className="mermaid-toolbar-actions">
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
            aria-label="Reset diagram zoom"
            className="mermaid-control mermaid-zoom-reset"
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
          <span className="mermaid-language">Mermaid</span>
        </div>
      </div>
    </figure>
  );
}
