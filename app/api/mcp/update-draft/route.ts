import type { NextRequest } from "next/server";
import { mcpHandler, preflight, HttpError } from "@/lib/mcp/http";
import { updateDraft } from "@/lib/mcp/tools/update-draft";

export const dynamic = "force-dynamic";

// REST wrapper — logic lives in lib/mcp/tools/update-draft.ts (shared with the MCP endpoint at /api/mcp)
export const POST = mcpHandler(async (req: NextRequest) => {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, "Body must be JSON");
  }
  return updateDraft(body, req.nextUrl.origin);
});

export const OPTIONS = preflight;
