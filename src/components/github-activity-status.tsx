"use client";

import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
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
  fetchPublicActivityHead,
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
  const [queryClient] = useState(() => new QueryClient());
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
    <QueryClientProvider client={queryClient}>
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
    </QueryClientProvider>
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
  const { data: head, dataUpdatedAt } = useQuery({
    queryKey: ["github-activity-head", initialHead.revision],
    initialData: initialHead,
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 1,
    queryFn: async ({ signal }) =>
      await fetchPublicActivityHead(initialHead, signal),
  });

  useEffect(() => {
    // A refresh can serve stale cached data. Retry after the next successful poll.
    if (comparePublicActivityRevisions(head.feedRevision, feedRevision) > 0) {
      markLatestAvailable();
      refreshLatest();
    }
  }, [
    dataUpdatedAt,
    feedRevision,
    head.feedRevision,
    markLatestAvailable,
    refreshLatest,
  ]);

  return (
    <div id="github-activity-status">
      {latestAvailable ? (
        <button
          className="site-text-link inline-flex min-h-11 items-center gap-1.5 rounded-sm text-sm text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 mt-2"
          disabled={isRefreshing}
          onClick={refreshLatest}
          type="button"
        >
          {isRefreshing ? "Refreshing…" : "Refresh work"}
        </button>
      ) : null}
      <p aria-live="polite" className="sr-only" role="status">
        {latestAvailable
          ? "New work is available."
          : refreshCompletion > 0
            ? "Latest work is shown."
            : ""}
      </p>
    </div>
  );
}
