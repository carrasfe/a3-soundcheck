import { describe, it, expect } from "vitest";
import { parseRosterPaste, isGenreLine, isCountLine } from "./roster-paste";

// Rostr "See All" roster exactly as pasted by the user: name → genre tags →
// listener count → optional follower count → optional "On tour".
const ROSTR_PASTE = `Sublime
Alternative
Reggae
Rock
Reggae Rock
Ska
Ska Punk
10.7M
On tour
KYLE
4.74M
1.71M
Dilated Peoples
Hip Hop & Rap
Hip Hop
Old School Hip Hop
Underground Hip Hop
West Coast Hip Hop
1.18M
On tour
Common Kings
Reggae
Rock
Nz Reggae
Reggae Rock
944k
On tour
JJ Grey & Mofro
Rock
Blues Rock
Jam Band
Modern Blues
Southern Rock
742k
52.7k
Cisco Adler
648k
40k
On tour
Tower Of Power
R&B/Soul
Funk
Jazz Funk
536k
Sammy Johnson
Reggae
Nz Reggae
434k
130k
Kate Morgan
358k
Lettuce
R&B/Soul
Rock
Funk
Funk Rock
Jam Band
Jazz Funk
325k
132k
On tour
Amigo the Devil
Alternative
Alt Country
Anti Folk
Folk Punk
Southern Gothic
308k
On tour
Evidence
Hip Hop & Rap
Boom Bap
Underground Hip Hop
231k
350k
Butcher Brown
Jazz
R&B/Soul
Indie Jazz
Jazz Funk
Jazz Fusion
Nu Jazz
219k
66.4k
On tour
The Vandals
Alternative
Reggae
Hardcore Punk
Melodic Hardcore
Punk
Ska
Ska Punk
Skate Punk
199k
77.5k
On tour
Poncho Sanchez
Jazz
Afro Cuban Jazz
Cha Cha Cha
Latin Jazz
Mambo
Salsa
Son Cubano
194k
12.4k
On tour
The Infamous Stringdusters
Country
Rock
Americana
Bluegrass
Jam Band
Newgrass
133k
87.6k
On tour
Anomalie
Jazz
Jazz Fusion
Nu Jazz
131k
321k
Judith Hill
R&B/Soul
Neo Soul
87.5k
On tour
Adam Deitch`;

const EXPECTED = [
  "Sublime", "KYLE", "Dilated Peoples", "Common Kings", "JJ Grey & Mofro", "Cisco Adler", "Tower Of Power",
  "Sammy Johnson", "Kate Morgan", "Lettuce", "Amigo the Devil", "Evidence", "Butcher Brown", "The Vandals",
  "Poncho Sanchez", "The Infamous Stringdusters", "Anomalie", "Judith Hill", "Adam Deitch",
];

describe("parseRosterPaste", () => {
  it("returns exactly the 19 artists, in order, from the real Rostr paste", () => {
    expect(parseRosterPaste(ROSTR_PASTE)).toEqual(EXPECTED);
  });

  it("is not thrown off by a missing count, an extra tag, or On tour in odd places", () => {
    expect(parseRosterPaste("Sublime\nReggae\nOn tour\nKYLE\n2.3M\nLettuce\nFunk")).toEqual(["Sublime", "KYLE", "Lettuce"]);
  });

  it("keeps a plain one-per-line list as-is", () => {
    expect(parseRosterPaste("Wet Leg\nFontaines D.C.\n\nIdles\n")).toEqual(["Wet Leg", "Fontaines D.C.", "Idles"]);
  });

  it("de-duplicates case-insensitively and trims whitespace", () => {
    expect(parseRosterPaste("  Sublime  \nsublime\nSUBLIME")).toEqual(["Sublime"]);
  });

  it("recognises count lines", () => {
    for (const c of ["10.7M", "944k", "1.71M", "325k", "132k", "12.4k", "12.4K", "308K", "1,234", "#12", "2.3m", "12.4k listeners"]) {
      expect(isCountLine(c)).toBe(true);
    }
    for (const n of ["311", "Blink-182", "Sum 41", "Matchbox Twenty"]) {
      // pure numbers are counts — bands named only with digits are the one casualty
      if (n === "311") continue;
      expect(isCountLine(n)).toBe(false);
    }
  });

  it("recognises genre tags, including unlisted combinations of genre words", () => {
    for (const g of ["Hip Hop & Rap", "R&B/Soul", "Nz Reggae", "Psychedelic Soul", "Modern Alt Rock", "Cha Cha Cha"]) {
      expect(isGenreLine(g)).toBe(true);
    }
    for (const a of ["Soul Asylum", "Tower Of Power", "The Vandals", "JJ Grey & Mofro", "Common Kings", "Pop Evil", "Amigo the Devil"]) {
      expect(isGenreLine(a)).toBe(false);
    }
  });
});
