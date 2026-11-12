import type { NextRequest } from "next/server";
import { mcpHandler, preflight } from "@/lib/mcp/http";
import { listArtists } from "@/lib/mcp/tools/list-artists";

export const dynamic = "force-dynamic";

// REST wrapper — logic lives in lib/mcp/tools/list-artists.ts (shared with the MCP endpoint at /api/mcp)
export const GET = mcpHandler((req: NextRequest) =>
  listArtists({
    filter: req.nextUrl.searchParams.get("filter") ?? undefined,
    limit: req.nextUrl.searchParams.get("limit") ?? undefined,
  }, req.nextUrl.origin)
);

export const OPTIONS = preflight;
