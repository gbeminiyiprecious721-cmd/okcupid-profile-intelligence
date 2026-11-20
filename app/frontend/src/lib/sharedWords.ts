/**
 * Keywords that two fictional profile texts really share, for the compare dialog.
 *
 * Only the two invented texts are read. Nothing here touches the ranking or any score.
 *
 * Rules, in order:
 *  1. Words are matched on a simple stem (a trailing plural "s" is ignored), so "weekend" matches "weekends".
 *  2. Function words (the, with, because ...) never count and break a phrase.
 *  3. Generic words (way, really, thing, good ...) never count on their own. They may sit inside a phrase,
 *     such as "old maps", when the other word of the phrase is distinctive.
 *  4. Two adjacent shared words become one phrase ("second hand"), and the single words inside it are dropped.
 *  5. Order: phrases first, then words used more often in both texts, then longer words, then alphabetical.
 *  6. Each keyword carries a short quote from each text, so the reader sees how it was used.
 */

const FUNCTION_WORDS = new Set(
  (
    "a about above after again all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its itself just me more most my myself no nor not now of off on once only or other our ours out over own same she should so some such than that the their theirs them then there these they this those through to too under until up us very was we were what when where which while who whom why will with would you your yours yourself " +
      "without within upon among against toward towards via per don doesn didn isn aren wasn weren won wouldn couldn shouldn ll ve re"
  ).split(" "),
);

const GENERIC_WORDS = new Set(
  (
    "way ways thing things stuff kind sort type lot lots bit bits little much many really actually basically honestly simply quite rather pretty always often usually sometimes never ever still yet already even maybe perhaps probably around almost enough " +
    "good great best better nice fine well bad new old big small long short easy hard real true sure certain different similar same other another " +
    "like love loves enjoy enjoys likes want wants need needs try tries trying make makes making made get gets getting got go goes going went come comes coming came take takes taking took give gives giving gave let lets keep keeps kept find finds found put puts see sees seen look looks looking know knows think thinks feel feels say says said tell tells ask asks use uses used " +
    "one two three first second last next day days time times year years week weeks people person someone anyone everyone everything something anything nothing life world home place places part parts end start " +
    "favourite favourites favorite favorites open idea ideas half right hour hours spend spends spent perfect happy believe believes bring brings tend tends hello ten sounds sound " +
    "friends friend conversation conversations talk talks talking read reads write writes learning learn learns laugh laughs laughing smile smiles slow loud excited pleasure night afternoon evening morning list work works working meet meeting meets back trip " +
    "fun minutes minute note notes plenty strong friendly warm close call calls covered habit describing recommendation recommendations runs run excellent kind " +
    "will would should could may might must shall own back away off together along while whenever every each both either neither"
  ).split(" "),
);

export type SharedKeyword = {
  /** The words as the first text writes them. */
  term: string;
  /** A short quote from each text, with the keyword in place. */
  contextA: string;
  contextB: string;
  phrase: boolean;
};

export const NO_KEYWORDS_MESSAGE = "No meaningful shared keywords found.";

type Token = { raw: string; stem: string; index: number; breakBefore: boolean };

const stem = (word: string) => (word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word);

function tokenize(text: string): Token[] {
  const lower = text.toLowerCase().replaceAll("’", "'");
  const tokens: Token[] = [];
  let previousEnd = 0;
  for (const match of lower.matchAll(/\p{L}+(?:'\p{L}+)?/gu)) {
    const raw = match[0];
    // Punctuation or a line break between two words ends a phrase: "chess. Tea" is not the phrase "chess tea".
    const breakBefore = tokens.length > 0 && /[.,;:!?()[\]\n\u2014\u2013]/.test(lower.slice(previousEnd, match.index));
    tokens.push({ raw, stem: stem(raw.replace(/'.*$/, "")), index: tokens.length, breakBefore });
    previousEnd = match.index + raw.length;
  }
  return tokens;
}

const isFunction = (t: Token) => FUNCTION_WORDS.has(t.raw) || FUNCTION_WORDS.has(t.stem);
const isGeneric = (t: Token) => GENERIC_WORDS.has(t.raw) || GENERIC_WORDS.has(t.stem);
/** A word that can stand alone as a keyword. */
const isKeyword = (t: Token) => t.raw.length >= 3 && !isFunction(t) && !isGeneric(t);

function quote(tokens: Token[], from: number, to: number): string {
  const lo = Math.max(0, from - 3);
  const hi = Math.min(tokens.length - 1, to + 3);
  const words = tokens.slice(lo, hi + 1).map((t) => t.raw);
  return `${lo > 0 ? "… " : ""}${words.join(" ")}${hi < tokens.length - 1 ? " …" : ""}`;
}

const countOf = (tokens: Token[], s: string) => tokens.filter((t) => t.stem === s).length;

export function sharedKeywords(textA: string, textB: string, limit = 6): SharedKeyword[] {
  const a = tokenize(textA);
  const b = tokenize(textB);
  if (a.length === 0 || b.length === 0) return [];

  const stemsB = new Set(b.filter((t) => !isFunction(t)).map((t) => t.stem));
  const found: (SharedKeyword & { weight: number })[] = [];
  const usedInPhrase = new Set<string>();
  const seen = new Set<string>();

  // Phrases: neighbouring words in text A that are neighbours in the same order in text B, at least one distinctive.
  // A run is taken as far as it goes ("second hand bookshops"), so overlapping pairs never repeat each other.
  for (let i = 0; i + 1 < a.length; i++) {
    const [x, y] = [a[i], a[i + 1]];
    if (y.breakBefore || isFunction(x) || isFunction(y) || x.stem === y.stem) continue;
    const j = b.findIndex((t, k) => t.stem === x.stem && b[k + 1]?.stem === y.stem && !b[k + 1].breakBefore);
    if (j < 0) continue;
    let length = 2;
    while (
      i + length < a.length &&
      j + length < b.length &&
      !a[i + length].breakBefore &&
      !b[j + length].breakBefore &&
      !isFunction(a[i + length]) &&
      a[i + length].stem === b[j + length].stem
    )
      length++;
    const run = a.slice(i, i + length);
    i += length - 1;
    if (!run.some(isKeyword)) continue; // a phrase of generic words only says nothing
    const key = run.map((t) => t.stem).join(" ");
    if (seen.has(key)) continue;
    seen.add(key);
    run.forEach((t) => usedInPhrase.add(t.stem));
    found.push({
      term: run.map((t) => t.raw).join(" "),
      contextA: quote(a, run[0].index, run[run.length - 1].index),
      contextB: quote(b, j, j + length - 1),
      phrase: true,
      weight: run.reduce((n, t) => n + countOf(a, t.stem) + countOf(b, t.stem), 0),
    });
  }

  // Single words, once each, skipping any that a phrase already explains.
  for (const token of a) {
    if (!isKeyword(token) || !stemsB.has(token.stem) || seen.has(token.stem) || usedInPhrase.has(token.stem)) continue;
    seen.add(token.stem);
    const j = b.find((t) => t.stem === token.stem)!;
    found.push({
      term: token.raw,
      contextA: quote(a, token.index, token.index),
      contextB: quote(b, j.index, j.index),
      phrase: false,
      weight: countOf(a, token.stem) + countOf(b, token.stem),
    });
  }

  found.sort((p, q) => Number(q.phrase) - Number(p.phrase) || q.weight - p.weight || q.term.length - p.term.length || p.term.localeCompare(q.term));
  return found.slice(0, limit).map((k) => ({ term: k.term, contextA: k.contextA, contextB: k.contextB, phrase: k.phrase }));
}
