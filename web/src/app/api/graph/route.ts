import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

/** GET /api/graph — reads graph.json from disk and returns it as JSON. */
export async function GET(): Promise<NextResponse> {
  const graphPath =
    process.env.GRAPH_JSON_PATH ?? path.join(process.cwd(), "graph.json");

  try {
    const raw = await fs.promises.readFile(graphPath, "utf-8");
    const data: unknown = JSON.parse(raw);

    return NextResponse.json(data, {
      headers: { "cache-control": "no-store" },
    });
  } catch (err) {
    if (
      err instanceof Error &&
      (err as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return NextResponse.json(
        {
          error: "graph.json not found",
          hint: "Run: codemap scan <path> --output graph.json",
        },
        { status: 404 }
      );
    }
    throw err;
  }
}
