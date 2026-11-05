import { expect, test, vi } from "vitest";
import {
  createResolver,
  DEFAULT_EMPHASIS,
  emphasisVariables,
  findOccurrences,
  formsOf,
  lookupMeaning,
  normalizeEmphasis,
  normalizePopup,
  normalizeWord,
  summarizeDescription,
} from "../../src/pdf-viewer/recorded-words";

test("normalizes a selection to a single lower-case English word", () => {
  expect(normalizeWord(" Traces, ")).toBe("traces");
  expect(normalizeWord("(interpreter)")).toBe("interpreter");
  expect(normalizeWord("don't")).toBe("don't");
  expect(normalizeWord("two words")).toBe("");
  expect(normalizeWord("赤方偏移")).toBe("");
});

const BASES: Record<string, string[]> = {
  traces: ["trac", "trace"],
  interpreter: ["interprete", "interpret"],
  ran: ["run"],
  loops: ["loop"],
};
const getForms = (word: string) => formsOf(word, (w: string) => BASES[w] ?? []);

test("treats inflected and irregular forms as the recorded word, but not derived words", () => {
  expect(getForms("traces")).toEqual(["traces", "trac", "trace"]);
  expect(getForms("ran")).toEqual(["ran", "run"]);
  expect(getForms("interpreter")).toEqual(["interpreter"]);

  const resolve = createResolver({ trace: {}, run: {}, interpret: {} }, getForms);
  expect(findOccurrences("Trace-based traces ran; an interpreter.", resolve)).toEqual([
    { index: 0, length: 5, word: "trace" },
    { index: 12, length: 6, word: "trace" },
    { index: 19, length: 3, word: "run" },
  ]);
  expect(findOccurrences("loops", createResolver({}, getForms))).toEqual([]);
});

test("keeps emphasis settings within the supported range", () => {
  expect(normalizeEmphasis(undefined)).toEqual(DEFAULT_EMPHASIS);
  expect(normalizeEmphasis({ style: "blink", color: "red", opacity: 500 })).toEqual({
    ...DEFAULT_EMPHASIS,
    opacity: 100,
  });
  expect(emphasisVariables({ style: "box", color: "#ff0000", opacity: 40 })).toEqual({
    "--md-recorded-line": "rgba(255, 0, 0, 0.8)",
    "--md-recorded-fill": "rgba(255, 0, 0, 0.4)",
    "--md-recorded-fill-light": "rgba(255, 0, 0, 0.1)",
  });
});

test("shortens long dictionary descriptions for the popup", () => {
  expect(summarizeDescription("跡\\n〈C〉足跡<br>痕跡\n4行目")).toBe("跡\n〈C〉足跡\n痕跡");
  expect(summarizeDescription("〈C〉跡 / 〈U〉気味 / 線 / 追跡する")).toBe("〈C〉跡\n〈U〉気味\n線");
  expect(summarizeDescription("あ".repeat(250))).toBe(`${"あ".repeat(200)}…`);
});

test("looks up the dictionary first, recording the base form, then the suggestions", async () => {
  const suggest = vi.fn().mockResolvedValue({ meaning: "降着", source: "JMdict (Jisho.org)" });
  const getDescriptions = async (entries: string[]) => (entries.includes("trace") ? { trace: "跡;追跡" } : {});

  expect(await lookupMeaning("traces", { getForms, getDescriptions, suggest })).toEqual({
    head: "trace",
    meaning: "跡;追跡",
    source: "辞書",
  });
  expect(suggest).not.toHaveBeenCalled();

  expect(await lookupMeaning("accretion", { getForms, getDescriptions, suggest })).toEqual({
    head: "accretion",
    meaning: "降着",
    source: "JMdict (Jisho.org)",
  });

  const failing = vi.fn().mockRejectedValue(new Error("offline"));
  expect(await lookupMeaning("accretion", { getForms, getDescriptions, suggest: failing })).toEqual({
    head: "accretion",
    meaning: "",
    source: "",
  });
});

test("keeps popup settings to the supported choices", () => {
  expect(normalizePopup(undefined)).toEqual({
    fontSize: "medium",
    width: "medium",
    theme: "auto",
    showSource: true,
    showActions: true,
  });
  expect(normalizePopup({ fontSize: "huge", width: "wide", theme: "dark", showActions: false })).toEqual({
    fontSize: "medium",
    width: "wide",
    theme: "dark",
    showSource: true,
    showActions: false,
  });
});
