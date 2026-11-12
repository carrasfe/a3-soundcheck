import type { NextRequest } from "next/server";
import { mcpHandler, preflight } from "@/lib/mcp/http";
import { searchArtist } from "@/lib/mcp/tools/search-artist";

export const dynamic = "force-dynamic";

// REST wrapper — logic lives in lib/mcp/tools/search-artist.ts (shared with the MCP endpoint at /api/mcp)
export const GET = mcpHandler((req: NextRequest) =>
  searchArtist({ q: req.nextUrl.searchParams.get("q") ?? undefined }, req.nextUrl.origin)
);

export const OPTIONS = preflight;
