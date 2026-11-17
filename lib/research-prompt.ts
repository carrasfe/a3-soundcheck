/** An artist in a Quick Research batch. existing = already has a draft (update_draft), else create_draft. */
export type ResearchArtist = { name: string; genre: string; existing: boolean };

/**
 * The Claude-in-Chrome research prompt copied by the Quick Research modal.
 * Kept compact — most of the per-site workflow lives in the user's Claude
 * preferences. Chartmetric's exact navigation path (Audience + Platforms only)
 * is spelled out here because its UI is easy to get lost in.
 */
export function buildResearchPrompt(artists: ResearchArtist[]): string {
  const list = artists
    .map((a, i) => `${i + 1}. ${a.name} (${a.genre}) ${a.existing ? "draft" : "new"}`)
    .join("\n");
  return `A3 Soundcheck batch research. Update drafts via update_draft, create via create_draft.

ARTISTS:
${list}

PER ARTIST:

CHARTMETRIC (app.chartmetric.com):
- Search for the artist
- Click Audience tab: read all demographic data (age brackets by male/female, ethnicity)
- Click Platforms tab, then Spotify: read monthly listeners and fan conversion rate. In the metrics section below, click '1 Year' to see the 12-month growth percentage
- Still in Spotify section: scroll down to playlists and read the editorial playlist count for playlist_score
- Stay in Platforms, click Instagram: read followers and engagement rate. In the metrics section below, click '3 Month' to see the 90-day follower growth
- Stay in Platforms, click TikTok: read followers, average views/video, and engagement rate
- Stay in Platforms, click YouTube: read subscribers and engagement rate

Then: Rostr (team tab: mgmt, agents by territory) → Pollstar (datacloud: US/CA headline only, ignore support/international) → Push all to Soundcheck.

Fields: spotify_monthly_listeners, fan_concentration_ratio, spotify_yoy_pct, ig_followers, ig_er_pct, ig_90day_gain, tiktok_followers, tiktok_avg_views, tiktok_er_pct, youtube_subscribers, youtube_er_pct, reddit_members, discord_members, store_quality, merch_range, price_point_highest, d2c_level, merch_provider, press_score, playlist_score, num_dates, market_coverage, venue_capacity, sell_through_pct, management_company, manager_names, booking_agent, d_13_17_m, d_13_17_f, d_18_24_m, d_18_24_f, d_25_34_m, d_25_34_f, d_35_44_m, d_35_44_f, d_45_64_m, d_45_64_f, d_65_m, d_65_f, eth_white, eth_hispanic, eth_aa, eth_asian. Percentages as numbers (22 not 0.22).`;
}
