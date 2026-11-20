// Parse artist names out of text pasted from a roster page — Rostr's "See All"
// artist list, Chartmetric, or a plain one-name-per-line list.
//
// Rostr pastes look like this per artist:
//   Sublime              ← artist name (kept)
//   Reggae               ← genre tags (skipped)
//   Rock
//   10.7M                ← listener / follower counts (skipped)
//   1.2M
//   On tour              ← tour flag (skipped)
//
// Every line is classified on its own — no reliance on position — so a missing
// count or an extra tag can't shift the next artist into the wrong slot.

/** "10.7M", "944k", "1,234", "#12", "12.4k listeners" */
const COUNT_RE = /^#?\d[\d,]*(\.\d+)?\s*[kmb]?(\s+(monthly\s+)?(listeners|followers|fans|subscribers))?$/i;
const ON_TOUR_RE = /^on\s+tour\b/i;

/** Whole-line genre tags as Rostr / Chartmetric show them. */
const GENRE_PHRASES = [
  "Alternative", "Rock", "Reggae", "Hip Hop", "Rap", "R&B", "Soul", "Jazz", "Country", "Folk", "Punk", "Metal",
  "Pop", "Electronic", "EDM", "Blues", "Funk", "Ska", "Americana", "Bluegrass", "Indie", "Latin", "Gospel",
  "Christian", "Broadway", "Theater", "Hip Hop & Rap", "R&B/Soul", "Blues Rock", "Jam Band", "Folk Punk",
  "Southern Rock", "Southern Gothic", "Reggae Rock", "Jazz Funk", "Jazz Fusion", "Nu Jazz", "Ska Punk",
  "Skate Punk", "Hardcore Punk", "Melodic Hardcore", "Underground Hip Hop", "West Coast Hip Hop",
  "Old School Hip Hop", "Boom Bap", "Neo Soul", "Alt Country", "Anti Folk", "Afro Cuban Jazz", "Latin Jazz",
  "Nz Reggae", "Newgrass", "Funk Rock", "Indie Jazz", "Cha Cha Cha", "Mambo", "Salsa", "Son Cubano",
];

/**
 * Words that genre tags are built from. A line made up ONLY of these words
 * (e.g. "Psychedelic Soul", "Modern Alt Rock") is treated as a genre tag even if
 * it isn't in GENRE_PHRASES. Artist names almost always contain at least one
 * other word ("Soul Asylum", "Tower Of Power", "The Vandals"), so they survive.
 */
const GENRE_WORDS = new Set([
  ...GENRE_PHRASES.flatMap((p) => p.toLowerCase().split(/[\s/]+/)).filter((w) => w !== "&"),
  // common extras seen in Chartmetric / Rostr tags
  "alt", "modern", "classic", "contemporary", "psychedelic", "garage", "dream", "shoegaze", "grunge", "emo",
  "post", "prog", "progressive", "hard", "soft", "acoustic", "singer-songwriter", "roots", "trap", "house",
  "techno", "dance", "ambient", "lo-fi", "new", "wave", "worship", "swing", "dub", "dancehall", "surf",
  "stoner", "sludge", "doom", "thrash", "death", "black", "screamo", "pop-punk", "britpop", "synth", "synthpop",
  "chillwave", "experimental", "instrumental", "orchestral", "classical", "soundtrack", "a cappella",
  "musical", "christmas", "kids", "children's", "comedy", "spoken", "word", "world", "afrobeat", "afrobeats",
  "reggaeton", "cumbia", "bachata", "merengue", "tejano", "norteño", "corridos", "regional", "mexican",
  "k-pop", "j-pop", "j-rock", "r&b/soul", "hip-hop", "rnb",
]);

const GENRE_PHRASE_SET = new Set(GENRE_PHRASES.map((p) => p.toLowerCase()));

export function isCountLine(line: string): boolean {
  return COUNT_RE.test(line.trim());
}

export function isGenreLine(line: string): boolean {
  const l = line.trim().toLowerCase();
  if (!l) return false;
  if (GENRE_PHRASE_SET.has(l)) return true;
  // Split on spaces, "/", "," and a spaced "&" — keep "r&b" whole
  const words = l.split(/\s+&\s+|[\s/,]+/).filter(Boolean);
  return words.length > 0 && words.every((w) => GENRE_WORDS.has(w));
}

/** Artist names from a pasted roster, in order, de-duplicated (case-insensitive). */
export function parseRosterPaste(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line) continue;
    if (isCountLine(line) || ON_TOUR_RE.test(line) || isGenreLine(line)) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}
