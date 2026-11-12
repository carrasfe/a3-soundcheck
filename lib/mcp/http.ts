import { timingSafeEqual } from "crypto";
import { NextResponse, type NextRequest } from "next/server";

// Shared plumbing for the /api/mcp/* routes: API-key auth, CORS, JSON helpers.
// These routes are called by Claude (not a logged-in browser session), so they
// bypass the Supabase cookie auth in middleware.ts and use the service-role client.

const ALLOWED_ORIGIN = /^https:\/\/([a-z0-9-]+\.)*(claude\.ai|anthropic\.com)$/i;

function corsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-api-key",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin && ALLOWED_ORIGIN.test(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

export function json(req: NextRequest, body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: corsHeaders(req) });
}

export function preflight(req: NextRequest): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.SOUNDCHECK_MCP_KEY;
  const provided = req.headers.get("x-api-key");
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Wraps a route handler with API-key auth, CORS headers and error handling. */
export function mcpHandler(fn: (req: NextRequest) => Promise<unknown>) {
  return async (req: NextRequest): Promise<NextResponse> => {
    if (!isAuthorized(req)) return json(req, { error: "Unauthorized" }, 401);
    try {
      const result = await fn(req);
      if (result instanceof HttpError) return json(req, { error: result.message, ...result.extra }, result.status);
      return json(req, result);
    } catch (err) {
      if (err instanceof HttpError) return json(req, { error: err.message, ...err.extra }, err.status);
      console.error("[mcp] Unhandled error:", err);
      const message = err && typeof err === "object" && "message" in err ? String(err.message) : String(err);
      return json(req, { error: message }, 500);
    }
  };
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}
