// Pure parsers for the free-text contact fields (management_company, manager_names,
// booking_agent, other_*_artists) that MCP callers send. No DB access — see
// lib/mcp/contacts.ts for the code that turns these into contact records.

export interface ParsedOrg {
  /** Company / agency name */
  name: string;
  /** Territory or other parenthetical after the org name, e.g. "North America" */
  territory: string | null;
  /** People listed after the org name */
  people: ParsedPerson[];
}

export interface ParsedPerson {
  name: string;
  /** Parenthetical after the person's name, e.g. "Day-to-Day" */
  note: string | null;
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * Split on a separator only at parenthesis depth 0, so "CAA (UK/EU)" stays whole.
 */
function splitTopLevel(text: string, isSep: (text: string, i: number) => number): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "(" || c === "[") depth++;
    else if ((c === ")" || c === "]") && depth > 0) depth--;
    else if (depth === 0) {
      const len = isSep(text, i);
      if (len > 0) {
        out.push(text.slice(start, i));
        start = i + len;
        i += len - 1;
      }
    }
  }
  out.push(text.slice(start));
  return out.map(clean).filter(Boolean);
}

/** Org separators: newline, ";", or a "/" with whitespace on at least one side ("A / B"; not "UK/EU"). */
function orgSep(text: string, i: number): number {
  const c = text[i];
  if (c === "\n" || c === "\r" || c === ";") return 1;
  if (c === "/") {
    const before = text[i - 1] ?? " ";
    const after = text[i + 1] ?? " ";
    if (/\s/.test(before) || /\s/.test(after)) return 1;
  }
  return 0;
}

/** Person separators: ",", "&", "+", or the word "and". */
function personSep(text: string, i: number): number {
  const c = text[i];
  if (c === "," || c === "&" || c === "+") return 1;
  if (/\s/.test(c) && /^\sand\s/i.test(text.slice(i, i + 5))) return 4;
  return 0;
}

/** "Charlie Williams (Day-to-Day)" → { name: "Charlie Williams", note: "Day-to-Day" } */
function parsePerson(raw: string): ParsedPerson | null {
  const m = raw.match(/^(.*?)\s*[([]\s*([^)\]]*?)\s*[)\]]\s*$/);
  const name = clean((m ? m[1] : raw).replace(/^[-–—:]+|[-–—:]+$/g, ""));
  if (!name) return null;
  return { name, note: m && m[2] ? clean(m[2]) : null };
}

/** Split a list of people: "Charlie Williams, Dan Potts & Sam Gans" */
export function parsePeople(text: string | null | undefined): ParsedPerson[] {
  if (!text) return [];
  return dedupe(
    splitTopLevel(text.replace(/[\r\n;]+/g, ","), personSep)
      .map(parsePerson)
      .filter((p): p is ParsedPerson => !!p),
    (p) => p.name
  );
}

/**
 * Parse one org segment:
 *   "CAA - David Ball, Paul Wilson"
 *   "High Road Touring (North America): Matt Hickey, Sam Gans"
 *   "THE TEAM – Michael Harvey-Bray"     (en/em dash; hyphens inside names are kept)
 *   "Wasserman"                           (no people)
 */
function parseOrgSegment(segment: string): ParsedOrg | null {
  let s = clean(segment);
  if (!s) return null;

  // Org name ends at the first top-level " - " / en/em dash / ":" / "("
  let depth = 0;
  let cut = -1;
  let sepLen = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "(" && depth === 0 && i > 0) { cut = i; sepLen = 0; break; }
    if (c === "(") depth++;
    else if (c === ")" && depth > 0) depth--;
    else if (depth === 0) {
      if (c === ":") { cut = i; sepLen = 1; break; }
      if ((c === "–" || c === "—")) { cut = i; sepLen = 1; break; }
      if (c === "-" && /\s/.test(s[i - 1] ?? "") && /\s/.test(s[i + 1] ?? "")) { cut = i; sepLen = 1; break; }
    }
  }

  if (cut < 0) return { name: s, territory: null, people: [] };

  const name = clean(s.slice(0, cut));
  let rest = s.slice(cut + sepLen);
  let territory: string | null = null;

  // "(North America)" directly after the org name
  if (sepLen === 0) {
    const m = rest.match(/^\(\s*([^)]*?)\s*\)\s*/);
    if (m) {
      territory = m[1] ? clean(m[1]) : null;
      rest = rest.slice(m[0].length);
    }
  }
  rest = rest.replace(/^\s*[-–—:]\s*/, "");

  if (!name) return null;
  return { name, territory, people: parsePeople(rest) };
}

/**
 * Parse a free-text org field that may hold several orgs:
 *   "High Road Touring - Matt Hickey / THE TEAM - Michael Harvey-Bray"
 * Orgs with the same name are merged.
 */
export function parseOrgs(text: string | null | undefined): ParsedOrg[] {
  if (!text) return [];
  const merged = new Map<string, ParsedOrg>();
  for (const seg of splitTopLevel(text, orgSep)) {
    const org = parseOrgSegment(seg);
    if (!org) continue;
    const key = org.name.toLowerCase();
    const prev = merged.get(key);
    if (prev) {
      prev.people = dedupe([...prev.people, ...org.people], (p) => p.name);
      prev.territory = prev.territory ?? org.territory;
    } else {
      merged.set(key, org);
    }
  }
  return Array.from(merged.values());
}

/**
 * Management: management_company may itself be "Company - Names"; manager_names
 * (if given) belong to the first company.
 */
export function parseManagement(company: string | null | undefined, managerNames: string | null | undefined): ParsedOrg[] {
  const orgs = parseOrgs(company);
  const extra = parsePeople(managerNames);
  if (extra.length === 0) return orgs;
  if (orgs.length === 0) return [{ name: "", territory: null, people: extra }]; // managers with no company
  orgs[0].people = dedupe([...orgs[0].people, ...extra], (p) => p.name);
  return orgs;
}

/** Artist name list for known_artists: comma / newline / semicolon separated. */
export function parseArtistList(text: string | null | undefined, exclude?: string): string[] {
  if (!text) return [];
  const ex = exclude?.trim().toLowerCase();
  return dedupe(
    text.split(/[,\n\r;]+/).map(clean).filter((n) => n && n.toLowerCase() !== ex),
    (n) => n
  );
}

/** Map a territory / note to one of the wizard's agent roles. */
export function agentRoleFor(territory: string | null, note: string | null): string {
  const t = `${territory ?? ""} ${note ?? ""}`.toLowerCase();
  if (/festival/.test(t)) return "Festivals";
  if (/world|global|international/.test(t)) return "Global";
  if (/\buk\b|\beu\b|europe|united kingdom|row\b|rest of world/.test(t)) return "UK/EU Booking";
  if (/north america|\bna\b|\bus\b|usa|united states|canada/.test(t)) return "US Booking";
  return "Primary";
}

/** Map a note to one of the wizard's manager roles. */
export function managerRoleFor(note: string | null): string {
  const t = (note ?? "").toLowerCase();
  if (/day[\s-]*to[\s-]*day|dtd/.test(t)) return "Day-to-Day";
  if (/a\s*&\s*r/.test(t)) return "A&R";
  return "Lead";
}

function dedupe<T>(xs: T[], key: (x: T) => string): T[] {
  const seen = new Set<string>();
  return xs.filter((x) => {
    const k = key(x).toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
