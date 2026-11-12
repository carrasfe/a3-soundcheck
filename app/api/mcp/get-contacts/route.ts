import type { NextRequest } from "next/server";
import { mcpHandler, preflight } from "@/lib/mcp/http";
import { getContacts } from "@/lib/mcp/tools/get-contacts";

export const dynamic = "force-dynamic";

// REST wrapper — logic lives in lib/mcp/tools/get-contacts.ts (shared with the MCP endpoint at /api/mcp)
export const GET = mcpHandler((req: NextRequest) =>
  getContacts({ q: req.nextUrl.searchParams.get("q") ?? undefined }, req.nextUrl.origin)
);

export const OPTIONS = preflight;
