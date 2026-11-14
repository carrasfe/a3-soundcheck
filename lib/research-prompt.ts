/** An artist in a Quick Research batch. existing = already has a draft (update_draft), else create_draft. */
export type ResearchArtist = { name: string; genre: string; existing: boolean };

/**
 * The Claude-in-Chrome research prompt copied by the Quick Research modal.
 * Kept deliberately compact — the detailed per-site workflow lives in the
 * user's Claude preferences, so it isn't repeated (and paid for) every batch.
 */
export function buildResearchPrompt(artists: ResearchArtist[]): string {
  const list = artists
    .map((a, i) => `${i + 1}. ${a.name} (${a.genre}) ${a.existing ? "draft" : "new"}`)
    .join("\n");
  return `A3 Soundcheck batch research. Update drafts via update_draft, create via create_draft.

ARTISTS:
${list}

PER ARTIST: Chartmetric (overview + social stats + list view for YoY/90d + audience demographics + playlists) → Rostr (team tab: mgmt, agents by territory) → Pollstar (datacloud: US/CA headline only, ignore support/international) → Push all to Soundcheck.

Fields: spotify_monthly_listeners, fan_concentration_ratio, spotify_yoy_pct, ig_followers, ig_er_pct, ig_90day_gain, tiktok_followers, tiktok_avg_views, tiktok_er_pct, youtube_subscribers, youtube_er_pct, reddit_members, discord_members, store_quality, merch_range, price_point_highest, d2c_level, merch_provider, press_score, playlist_score, num_dates, market_coverage, venue_capacity, sell_through_pct, management_company, manager_names, booking_agent, d_13_17_m, d_13_17_f, d_18_24_m, d_18_24_f, d_25_34_m, d_25_34_f, d_35_44_m, d_35_44_f, d_45_64_m, d_45_64_f, d_65_m, d_65_f, eth_white, eth_hispanic, eth_aa, eth_asian. Percentages as numbers (22 not 0.22).`;
}
