"use client";

import { useState, useEffect, useCallback } from "react";
import type { GraphOutput } from "@/types/graph";
import { fetchGraph } from "@/lib/api";

/**
 * React hook that fetches the dependency graph and exposes reactive state
 * for the data, loading status, and any error message.
 *
 * @returns An object with:
 * - `graph` — the fetched {@link GraphOutput}, or `null` before the first
 *   successful load.
 * - `loading` — `true` while a fetch is in progress.
 * - `error` — a human-readable error message if the last fetch failed,
 *   otherwise `null`.
 * - `refetch` — call this to manually trigger a new fetch.
 */
export function useGraph(): {
  graph: GraphOutput | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const [graph, setGraph] = useState<GraphOutput | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);

    fetchGraph()
      .then((data) => {
        setGraph(data);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { graph, loading, error, refetch: load };
}
