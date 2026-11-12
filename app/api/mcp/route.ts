import { NextResponse, type NextRequest } from "next/server";
import { corsHeaders, isAuthorized, preflight, HttpError } from "@/lib/mcp/http";
import { searchArtist } from "@/lib/mcp/tools/search-artist";
import { getEvaluation } from "@/lib/mcp/tools/get-evaluation";
import { getContacts } from "@/lib/mcp/tools/get-contacts";
import { listArtists } from "@/lib/mcp/tools/list-artists";
import { createDraft } from "@/lib/mcp/tools/create-draft";
import { INITIAL_FORM_DATA, VALID_GENRES } from "@/app/evaluations/new/types";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────
// MCP server (Model Context Protocol) — Streamable HTTP transport, stateless.
//
// POST /api/mcp  — JSON-RPC 2.0 request(s); responses returned as JSON.
// GET  /api/mcp  — 405: the spec lets a server decline the optional
//                  server→client SSE stream, and this server never sends
//                  unsolicited messages (a long-lived stream would also just
//                  burn a Vercel function until it times out).
//
// The tool logic is shared with the REST routes under /api/mcp/*.
// ─────────────────────────────────────────────────────────────

const SUPPORTED_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const SERVER_INFO = { name: "a3-soundcheck", title: "A3 Soundcheck", version: "1.0.0" };

const INSTRUCTIONS =
  "A3 Soundcheck is A3 Merchandise's artist evaluation tool. Artists are scored on four pillars " +
  "(P1 Touring, P2 Fan Engagement, P3 E-Commerce, P4 Growth) into a total score and a tier " +
  "(Priority, Active, Watch, Pass). Use search_artist / list_artists to find artists, get_evaluation " +
  "for full scoring detail, get_contacts for managers/agents and their rosters, and create_draft to " +
  "start a new evaluation that a person finishes in the app.";

