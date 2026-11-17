import { describe, it, expect, vi, beforeEach } from "vitest";
import { downloadScorecardPDF } from "./generate-scorecard-pdf";
import { calculateScore } from "./scoring-engine";
import { INITIAL_FORM_DATA, buildScoringInputs, type EvalFormData } from "@/app/evaluations/new/types";

// Capture every string drawn on the scorecard instead of writing a file.
const drawn = vi.hoisted(() => [] as string[]);
vi.mock("jspdf", async () => {
  const { default: RealJsPDF } = await vi.importActual<typeof import("jspdf")>("jspdf");
  type Doc = InstanceType<typeof RealJsPDF>;
  class RecordingJsPDF extends RealJsPDF {
    constructor(...args: ConstructorParameters<typeof RealJsPDF>) {
      super(...args);
      const realText = this.text.bind(this);
      this.text = ((text: string | string[], ...rest: unknown[]) => {
        drawn.push(...(Array.isArray(text) ? text : [text]));
        return (realText as (...a: unknown[]) => Doc)(text, ...rest);
      }) as Doc["text"];
      this.save = (() => this) as unknown as Doc["save"];
    }
  }
  return { default: RecordingJsPDF };
});

beforeEach(() => {
  drawn.length = 0;
  vi.stubGlobal("fetch", () => Promise.reject(new Error("no network in tests")));
});

async function render(overrides: Partial<EvalFormData>) {
  const inputs: EvalFormData = { ...INITIAL_FORM_DATA, artist_name: "Big Channel", genre: "Rock / Alt / Indie", ...overrides };
  const results = calculateScore(buildScoringInputs(inputs)!);
  await downloadScorecardPDF({
    artistName: "Big Channel", genre: inputs.genre, evaluatorName: "Test", evaluationDate: "2026-11-17T00:00:00Z",
    evaluationId: null, results, inputs,
  });
  return { results, text: drawn.join("\n") };
}

describe("scorecard PDF — TikTok/YouTube tiers and YouTube Reach", () => {
  it("shows tier codes, footnote labels, YouTube reference rows and both P4 bonus rows", async () => {
    const { results, text } = await render({
      tiktok_followers: "700000", tiktok_er_pct: "0.45", tiktok_avg_views: "4000000",
      youtube_subscribers: "3000000", youtube_er_pct: "0.06",
      youtube_monthly_audience: "8500000", youtube_avg_likes: "2100",
    });
    expect(results.p4.bonuses).toEqual({ tiktok_viral: 1.0, youtube_reach: 0.5 });

    expect(text).toContain("0.45% (700K flwrs · T5 adj)");
    expect(text).toContain("0.06% (3.0M subs · T5 adj · floor 2)");
    expect(text).toContain("TikTok ER 0.45% (Tier: 500K-1M adjusted)");
    expect(text).toContain("YouTube ER 0.06% (Tier: 1M+ adjusted; floor 2 for 500K+ subs)");
    expect(text).toContain("YT Audience");
    expect(text).toContain("8.5M/mo");
    expect(text).toContain("YT Avg Likes");
    expect(text).toContain("2.1K");
    expect(text).toContain("TikTok Viral");
    expect(text).toContain("YouTube Reach");
    expect(text).toContain("+0.50");
  });

  it("omits the new rows and notes for a small baseline-tier artist", async () => {
    const { text } = await render({
      tiktok_followers: "100000", tiktok_er_pct: "3",
      youtube_subscribers: "100000", youtube_er_pct: "3",
    });
    expect(text).not.toContain("YT Audience");
    expect(text).not.toContain("YT Avg Likes");
    expect(text).not.toContain("YouTube Reach");
    expect(text).not.toContain("(Tier:");
  });
});
