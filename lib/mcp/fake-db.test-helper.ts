import type { SupabaseClient } from "@supabase/supabase-js";

// Minimal in-memory stand-in for the Supabase query builder, for unit tests.
// Supports what lib/mcp uses: select / insert / update / delete with
// eq, in, is, ilike (exact, case-insensitive — callers escape wildcards),
// order, limit, single / maybeSingle, and .select() after a write.
type Row = Record<string, unknown>;

export function fakeDb() {
  const tables: Record<string, Row[]> = {};
  let nextId = 1;
  const t = (name: string) => (tables[name] ??= []);

  function builder(table: string) {
    const filters: ((r: Row) => boolean)[] = [];
    let op: "select" | "insert" | "update" | "delete" = "select";
    let payload: Row | Row[] | null = null;
    let limit = Infinity;
    let sort: { col: string; asc: boolean } | null = null;
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
      if (op === "delete") {
        tables[table] = t(table).filter((r) => !matched.includes(r));
        return { data: matched, error: null };
      }
      if (sort) {
        const { col, asc } = sort;
        matched.sort((a, b) => (String(a[col] ?? "") < String(b[col] ?? "") ? -1 : 1) * (asc ? 1 : -1));
      }
      const out = matched.slice(0, limit);
      return { data: single ? out[0] ?? null : out, error: null };
    };

    const b = {
      select: () => b,
      insert: (p: Row | Row[]) => { op = "insert"; payload = p; return b; },
      update: (p: Row) => { op = "update"; payload = p; return b; },
      delete: () => { op = "delete"; return b; },
      eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return b; },
      in: (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return b; },
      is: (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return b; },
      ilike: (c: string, p: string) => {
        filters.push((r) => String(r[c] ?? "").toLowerCase() === unescape(p).toLowerCase());
        return b;
      },
      limit: (n: number) => { limit = n; return b; },
      order: (col: string, o?: { ascending?: boolean }) => { sort = { col, asc: o?.ascending ?? true }; return b; },
      single: () => { single = true; return b; },
      maybeSingle: () => { single = true; return b; },
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
    };
    return b;
  }

  return { sb: { from: builder } as unknown as SupabaseClient, tables, t };
}