type Json = Record<string, unknown>;
interface Tool {
  name: string;
  title: string;
  description: string;
  inputSchema: Json;
  annotations?: Json;
  run: (args: Json, origin: string) => Promise<unknown>;
}

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? undefined : String(v));

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const TOOLS: Tool[] = [
  {
    name: "search_artist",
    title: "Search artists",
    description:
      "Search Soundcheck artists by name (case-insensitive partial match). Returns genre, latest score and tier, " +
      "merch provider, A3 client flag, linked managers/agents with company names, and A3 relationship status. " +
      "Also returns matching names from manager/agent rosters (known_artists).",
    inputSchema: {
      type: "object",
      properties: { q: { type: "string", description: "Artist name or part of it" } },
      required: ["q"],
    },
    annotations: READ_ONLY,
    run: (a, origin) => searchArtist({ q: str(a.q) }, origin),
  },
  {
    name: "get_evaluation",
    title: "Get evaluation",
    description:
      "Get the most recent complete evaluation for an artist: all input values, pillar scores with sub-metrics, " +
      "tier, weight profile, demographics and management/agent info. Provide artist_id or artist_name.",
    inputSchema: {
      type: "object",
      properties: {
        artist_id: { type: "string", description: "Artist UUID (from search_artist or list_artists)" },
        artist_name: { type: "string", description: "Artist name (exact match preferred; partial match if unique)" },
      },
    },
    annotations: READ_ONLY,
    run: (a, origin) => getEvaluation({ artist_id: str(a.artist_id), artist_name: str(a.artist_name) }, origin),
  },
  {
    name: "get_contacts",
    title: "Search contacts",
    description:
      "Search management companies, agencies, managers and agents by name. Returns email/phone, rosters " +
      "(known artists + Soundcheck artists with scores) and which A3 client artists they represent.",
    inputSchema: {
      type: "object",
      properties: { q: { type: "string", description: "Company, agency or person name, or part of it" } },
      required: ["q"],
    },
    annotations: READ_ONLY,
    run: (a, origin) => getContacts({ q: str(a.q) }, origin),
  },
  {
    name: "list_artists",
    title: "List artists",
    description:
      "List artists with their latest score and tier, sorted by score. Tier filters use each artist's most " +
      "recent complete evaluation.",
    inputSchema: {
      type: "object",
      properties: {
        filter: {
          type: "string",
          enum: ["all", "a3clients", "priority", "active", "watch", "pass"],
          description: "Defaults to all",
        },
        limit: { type: "number", description: "Max artists to return (default 500)" },
      },
    },
    annotations: READ_ONLY,
    run: (a, origin) => listArtists({ filter: str(a.filter), limit: str(a.limit) }, origin),
  },
  {
    name: "create_draft",
    title: "Create draft evaluation",
    description:
      "Create a draft evaluation (status = draft) that any Soundcheck user can open and finish in the app. " +
      "Matches an existing artist by name or creates one. Only artist_name and genre are required; pass any " +
      "other evaluation input fields you have as strings or numbers (e.g. spotify_monthly_listeners, " +
      "fan_concentration_ratio, ig_followers, ig_er_pct, tiktok_followers, youtube_subscribers, venue_capacity, " +
      "sell_through_pct, num_dates, merch_provider, spotify_yoy_pct). Percentages are entered as 22 for 22%. " +
      "Returns the draft id and an edit link.",
    inputSchema: {
      type: "object",
      properties: {
        artist_name: { type: "string" },
        genre: { type: "string", enum: VALID_GENRES },
        ...Object.fromEntries(
          Object.entries(INITIAL_FORM_DATA)
            .filter(([k, v]) => k !== "artist_name" && k !== "genre" && !Array.isArray(v))
            .map(([k, v]) => [k, typeof v === "boolean" ? { type: "boolean" } : { type: ["string", "number"] }])
        ),
      },
      required: ["artist_name", "genre"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    run: (a, origin) => createDraft(a, origin),
  },
];

// ── JSON-RPC plumbing ────────────────────────────────────────

interface RpcRequest { jsonrpc?: string; id?: string | number | null; method?: string; params?: Json }

const rpcResult = (id: RpcRequest["id"], result: unknown) => ({ jsonrpc: "2.0", id, result });
const rpcError = (id: RpcRequest["id"], code: number, message: string, data?: unknown) =>
  ({ jsonrpc: "2.0", id: id ?? null, error: { code, message, ...(data !== undefined ? { data } : {}) } });

async function callTool(params: Json | undefined, origin: string) {
  const name = params?.name;
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return null;
  const args = (params?.arguments && typeof params.arguments === "object" ? params.arguments : {}) as Json;
  try {
    const result = await tool.run(args, origin);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result as Json,
    };
  } catch (err) {
    // Tool failures are reported in-band so the model can see and react to them
    const message = err instanceof HttpError
      ? JSON.stringify({ error: err.message, ...err.extra }, null, 2)
      : err && typeof err === "object" && "message" in err ? String(err.message) : String(err);
    if (!(err instanceof HttpError)) console.error(`[mcp] ${tool.name} failed:`, err);
    return { content: [{ type: "text", text: message }], isError: true };
  }
}

/** Returns the JSON-RPC response, or null for notifications (no id). */
async function handleMessage(msg: RpcRequest, origin: string) {
  const isNotification = msg.id === undefined;
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return isNotification ? null : rpcError(msg?.id, -32600, "Invalid Request");
  }
  if (isNotification) return null; // notifications/initialized, notifications/cancelled, …

  switch (msg.method) {
    case "initialize": {
      const requested = str(msg.params?.protocolVersion);
      return rpcResult(msg.id, {
        protocolVersion: requested && SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
          ? requested : SUPPORTED_PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return rpcResult(msg.id, {});
    case "tools/list":
      return rpcResult(msg.id, {
        tools: TOOLS.map(({ run: _run, ...t }) => t),
      });
    case "tools/call": {
      const result = await callTool(msg.params, origin);
      return result
        ? rpcResult(msg.id, result)
        : rpcError(msg.id, -32602, `Unknown tool: ${String(msg.params?.name)}`);
    }
    // Capabilities we don't offer — answer with empty lists rather than errors
    case "resources/list":
      return rpcResult(msg.id, { resources: [] });
    case "resources/templates/list":
      return rpcResult(msg.id, { resourceTemplates: [] });
    case "prompts/list":
      return rpcResult(msg.id, { prompts: [] });
    default:
      return rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

function reply(req: NextRequest, body: unknown, status = 200, extra: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...corsHeaders(req), ...extra } });
}

function unauthorized(req: NextRequest) {
  return reply(req, rpcError(null, -32001, "Unauthorized: missing or invalid API key"), 401);
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized(req);

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return reply(req, rpcError(null, -32700, "Parse error"), 400);
  }

  const origin = req.nextUrl.origin;
  const messages = Array.isArray(payload) ? payload : [payload];
  if (messages.length === 0) return reply(req, rpcError(null, -32600, "Invalid Request"), 400);

  const responses = (await Promise.all(messages.map((m) => handleMessage(m as RpcRequest, origin))))
    .filter((r) => r !== null);

  // Only notifications/responses were sent — acknowledge with 202 and no body
  if (responses.length === 0) return new NextResponse(null, { status: 202, headers: corsHeaders(req) });
  return reply(req, Array.isArray(payload) ? responses : responses[0]);
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized(req);
  return new NextResponse(null, { status: 405, headers: { ...corsHeaders(req), Allow: "POST, OPTIONS" } });
}

export async function DELETE(req: NextRequest) {
  // Stateless server — there are no sessions to terminate
  return new NextResponse(null, { status: 405, headers: { ...corsHeaders(req), Allow: "POST, OPTIONS" } });
}

export const OPTIONS = preflight;
