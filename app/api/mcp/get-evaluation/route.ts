import type { NextRequest } from "next/server";
import { mcpHandler, preflight } from "@/lib/mcp/http";
import { getEvaluation } from "@/lib/mcp/tools/get-evaluation";

export const dynamic = "force-dynamic";

// REST wrapper — logic lives in lib/mcp/tools/get-evaluation.ts (shared with the MCP endpoint at /api/mcp)
export const GET = mcpHandler((req: NextRequest) =>
  getEvaluation({
    artist_id: req.nextUrl.searchParams.get("artist_id") ?? undefined,
    artist_name: req.nextUrl.searchParams.get("artist_name") ?? undefined,
  }, req.nextUrl.origin)
);

export const OPTIONS = preflight;
