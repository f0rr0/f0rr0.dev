"use client";

import { ArrowUp } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import type { ReactNode } from "react";

import {
  comparePublicActivityRevisions,
  nextPublicActivityPoll,
  publicActivityHeadFrom,
} from "@/lib/github-activity-status";
import type { PublicActivityHead } from "@/lib/github-activity-types";

interface GitHubActivityLiveContextValue {
  feedRevision: string;
  isRefreshing: boolean;
  latestAvailable: boolean;
  markLatestAvailable: () => void;
  refreshCompletion: number;
  refreshLatest: () => void;
}

const GitHubActivityLiveContext =
  createContext<GitHubActivityLiveContextValue | null>(null);

export function useGitHubActivityLive() {
  const context = use(GitHubActivityLiveContext);
  if (context === null) {
    throw new Error("GitHub activity live context is unavailable.");
  }
  return context;
}

export function GitHubActivityLiveProvider({
  children,
  feedRevision,
  orderingRevision,
}: Readonly<{
  children: ReactNode;
  feedRevision: string;
  orderingRevision: string;
}>) {
  const router = useRouter();
  const previousFeedRevision = useRef(feedRevision);
  const previousOrderingRevision = useRef(orderingRevision);
  const refreshRequested = useRef(false);
  const [isRefreshing, startRefresh] = useTransition();
  const [latestAvailable, setLatestAvailable] = useState(false);
  const [refreshCompletion, setRefreshCompletion] = useState(0);

  useEffect(() => {
    if (
      previousFeedRevision.current === feedRevision &&
      previousOrderingRevision.current === orderingRevision
    ) {
      return;
    }
    previousFeedRevision.current = feedRevision;
    previousOrderingRevision.current = orderingRevision;
    setLatestAvailable(false);
    if (refreshRequested.current) {
      refreshRequested.current = false;
      setRefreshCompletion((current) => current + 1);
    }
  }, [feedRevision, orderingRevision]);

  const markLatestAvailable = useCallback(() => {
    setLatestAvailable(true);
  }, []);

  const refreshLatest = useCallback(() => {
    refreshRequested.current = true;
    startRefresh(() => {
      router.refresh();
    });
  }, [router]);

  return (
    <GitHubActivityLiveContext
      value={{
        feedRevision,
        isRefreshing,
        latestAvailable,
        markLatestAvailable,
        refreshCompletion,
        refreshLatest,
      }}
    >
      {children}
    </GitHubActivityLiveContext>
  );
}

export function GitHubActivityStatus({
  initialHead,
}: Readonly<{ initialHead: PublicActivityHead }>) {
  const {
    feedRevision,
    isRefreshing,
    latestAvailable,
    markLatestAvailable,
    refreshCompletion,
    refreshLatest,
  } = useGitHubActivityLive();
  const containerRef = useRef<HTMLDivElement>(null);
  const etag = useRef<string | null>(null);
  const requestCount = useRef(0);
  const settledRequestCount = useRef(0);
  const [head, setHead] = useState(initialHead);
  const [inViewport, setInViewport] = useState(false);
  const [online, setOnline] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const [pollCycle, setPollCycle] = useState(0);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    etag.current = null;
    requestCount.current = 0;
    settledRequestCount.current = 0;
    setHead(initialHead);
    setPollCycle((cycle) => cycle + 1);
  }, [feedRevision, initialHead]);

  useEffect(() => {
    const target = containerRef.current?.closest("#timeline");
    let observer: IntersectionObserver | null = null;
    if (target !== null && target !== undefined) {
      if (typeof IntersectionObserver === "undefined") {
        setInViewport(true);
      } else {
        observer = new IntersectionObserver(([entry]) => {
          setInViewport(entry?.isIntersecting ?? false);
        });
        observer.observe(target);
      }
    }
    return () => {
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    const updateVisibility = () => {
      setPageVisible(document.visibilityState === "visible");
    };
    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    return () => {
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, []);

  useEffect(() => {
    const updateOnline = () => {
      setOnline(navigator.onLine);
    };
    updateOnline();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  useEffect(() => {
    if (head.feedRevision !== feedRevision) {
      markLatestAvailable();
    }
  }, [feedRevision, head.feedRevision, markLatestAvailable]);

  useEffect(() => {
    if (latestAvailable) {
      setAnnouncement("New GitHub work is available.");
    }
  }, [latestAvailable]);

  useEffect(() => {
    if (refreshCompletion === 0) {
      return;
    }
    containerRef.current?.focus({ preventScroll: true });
    setAnnouncement("Latest GitHub work is shown.");
  }, [refreshCompletion]);

  const canPoll =
    inViewport && online && pageVisible && !latestAvailable && !isRefreshing;

  useEffect(() => {
    let controller: AbortController | null = null;
    let current = true;
    let timeout: number | null = null;
    if (canPoll) {
      const plan = nextPublicActivityPoll(head, {
        requestCount: requestCount.current,
        settledRequestCount: settledRequestCount.current,
      });
      if (plan !== null) {
        const requestController = new AbortController();
        controller = requestController;
        timeout = window.setTimeout(() => {
          requestCount.current += 1;
          if (plan.kind === "settled") {
            settledRequestCount.current += 1;
          }
          void (async () => {
            try {
              const response = await fetch("/api/github/activity/head", {
                headers:
                  etag.current === null
                    ? undefined
                    : { "If-None-Match": etag.current },
                signal: requestController.signal,
              });
              if (response.status === 304) {
                return;
              }
              if (!response.ok) {
                return;
              }
              const nextHead = publicActivityHeadFrom(
                (await response.json()) as unknown
              );
              if (
                nextHead === null ||
                !current ||
                comparePublicActivityRevisions(
                  nextHead.revision,
                  head.revision
                ) < 0
              ) {
                return;
              }
              etag.current = response.headers.get("etag");
              setHead(nextHead);
              if (nextHead.feedRevision !== feedRevision) {
                markLatestAvailable();
              }
            } catch {
              // A failed passive check keeps the last known state.
            } finally {
              if (current) {
                setPollCycle((cycle) => cycle + 1);
              }
            }
          })();
        }, plan.delayMs);
      }
    }
    return () => {
      current = false;
      if (timeout !== null) {
        window.clearTimeout(timeout);
      }
      controller?.abort();
    };
  }, [canPoll, feedRevision, head, markLatestAvailable, pollCycle]);

  return (
    <div
      className="outline-none"
      id="github-activity-status"
      ref={containerRef}
      tabIndex={-1}
    >
      {latestAvailable ? (
        <button
          className="mt-4 inline-flex min-h-6 items-center gap-1.5 font-mono text-[0.6875rem] text-primary transition-colors duration-150 hover:text-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
          disabled={isRefreshing}
          onClick={refreshLatest}
          type="button"
        >
          <ArrowUp aria-hidden="true" className="size-3" />
          {isRefreshing ? "Showing latest work…" : "Show latest work"}
        </button>
      ) : null}
      <p aria-live="polite" className="sr-only" role="status">
        {announcement}
      </p>
    </div>
  );
}
