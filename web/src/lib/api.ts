import type { GraphOutput } from "@/types/graph";

/**
 * Fetches the dependency graph from either the external Python analyzer server
 * or the internal Next.js API route, depending on whether `NEXT_PUBLIC_ANALYZER_URL`
 * is set in the environment.
 *
 * @returns The parsed {@link GraphOutput} object produced by the analyzer.
 * @throws {Error} If the HTTP response status is not in the 2xx range.
 */
export async function fetchGraph(): Promise<GraphOutput> {
  const analyzerUrl = process.env.NEXT_PUBLIC_ANALYZER_URL;
  const url = analyzerUrl ? `${analyzerUrl}/graph` : "/api/graph";

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch graph from ${url}: ${response.status} ${response.statusText}`
    );
  }

  return response.json() as Promise<GraphOutput>;
}
