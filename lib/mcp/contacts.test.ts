import { describe, it, expect } from "vitest";
import { linkContacts, applyContactEntries } from "./contacts";
import { fakeDb } from "./fake-db.test-helper";

const INPUTS = {
  management_company: "Q Prime",
  manager_names: "Charlie Williams, Dan Potts (Day-to-Day)",
  booking_agent: "High Road Touring (North America): Matt Hickey, Sam Gans / THE TEAM - Michael Harvey-Bray",
  manager_rosters: "Charlie Williams: Wet Leg, Fontaines D.C.; Dan Potts: Idles",
  agent_rosters: "Matt Hickey: Marcus King, Charley Crockett; Michael Harvey-Bray: Wyatt Flores",
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
    // Each roster goes only to its own person: 2 + 1 + 2 + 1
    expect(summary.roster_artists_added).toBe(6);
    expect(summary.roster_skipped).toEqual([]);

    expect(t("managers").every((m) => m.management_company_id === summary.management_companies[0].id)).toBe(true);
    expect(t("artist_managers")).toHaveLength(2);
    expect(t("artist_agents")).toHaveLength(3);
    expect(t("known_artists")).toHaveLength(6);
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

describe("linkContacts — rosters don't cross-contaminate", () => {
  const rosterOf = (t: (n: string) => Record<string, unknown>[], col: string, id: string) =>
    t("known_artists").filter((k) => k[col] === id).map((k) => k.name).sort();

  it("applies agent_rosters only to the named agent", async () => {
    const { sb, t } = fakeDb();
    const { summary } = await linkContacts(sb, "artist1", "Test Artist", {
      booking_agent: "Wasserman - Jacob Lapidus, Meredith Jones",
      agent_rosters: "Jacob Lapidus: Marcus King, Charley Crockett; Meredith Jones: Wyatt Flores, Brandi Carlile",
    });
    const [jacob, meredith] = summary.agents;
    expect(rosterOf(t, "agent_id", jacob.id)).toEqual(["Charley Crockett", "Marcus King"]);
    expect(rosterOf(t, "agent_id", meredith.id)).toEqual(["Brandi Carlile", "Wyatt Flores"]);
    expect(summary.rosters.map((r) => [r.name, r.added])).toEqual([["Jacob Lapidus", 2], ["Meredith Jones", 2]]);
  });

  it("does NOT apply a flat other_agent_artists list when there are multiple agents", async () => {
    const { sb, t } = fakeDb();
    const { summary } = await linkContacts(sb, "artist1", "Test Artist", {
      booking_agent: "Wasserman - Jacob Lapidus, Meredith Jones",
      other_agent_artists: "Marcus King, Charley Crockett",
    });
    expect(summary.roster_artists_added).toBe(0);
    expect(t("known_artists")).toHaveLength(0);
    expect(summary.roster_skipped).toHaveLength(1);
    expect(summary.roster_skipped[0]).toMatch(/other_agent_artists not applied: 2 agents .*agent_rosters/);
  });

  it("applies a flat list when there is exactly one agent (backward compatible)", async () => {
    const { sb, t } = fakeDb();
    const { summary } = await linkContacts(sb, "artist1", "Test Artist", {
      booking_agent: "CAA - David Ball",
      other_agent_artists: "Marcus King, Charley Crockett",
    });
    expect(rosterOf(t, "agent_id", summary.agents[0].id)).toEqual(["Charley Crockett", "Marcus King"]);
    expect(summary.roster_skipped).toEqual([]);
  });

  it("same rules for managers: flat list skipped with 2 managers, manager_rosters applied per person", async () => {
    const { sb, t } = fakeDb();
    const { summary } = await linkContacts(sb, "artist1", "Test Artist", {
      management_company: "Q Prime",
      manager_names: "Charlie Williams, Dan Potts",
      other_mgmt_artists: "Should Not Land",
      manager_rosters: "Dan Potts: Wet Leg",
    });
    const [charlie, dan] = summary.managers;
    expect(rosterOf(t, "manager_id", charlie.id)).toEqual([]);
    expect(rosterOf(t, "manager_id", dan.id)).toEqual(["Wet Leg"]);
    expect(summary.roster_skipped[0]).toMatch(/other_mgmt_artists not applied: 2 managers/);
  });

  it("resolves roster people already in the database, and skips unknown or ambiguous names", async () => {
    const { sb, t } = fakeDb();
    t("agents").push({ id: "a1", name: "Jacob Lapidus", agency_id: "ag1" });
    t("agents").push({ id: "a2", name: "Sam Smith", agency_id: "ag1" });
    t("agents").push({ id: "a3", name: "Sam Smith", agency_id: "ag2" });

    const { summary } = await linkContacts(sb, "artist1", "Test Artist", {
      agent_rosters: "Jacob Lapidus: Marcus King; Sam Smith: X; Nobody Here: Y; just text",
    });
    expect(rosterOf(t, "agent_id", "a1")).toEqual(["Marcus King"]);
    expect(t("known_artists")).toHaveLength(1);
    expect(summary.roster_skipped).toHaveLength(3);
    expect(summary.roster_skipped.join("\n")).toMatch(/2 agents named "Sam Smith"/);
    expect(summary.roster_skipped.join("\n")).toMatch(/no agent named "Nobody Here"/);
    expect(summary.roster_skipped.join("\n")).toMatch(/block "just text" ignored/);
  });

  it("treats a bare list of names in booking_agent as agents, not an agency", async () => {
    const { sb, t } = fakeDb();
    const { summary } = await linkContacts(sb, "artist1", "Test Artist", {
      booking_agent: "Julianna Coyle, Chad Kudelka, Meredith Jones, Jacob Lapidus",
    });
    expect(t("agencies")).toHaveLength(0);
    expect(summary.agents.map((a) => a.name)).toEqual(["Julianna Coyle", "Chad Kudelka", "Meredith Jones", "Jacob Lapidus"]);
    expect(t("agents").every((a) => a.agency_id === null)).toBe(true);
  });

  it("is idempotent with per-person rosters", async () => {
    const { sb, t } = fakeDb();
    const input = { booking_agent: "Wasserman - Jacob Lapidus, Meredith Jones", agent_rosters: "Jacob Lapidus: Marcus King" };
    await linkContacts(sb, "artist1", "Test Artist", input);
    const { summary } = await linkContacts(sb, "artist1", "Test Artist", input);
    expect(summary.roster_artists_added).toBe(0);
    expect(t("known_artists")).toHaveLength(1);
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
