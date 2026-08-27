import { readFileSync } from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    const buildIdPath = path.join(process.cwd(), ".next", "BUILD_ID");
    const buildId = readFileSync(buildIdPath, "utf8").trim();
    return Response.json(
      { buildId },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch {
    return Response.json(
      { buildId: "dev" },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
