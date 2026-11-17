import type { NextRequest } from "next/server";
import { mcpHandler, preflight } from "@/lib/mcp/http";
import { getDraft } from "@/lib/mcp/tools/get-draft";

export const dynamic = "force-dynamic";

// REST wrapper — logic lives in lib/mcp/tools/get-draft.ts (shared with the MCP endpoint at /api/mcp)
export const GET = mcpHandler((req: NextRequest) =>
  getDraft({
    draft_id: req.nextUrl.searchParams.get("draft_id") ?? undefined,
    artist_name: req.nextUrl.searchParams.get("artist_name") ?? undefined,
  }, req.nextUrl.origin)
);

export const OPTIONS = preflight;
