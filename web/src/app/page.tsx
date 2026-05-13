"use client";

import { useGraph } from "@/hooks/useGraph";

export default function Home() {
  const { graph, loading, error } = useGraph();

  if (loading) return <p>Loading...</p>;
  if (error) return <p className="text-red-500">{error}</p>;

  return <pre>{JSON.stringify(graph?.stats, null, 2)}</pre>;
}
