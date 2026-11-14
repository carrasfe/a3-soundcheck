import { describe, it, expect } from "vitest";
import { buildResearchPrompt } from "./research-prompt";

describe("buildResearchPrompt", () => {
  it("lists artists tagged draft or new", () => {
    const p = buildResearchPrompt([
      { name: "Wet Leg", genre: "Rock / Alt / Indie", existing: true },
      { name: "Zach Bryan", genre: "Country", existing: false },
    ]);
    expect(p.startsWith("A3 Soundcheck batch research. Update drafts via update_draft, create via create_draft.")).toBe(true);
    expect(p).toContain(
      "ARTISTS:\n" +
      "1. Wet Leg (Rock / Alt / Indie) draft\n" +
      "2. Zach Bryan (Country) new\n"
    );
  });

  it("stays compact", () => {
    const p = buildResearchPrompt([{ name: "Wet Leg", genre: "Rock / Alt / Indie", existing: false }]);
    expect(p.length).toBeLessThan(1500);
    expect(p).toContain("Pollstar (datacloud: US/CA headline only");
  });
});
