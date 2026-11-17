import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeDb } from "@/lib/mcp/fake-db.test-helper";
import { getDraft } from "./get-draft";

let db = fakeDb();
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.sb }));

beforeEach(() => {
  db = fakeDb();
  const { t } = db;
  t("artists").push({ id: "art1", name: "Wet Leg", genre: "Rock / Alt / Indie" });
  t("artists").push({ id: "art2", name: "No Drafts", genre: "Pop" });
  t("profiles").push({ id: "u1", full_name: "Felix", email: "f@example.com" });
  t("evaluations").push(
    { id: "old", artist_id: "art1", status: "draft", evaluated_by: "u1", evaluated_at: "2026-11-01T00:00:00Z",
      inputs: { artist_name: "Wet Leg", genre: "Rock / Alt / Indie", ig_followers: "100" }, artists: { name: "Wet Leg", genre: "Rock / Alt / Indie" } },
    { id: "new", artist_id: "art1", status: "draft", evaluated_by: "u1", evaluated_at: "2026-11-10T00:00:00Z",
      inputs: { artist_name: "Wet Leg", genre: "Rock / Alt / Indie", ig_followers: "200", reddit_members: "", tiktok_followers: "" },
      artists: { name: "Wet Leg", genre: "Rock / Alt / Indie" } },
    { id: "done", artist_id: "art1", status: "complete", evaluated_by: "u1", evaluated_at: "2026-11-12T00:00:00Z",
      inputs: {}, artists: { name: "Wet Leg", genre: "Rock / Alt / Indie" } },
  );
});

describe("get_draft", () => {
  it("by artist name returns the most recent draft (never a completed evaluation)", async () => {
    const r = await getDraft({ artist_name: "wet leg" }, "https://app.test");
    expect(r.draft_id).toBe("new");
    expect(r).toMatchObject({
      artist_name: "Wet Leg", genre: "Rock / Alt / Indie", status: "draft",
      created_by: "Felix", last_saved_at: "2026-11-10T00:00:00Z",
      edit_url: "https://app.test/evaluations/new?edit=new",
    });
    expect(r.inputs.ig_followers).toBe("200");
    expect(r.filled_fields).toEqual(["artist_name", "genre", "ig_followers"]);
    expect(r.blank_fields).toEqual(["reddit_members", "tiktok_followers"]);
  });

  it("by draft_id returns that draft", async () => {
    expect((await getDraft({ draft_id: "old" }, "https://app.test")).inputs.ig_followers).toBe("100");
  });

  it("errors clearly when nothing matches", async () => {
    await expect(getDraft({}, "x")).rejects.toMatchObject({ status: 400 });
    await expect(getDraft({ draft_id: "done" }, "x")).rejects.toMatchObject({ status: 404 });
    await expect(getDraft({ artist_name: "Nobody" }, "x")).rejects.toMatchObject({ status: 404 });
    await expect(getDraft({ artist_name: "No Drafts" }, "x")).rejects.toMatchObject({ status: 404 });
  });
});
