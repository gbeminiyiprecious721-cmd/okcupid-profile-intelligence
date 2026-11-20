import { describe, expect, it } from "vitest";
import { NO_KEYWORDS_MESSAGE, sharedKeywords } from "./sharedWords";

const terms = (a: string, b: string) => sharedKeywords(a, b).map((k) => k.term);

describe("generic words are not keywords", () => {
  it("drops 'way' and other generic words that both texts use", () => {
    expect(terms("I like to take the long way home and do things really well", "My way of doing things is always good and really nice")).toEqual([]);
  });

  it("drops function words, short words and numbers", () => {
    expect(terms("It is on at 10 and so we go to it", "It is on at 10 and so we go to it")).toEqual([]);
  });

  it("drops contractions of function words", () => {
    expect(terms("I don't know and I can't say", "We don't know and they can't say")).toEqual([]);
  });

  it("keeps a distinctive word even when generic words surround it", () => {
    expect(terms("The way I make sourdough is slow", "My way of life includes sourdough")).toEqual(["sourdough"]);
  });
});

describe("distinctive shared words", () => {
  it("finds words that appear in both texts, ignoring case and punctuation", () => {
    expect(terms("Pottery, kayaking! And chess.", "I love KAYAKING; chess club on Fridays")).toEqual(["kayaking", "chess"]);
  });

  it("matches a plural with its singular and shows the first text's form", () => {
    expect(terms("Weekends at the market", "A weekend market stall")).toEqual(["weekends", "market"].sort((a, b) => b.length - a.length || a.localeCompare(b)));
    expect(sharedKeywords("I paint watercolours", "A watercolour course")[0].term).toBe("watercolours");
  });

  it("joins neighbouring shared words into one phrase and drops the single words inside it", () => {
    const result = sharedKeywords("I browse second hand bookshops", "Second hand bookshops are my weakness");
    expect(result[0].term).toBe("second hand bookshops");
    expect(result[0].phrase).toBe(true);
    expect(result.map((k) => k.term)).not.toContain("hand");
    expect(result.map((k) => k.term)).not.toContain("bookshops");
  });

  it("allows a generic word inside a phrase when the other word is distinctive", () => {
    expect(terms("I collect old maps", "Old maps cover my walls")).toContain("old maps");
  });

  it("does not make a phrase of two generic words", () => {
    expect(terms("A good way to spend time", "Good way to waste time")).toEqual([]);
  });

  it("ranks phrases first, then words used more often, then longer words", () => {
    const a = "Tea. Tea. Tea. Kayaking. Sourdough. Chess.";
    const b = "Tea, kayaking, sourdough, chess, tea";
    expect(terms(a, b)).toEqual(["tea", "sourdough", "kayaking", "chess"]);
  });

  it("does not join words across punctuation or a new line", () => {
    expect(terms("I play chess. Tea is my vice", "Tea? Chess!")).toEqual(["chess", "tea"]);
    expect(terms("I play chess\ntea is my vice", "chess tea")).toEqual(["chess", "tea"]);
  });

  it("lists each keyword once however often it repeats", () => {
    expect(terms("chess chess chess chess", "chess chess")).toEqual(["chess"]);
  });

  it("returns at most six keywords", () => {
    const words = "alpha, bravo, charlie, delta, echo, foxtrot, golf, hotel";
    expect(sharedKeywords(words, words)).toHaveLength(6);
  });
});

describe("context", () => {
  it("quotes each text around the keyword, with ellipses when it is cut", () => {
    const [k] = sharedKeywords("Every spring weekend I go kayaking on the quiet river near home", "Kayaking suits me");
    expect(k.term).toBe("kayaking");
    expect(k.contextA).toBe("… weekend i go kayaking on the quiet …");
    expect(k.contextB).toBe("kayaking suits me");
  });

  it("only ever quotes the two texts it was given", () => {
    const [k] = sharedKeywords("I love kayaking", "kayaking is calm");
    expect(`${k.contextA} ${k.contextB}`).toMatch(/kayaking/);
  });
});

describe("empty results and edge cases", () => {
  it("returns nothing for empty, whitespace and punctuation only text", () => {
    expect(sharedKeywords("", "kayaking")).toEqual([]);
    expect(sharedKeywords("kayaking", "   ")).toEqual([]);
    expect(sharedKeywords("!!! ... ???", "--- ,,,")).toEqual([]);
  });

  it("returns nothing when no word is shared", () => {
    expect(terms("alpine skiing", "coastal sailing")).toEqual([]);
  });

  it("handles accents, curly apostrophes and mixed scripts without failing", () => {
    expect(terms("Café crème and the artist’s studio", "A café near the studio")).toEqual(["café", "studio"].sort((a, b) => b.length - a.length || a.localeCompare(b)));
    expect(() => sharedKeywords("日本語 テキスト", "日本語")).not.toThrow();
  });

  it("is symmetric about which words are found", () => {
    const a = "Kayaking and chess on weekends";
    const b = "Weekends mean chess and kayaking";
    expect([...terms(a, b)].sort()).toEqual([...terms(b, a)].sort());
  });

  it("copes with a very long text quickly", () => {
    const long = "kayaking ".repeat(20_000);
    const start = performance.now();
    expect(terms(long, "kayaking")).toEqual(["kayaking"]);
    expect(performance.now() - start).toBeLessThan(1500);
  });

  it("states the empty message exactly", () => {
    expect(NO_KEYWORDS_MESSAGE).toBe("No meaningful shared keywords found.");
  });
});
