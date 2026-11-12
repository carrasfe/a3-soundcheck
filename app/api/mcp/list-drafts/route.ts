import type { NextRequest } from "next/server";
import { mcpHandler, preflight } from "@/lib/mcp/http";
import { listDrafts } from "@/lib/mcp/tools/list-drafts";

export const dynamic = "force-dynamic";

// REST wrapper — logic lives in lib/mcp/tools/list-drafts.ts (shared with the MCP endpoint at /api/mcp)
export const GET = mcpHandler((req: NextRequest) =>
  listDrafts({ filter: req.nextUrl.searchParams.get("filter") ?? undefined }, req.nextUrl.origin)
);

export const OPTIONS = preflight;
