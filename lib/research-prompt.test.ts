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
    expect(p.length).toBeLessThan(2000);
    expect(p).toContain("Pollstar (datacloud: US/CA headline only");
  });

  it("uses the Audience + Platforms Chartmetric path only", () => {
    const p = buildResearchPrompt([{ name: "Wet Leg", genre: "Rock / Alt / Indie", existing: false }]);
    expect(p).toContain("- Click Audience tab: read all demographic data");
    expect(p).toContain(
      "click '1 Year' to see the 12-month growth percentage\n" +
      "- Still in Spotify section: scroll down to playlists and read the editorial playlist count for playlist_score\n" +
      "- Stay in Platforms, click Instagram"
    );
    expect(p).toContain("click '3 Month' to see the 90-day follower growth");
    expect(p).toContain("- Stay in Platforms, click YouTube: read subscribers and engagement rate");
    for (const gone of ["List view", "list view", "Social & Streaming", "Overview tab", "Playlists tab"]) {
      expect(p).not.toContain(gone);
    }
  });
});
