import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeDb } from "@/lib/mcp/fake-db.test-helper";
import { removeKnownArtists, clearRoster, unlinkArtist, deleteContact } from "./roster-admin";

// vi.mock is hoisted above the imports; the factory reads `db` lazily per call.
let db = fakeDb();
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.sb }));

beforeEach(() => {
  db = fakeDb();
  const { t } = db;
  t("agencies").push({ id: "ag1", name: "Wasserman" });
  t("agencies").push({ id: "junk", name: "Julianna Coyle, Chad Kudelka, Meredith Jones, Jacob Lapidus" });
  t("agents").push({ id: "a1", name: "Jacob Lapidus", agency_id: "ag1" });
  t("agents").push({ id: "a2", name: "Meredith Jones", agency_id: "ag1" });
  t("agents").push({ id: "j1", name: "Someone", agency_id: "junk" });
  t("known_artists").push(
    { id: "k1", name: "Marcus King", agent_id: "a1" },
    { id: "k2", name: "Charley Crockett", agent_id: "a1" },
    { id: "k3", name: "Wyatt Flores", agent_id: "a1" }, // contaminated: belongs to Meredith
    { id: "k4", name: "Wyatt Flores", agent_id: "a2" },
    { id: "k5", name: "Junk Artist", agent_id: "j1" },
    { id: "k6", name: "Junk Agency Artist", agency_id: "junk" },
  );
  t("artists").push({ id: "art1", name: "Test Artist" });
  t("artist_agents").push(
    { id: "l1", artist_id: "art1", agent_id: "a1", role: "Primary" },
    { id: "l2", artist_id: "art1", agent_id: "a2", role: "Primary" },
    { id: "l3", artist_id: "art1", agent_id: "j1", role: "Primary" },
  );
});

describe("remove_known_artists", () => {
  it("removes only the named artists from that person's roster", async () => {
    const r = await removeKnownArtists({ person_type: "agent", person_name: "jacob lapidus", artist_names: ["wyatt flores", "Nope"] });
    expect(r.removed).toEqual(["Wyatt Flores"]);
    expect(r.not_found).toEqual(["Nope"]);
    expect(r.remaining).toBe(2);
    // Meredith's Wyatt Flores is untouched
    expect(db.t("known_artists").filter((k) => k.name === "Wyatt Flores").map((k) => k.agent_id)).toEqual(["a2"]);
  });

  it("errors when the person isn't found", async () => {
    await expect(removeKnownArtists({ person_type: "agent", person_name: "Ghost", artist_names: ["X"] }))
      .rejects.toMatchObject({ status: 404 });
  });

  it("errors with candidates when the name is ambiguous, and accepts person_id", async () => {
    db.t("agents").push({ id: "a9", name: "Jacob Lapidus", agency_id: "junk" });
    await expect(removeKnownArtists({ person_type: "agent", person_name: "Jacob Lapidus", artist_names: ["Marcus King"] }))
      .rejects.toMatchObject({ status: 409, extra: { candidates: expect.arrayContaining([expect.objectContaining({ id: "a1", organization: "Wasserman" })]) } });
    const r = await removeKnownArtists({ person_type: "agent", person_id: "a1", artist_names: ["Marcus King"] });
    expect(r.removed).toEqual(["Marcus King"]);
  });

  it("validates input", async () => {
    await expect(removeKnownArtists({ person_type: "label", person_name: "x", artist_names: ["a"] })).rejects.toMatchObject({ status: 400 });
    await expect(removeKnownArtists({ person_type: "agent", person_name: "Jacob Lapidus", artist_names: [] })).rejects.toMatchObject({ status: 400 });
  });
});

describe("clear_roster", () => {
  it("deletes every roster artist for that person only", async () => {
    const r = await clearRoster({ person_type: "agent", person_name: "Jacob Lapidus" });
    expect(r.deleted).toBe(3);
    expect(db.t("known_artists").some((k) => k.agent_id === "a1")).toBe(false);
    expect(db.t("known_artists").some((k) => k.agent_id === "a2")).toBe(true);
    expect(db.t("agents").some((a) => a.id === "a1")).toBe(true); // person kept
  });
});

describe("unlink_artist", () => {
  it("removes just that artist↔person link", async () => {
    const r = await unlinkArtist({ artist_name: "test artist", person_type: "agent", person_name: "Jacob Lapidus" });
    expect(r).toMatchObject({ success: true, status: "unlinked" });
    expect(db.t("artist_agents").map((l) => l.id)).toEqual(["l2", "l3"]);
    expect(db.t("agents").some((a) => a.id === "a1")).toBe(true);
  });

  it("reports not_found when there was no link", async () => {
    await unlinkArtist({ artist_name: "Test Artist", person_type: "agent", person_name: "Jacob Lapidus" });
    const r = await unlinkArtist({ artist_name: "Test Artist", person_type: "agent", person_name: "Jacob Lapidus" });
    expect(r).toMatchObject({ success: false, status: "not_found" });
  });
});

describe("delete_contact", () => {
  it("deletes a junk agency with its agents, their rosters and links", async () => {
    const r = await deleteContact({ contact_type: "agency", name: "Julianna Coyle, Chad Kudelka, Meredith Jones, Jacob Lapidus" });
    expect(r.deleted).toMatchObject({ contact_type: "agency", id: "junk" });
    expect(r.cascade).toMatchObject({ agents: ["Someone"], agents_deleted: 1, known_artists: 2, artist_links: 1 });
    expect(db.t("agencies").map((a) => a.id)).toEqual(["ag1"]);
    expect(db.t("agents").map((a) => a.id)).toEqual(["a1", "a2"]);
    expect(db.t("known_artists")).toHaveLength(4);
  });

  it("deletes a single agent with roster and links, keeping the agency", async () => {
    const r = await deleteContact({ contact_type: "agent", name: "Meredith Jones" });
    expect(r.cascade).toEqual({ known_artists: 1, artist_links: 1 });
    expect(db.t("agencies")).toHaveLength(2);
    expect(db.t("agents").some((a) => a.id === "a2")).toBe(false);
  });

  it("rejects unknown contact types and missing records", async () => {
    await expect(deleteContact({ contact_type: "label", name: "x" })).rejects.toMatchObject({ status: 400 });
    await expect(deleteContact({ contact_type: "agency", name: "Nope" })).rejects.toMatchObject({ status: 404 });
  });
});
