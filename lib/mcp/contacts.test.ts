import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { linkContacts, applyContactEntries } from "./contacts";

// ── Minimal in-memory stand-in for the Supabase query builder ──
// Supports exactly what lib/mcp/contacts.ts uses: select/insert/update with
// eq, is, ilike (exact, case-insensitive), limit, single.
type Row = Record<string, unknown>;
function fakeDb() {
  const tables: Record<string, Row[]> = {};
  let nextId = 1;
  const t = (name: string) => (tables[name] ??= []);

  function builder(table: string) {
    const filters: ((r: Row) => boolean)[] = [];
    let op: "select" | "insert" | "update" = "select";
    let payload: Row | Row[] | null = null;
    let limit = Infinity;
    let single = false;

    const unescape = (p: string) => p.replace(/\\([\\%_])/g, "$1");
    const run = () => {
      if (op === "insert") {
        const rows = (Array.isArray(payload) ? payload : [payload!]).map((r) => ({ id: `id${nextId++}`, ...r }));
        t(table).push(...rows);
        return { data: single ? rows[0] : rows, error: null };
      }
      const matched = t(table).filter((r) => filters.every((f) => f(r)));
      if (op === "update") {
        matched.forEach((r) => Object.assign(r, payload));
        return { data: matched, error: null };
      }
      const out = matched.slice(0, limit);
      return { data: single ? out[0] ?? null : out, error: null };
    };

    const b = {
      select: () => b,
      insert: (p: Row | Row[]) => { op = "insert"; payload = p; return b; },
      update: (p: Row) => { op = "update"; payload = p; return b; },
      eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return b; },
      is: (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return b; },
      ilike: (c: string, p: string) => {
        filters.push((r) => String(r[c] ?? "").toLowerCase() === unescape(p).toLowerCase());
        return b;
      },
      limit: (n: number) => { limit = n; return b; },
      single: () => { single = true; return b; },
      maybeSingle: () => { single = true; return b; },
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
    };
    return b;
  }

  return { sb: { from: builder } as unknown as SupabaseClient, tables, t };
}

const INPUTS = {
  management_company: "Q Prime",
  manager_names: "Charlie Williams, Dan Potts (Day-to-Day)",
  booking_agent: "High Road Touring (North America): Matt Hickey, Sam Gans / THE TEAM - Michael Harvey-Bray",
  other_mgmt_artists: "Wet Leg, Fontaines D.C.",
  other_agent_artists: "Idles",
};

describe("linkContacts", () => {
  it("creates companies, people, links and rosters", async () => {
    const { sb, t } = fakeDb();
    const { summary, managementEntries, bookingEntries } = await linkContacts(sb, "artist1", "Test Artist", INPUTS);

    expect(summary.management_companies).toMatchObject([{ name: "Q Prime", status: "created" }]);
    expect(summary.managers.map((m) => [m.name, m.role, m.status])).toEqual([
      ["Charlie Williams", "Lead", "created"],
      ["Dan Potts", "Day-to-Day", "created"],
    ]);
    expect(summary.agencies.map((a) => [a.name, a.territory])).toEqual([
      ["High Road Touring", "North America"],
      ["THE TEAM", null],
    ]);
    expect(summary.agents.map((a) => [a.name, a.agency, a.role])).toEqual([
      ["Matt Hickey", "High Road Touring", "US Booking"],
      ["Sam Gans", "High Road Touring", "US Booking"],
      ["Michael Harvey-Bray", "THE TEAM", "Primary"],
    ]);
    expect(summary.artist_links_added).toBe(5);
    // 2 managers × 2 artists + 3 agents × 1 artist
    expect(summary.roster_artists_added).toBe(7);

    expect(t("managers").every((m) => m.management_company_id === summary.management_companies[0].id)).toBe(true);
    expect(t("artist_managers")).toHaveLength(2);
    expect(t("artist_agents")).toHaveLength(3);
    expect(t("known_artists")).toHaveLength(7);
    expect(managementEntries[0].manager_selections).toHaveLength(2);
    expect(bookingEntries).toHaveLength(2);
  });

  it("is idempotent — a second run creates nothing", async () => {
    const { sb, tables } = fakeDb();
    await linkContacts(sb, "artist1", "Test Artist", INPUTS);
    const counts = Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length]));

    const { summary } = await linkContacts(sb, "artist1", "Test Artist", {
      ...INPUTS,
      management_company: "q prime", // different casing still matches
    });

    expect(Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length]))).toEqual(counts);
    expect(summary.management_companies.every((c) => c.status === "existing")).toBe(true);
    expect(summary.managers.every((m) => m.status === "existing")).toBe(true);
    expect(summary.agencies.every((a) => a.status === "existing")).toBe(true);
    expect(summary.agents.every((a) => a.status === "existing")).toBe(true);
    expect(summary.artist_links_added).toBe(0);
    expect(summary.roster_artists_added).toBe(0);
  });

  it("reuses existing records and adopts an org-less manager into the company", async () => {
    const { sb, t } = fakeDb();
    t("management_companies").push({ id: "co1", name: "Q Prime" });
    t("managers").push({ id: "m1", name: "Charlie Williams", management_company_id: null });
    t("managers").push({ id: "m2", name: "Dan Potts", management_company_id: "other-co" });

    const { summary } = await linkContacts(sb, "artist1", "Test Artist", {
      management_company: "Q Prime", manager_names: "Charlie Williams, Dan Potts",
    });

    expect(summary.management_companies[0]).toMatchObject({ id: "co1", status: "existing" });
    expect(summary.managers[0]).toMatchObject({ id: "m1", status: "existing" });
    expect(t("managers").find((m) => m.id === "m1")!.management_company_id).toBe("co1");
    // Same name at a different company is a different person
    expect(summary.managers[1].status).toBe("created");
  });

  it("attaches rosters to the company when no managers are named", async () => {
    const { sb, t } = fakeDb();
    const { summary } = await linkContacts(sb, "artist1", "Test Artist", {
      management_company: "Q Prime", other_mgmt_artists: "Wet Leg, Test Artist",
    });
    expect(summary.roster_artists_added).toBe(1); // the evaluated artist itself is excluded
    expect(t("known_artists")[0]).toMatchObject({ name: "Wet Leg", management_company_id: summary.management_companies[0].id });
  });

  it("does nothing for empty inputs", async () => {
    const { sb, tables } = fakeDb();
    const { summary } = await linkContacts(sb, "artist1", "Test Artist", {});
    expect(summary.artist_links_added + summary.roster_artists_added).toBe(0);
    expect(Object.values(tables).every((v) => v.length === 0)).toBe(true);
  });
});

describe("applyContactEntries", () => {
  it("merges with existing wizard selections and drops empty slots", () => {
    const inputs: Record<string, unknown> = {
      management_entries: [
        { company_id: "co1", company_name: "Q Prime", manager_selections: [{ manager_id: "m1", role: "Lead" }] },
        { company_id: "", company_name: "", manager_selections: [] },
      ],
    };
    applyContactEntries(inputs, [
      { company_id: "co1", company_name: "Q Prime", manager_selections: [{ manager_id: "m1", role: "Lead" }, { manager_id: "m2", role: "Lead" }] },
    ], []);
    expect(inputs.management_entries).toEqual([
      { company_id: "co1", company_name: "Q Prime", manager_selections: [{ manager_id: "m1", role: "Lead" }, { manager_id: "m2", role: "Lead" }] },
    ]);
    expect(inputs.management_company_id).toBe("co1");
    expect(inputs.manager_selections).toHaveLength(2);
    expect(inputs.booking_entries).toBeUndefined();
  });
});
