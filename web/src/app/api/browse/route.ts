import fs from "fs";
import path from "path";
import os from "os";
import { NextRequest, NextResponse } from "next/server";

export interface BrowseResponse {
  path: string;
  parent: string | null;
  dirs: string[];
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const rawPath = req.nextUrl.searchParams.get("path");
  const dir = rawPath ? path.resolve(rawPath) : os.homedir();

  try {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => path.join(dir, e.name))
      .sort();

    const parent = path.dirname(dir) !== dir ? path.dirname(dir) : null;

    return NextResponse.json({ path: dir, parent, dirs } satisfies BrowseResponse);
  } catch {
    return NextResponse.json({ error: "Cannot read directory" }, { status: 400 });
  }
}
