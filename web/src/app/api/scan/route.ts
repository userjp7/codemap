import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { NextRequest, NextResponse } from "next/server";

const execAsync = promisify(exec);

const ANALYZER_DIR = path.resolve(process.cwd(), "../analyzer");
const OUTPUT_PATH = process.env.GRAPH_JSON_PATH ?? path.join(process.cwd(), "graph.json");

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { path?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const scanPath = typeof body.path === "string" ? body.path.trim() : "";
  if (!scanPath) {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }

  try {
    const { stdout, stderr } = await execAsync(
      `uv run codemap scan "${scanPath}" --output "${OUTPUT_PATH}"`,
      { cwd: ANALYZER_DIR, timeout: 120_000 }
    );
    return NextResponse.json({ success: true, stdout, stderr });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
