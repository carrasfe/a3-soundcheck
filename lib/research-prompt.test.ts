import { describe, it, expect } from "vitest";
import { buildResearchPrompt } from "./research-prompt";

describe("buildResearchPrompt", () => {
  it("marks existing drafts for update_draft and new artists for create_draft", () => {
    const p = buildResearchPrompt([
      { name: "Wet Leg", genre: "Rock / Alt / Indie", existing: true },
      { name: "Zach Bryan", genre: "Country", existing: false },
    ]);
    expect(p.startsWith("Run A3 Soundcheck research for 2 artists.")).toBe(true);
    expect(p).toContain(
      "ARTISTS:\n" +
      "1. Wet Leg (Rock / Alt / Indie) — existing draft, use update_draft to add data\n" +
      "2. Zach Bryan (Country) — new, use create_draft\n"
    );
  });

  it("uses singular wording for one artist", () => {
    const p = buildResearchPrompt([{ name: "Wet Leg", genre: "Rock / Alt / Indie", existing: false }]);
    expect(p.startsWith("Run A3 Soundcheck research for 1 artist.")).toBe(true);
  });
});
