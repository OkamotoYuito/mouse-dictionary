import { expect, test } from "vitest";
import {
  addToHistory,
  findInHistory,
  HISTORY_LIMIT,
  historyKey,
  normalizeHistory,
  normalizeSource,
  similarity,
} from "../../src/pdf-viewer/translation-history";

const SENTENCE = "The photons absorbed in the shell do not only provide heat but also deposit momentum.";

test("history is kept per PDF", () => {
  expect(historyKey("abc")).toBe("pdfTranslationHistory:abc");
});

test("selection differences in spacing, hyphenation, quotes and case don't matter", () => {
  expect(normalizeSource("The  photo-\nionising “front” ,  is ")).toBe(
    normalizeSource('the photoionising "front", is'),
  );
  expect(normalizeSource("A – B")).toBe("a - b");
});

test("the very same sentence is reused", () => {
  const entries = addToHistory([], { source: SENTENCE, translation: "訳", engine: "PLaMo" });
  const found = findInHistory(entries, `  ${SENTENCE.replace("momentum", "momen-\ntum")} `);
  expect(found?.kind).toBe("same");
  expect(found?.entry.translation).toBe("訳");
});

test("a nearly same sentence is found as similar, a different one not at all", () => {
  const entries = addToHistory([], { source: SENTENCE, translation: "訳", engine: "PLaMo" });
  expect(findInHistory(entries, SENTENCE.replace("heat", "warmth"))?.kind).toBe("similar");
  expect(findInHistory(entries, "Stellar winds dominate the force budget of less massive clouds.")).toBeNull();
  // Short sentences are only ever reused when they are the same.
  const short = addToHistory([], { source: "is not large", translation: "大きくない", engine: "PLaMo" });
  expect(findInHistory(short, "is large")).toBeNull();
});

test("similarity counts words", () => {
  expect(similarity("a b c d", "a b c d")).toBe(1);
  expect(similarity("a b c d", "a x c d")).toBe(0.75);
  expect(similarity("", "")).toBe(1);
});

test("the newest translation comes first and replaces an older one of the same sentence", () => {
  let entries = addToHistory([], { source: "first sentence here", translation: "1", engine: "PLaMo", now: 1 });
  entries = addToHistory(entries, { source: "second sentence here", translation: "2", engine: "PLaMo", now: 2 });
  entries = addToHistory(entries, { source: "First  sentence here", translation: "1b", engine: "Azure", now: 3 });
  expect(entries.map((entry) => entry.translation)).toEqual(["1b", "2"]);
});

test("history is capped", () => {
  let entries = [];
  for (let i = 0; i < HISTORY_LIMIT + 5; i++) {
    entries = addToHistory(entries, { source: `sentence number ${i}`, translation: String(i), engine: "PLaMo" });
  }
  expect(entries).toHaveLength(HISTORY_LIMIT);
  expect(entries[0].translation).toBe(String(HISTORY_LIMIT + 4));
});

test("broken stored entries are dropped", () => {
  const history = normalizeHistory({
    entries: [
      { source: "a b", translation: "x", place: { page: 2, x: 0.1, y: 0.2 }, at: 5 },
      { source: "c d", translation: "y", place: { page: "2" } },
      { source: 1 },
      null,
    ],
  });
  expect(history).toHaveLength(2);
  expect(history[0]).toMatchObject({ normalized: "a b", place: { page: 2, x: 0.1, y: 0.2 }, engine: "" });
  expect(history[1].place).toBeNull();
  expect(normalizeHistory(undefined)).toEqual([]);
});
