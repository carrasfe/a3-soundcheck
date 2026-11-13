/** An artist in a Quick Research batch. existing = already has a draft (update_draft), else create_draft. */
export type ResearchArtist = { name: string; genre: string; existing: boolean };

/** The Claude-in-Chrome research prompt copied by the Quick Research modal. */
export function buildResearchPrompt(artists: ResearchArtist[]): string {
  const list = artists
    .map((a, i) => `${i + 1}. ${a.name} (${a.genre}) — ${a.existing ? "existing draft, use update_draft to add data" : "new, use create_draft"}`)
    .join("\n");
  return `Run A3 Soundcheck research for ${artists.length} artist${artists.length === 1 ? "" : "s"}. Work through them one at a time. After each artist, use the update_draft or create_draft Soundcheck tool to push the data before moving to the next.

ARTISTS:
${list}

For each artist, complete these steps:

CHARTMETRIC (app.chartmetric.com):
- Search for the artist
- Overview tab: read Spotify monthly listeners, Spotify followers, TikTok followers, YouTube subscribers, Instagram followers
- Click Social & Streaming Stats tab: read Instagram engagement rate, TikTok engagement rate (Chartmetric native ER), YouTube engagement rate, TikTok average views per video, Spotify Fan Conversion Rate
- Click the List view icon (horizontal lines icon) to switch to table view. Read the historical data to find: Spotify monthly listeners from 12 months ago (calculate YoY % change), Instagram followers from 90 days ago (calculate 90-day gain)
- Click Audience tab: read all age demographics (13-17, 18-24, 25-34, 35-44, 45-64, 65+) split by Male and Female percentages, and ethnicity breakdown (White, Hispanic, African American, Asian)
- Click Playlists tab: read editorial playlist count and total reach

ROSTR (rostr.co):
- Search for the artist
- Click their Team tab
- Read: management company, individual manager names, booking agencies with territory (North America, UK/EU, Worldwide), individual agent names, label, publisher
- Use Soundcheck get_contacts to check which companies, agencies, managers, and agents already exist in the database

POLLSTAR (pollstar.com):
- Search for the artist
- Click Explore in Datacloud on their artist page
- Read: venue capacities for recent shows, sell-through percentages
- Note the data for touring metrics

PUSH TO SOUNDCHECK:
After collecting all data for this artist, use the update_draft tool (search for the artist first to find the existing draft) or create_draft to push everything. Use these field names:
- spotify_monthly_listeners, fan_concentration_ratio, spotify_yoy_pct
- ig_followers, ig_er_pct, ig_90day_gain
- tiktok_followers, tiktok_avg_views, tiktok_er_pct
- youtube_subscribers, youtube_er_pct
- reddit_members, discord_members
- store_quality, merch_range, price_point_highest, d2c_level, merch_provider
- press_score, playlist_score
- num_dates, market_coverage, venue_capacity, sell_through_pct
- management_company, manager_names, booking_agent
- All demographics: d_13_17_m, d_13_17_f, d_18_24_m, d_18_24_f, d_25_34_m, d_25_34_f, d_35_44_m, d_35_44_f, d_45_64_m, d_45_64_f, d_65_m, d_65_f, eth_white, eth_hispanic, eth_aa, eth_asian
Enter percentages as numbers (22 for 22%, not 0.22).

After each artist, summarize what was found and what's still missing. Then move to the next artist.`;
}
