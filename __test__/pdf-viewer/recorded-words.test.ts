import { expect, test, vi } from "vitest";
import {
  createColorizer,
  createMatcher,
  DEFAULT_EMPHASIS,
  emphasisVariables,
  formsOf,
  lookupMeaning,
  normalizeEmphasis,
  normalizePopup,
  normalizeText,
  summarizeDescription,
} from "../../src/pdf-viewer/recorded-words";

test("normalizes a selection to a lower-case word or short phrase", () => {
  expect(normalizeText(" Traces, ")).toBe("traces");
  expect(normalizeText("(interpreter)")).toBe("interpreter");
  expect(normalizeText("don't")).toBe("don't");
  expect(normalizeText("Took\n into  account.")).toBe("took into account");
  expect(normalizeText("well-known")).toBe("well-known");
  expect(normalizeText("however, it")).toBe("");
  expect(normalizeText("a b c d e f g h i")).toBe("");
  expect(normalizeText("赤方偏移")).toBe("");
});

const BASES: Record<string, string[]> = {
  traces: ["trac", "trace"],
  interpreter: ["interprete", "interpret"],
  ran: ["run"],
  loops: ["loop"],
  took: ["take"],
  taking: ["tak", "take"],
  made: ["make"],
  carried: ["carry"],
};
const getForms = (word: string) => formsOf(word, (w: string) => BASES[w] ?? []);

test("treats inflected and irregular forms as the recorded word, but not derived words", () => {
  expect(getForms("traces")).toEqual(["traces", "trac", "trace"]);
  expect(getForms("ran")).toEqual(["ran", "run"]);
  expect(getForms("interpreter")).toEqual(["interpreter"]);

  const { find } = createMatcher(["trace", "run", "interpret"], getForms);
  const words = (text: string) => find(text).map(({ word, segments }) => [word, segments]);
  expect(words("Trace-based traces ran; an interpreter.")).toEqual([
    ["trace", [{ index: 0, length: 5 }]],
    ["trace", [{ index: 12, length: 6 }]],
    ["run", [{ index: 19, length: 3 }]],
  ]);
  expect(createMatcher([], getForms).find("loops")).toEqual([]);
});

test("finds recorded phrases in their inflected forms, across lines and slots", () => {
  const { find, covers } = createMatcher(
    ["take ~ into account", "make up one's mind", "look forward to ~", "well-known", "trace", "a lot of"],
    getForms,
  );
  const words = (text: string) => find(text).map(({ word, segments }) => [word, segments]);

  expect(words("We took the risk into\naccount.")).toEqual([
    [
      "take ~ into account",
      [
        { index: 3, length: 4 },
        { index: 17, length: 12 },
      ],
    ],
  ]);
  expect(words("taking it into account")[0][0]).toBe("take ~ into account");
  // The slot needs at least one word, and punctuation ends a phrase.
  expect(words("take into account")).toEqual([]);
  expect(words("take it. Into account")).toEqual([]);
  expect(words("She made up her mind")).toEqual([["make up one's mind", [{ index: 4, length: 16 }]]]);
  expect(words("made up the board's mind")[0][1]).toEqual([{ index: 0, length: 24 }]);
  expect(words("I look forward to it")).toEqual([["look forward to ~", [{ index: 2, length: 15 }]]]);
  expect(words("a well known trace")).toEqual([
    ["well-known", [{ index: 2, length: 10 }]],
    ["trace", [{ index: 13, length: 5 }]],
  ]);
  expect(words("an lot of")[0][0]).toBe("a lot of");

  expect(covers("take the risk into account")).toBe(true);
  expect(covers("take the risk")).toBe(false);
  expect(covers("traces")).toBe(true);
});

test("finds phrasal verbs with the particle moved after the object", () => {
  const { find } = createMatcher(["carry out", "go on"], getForms);
  expect(find("We carried the tests out.").map(({ word, segments }) => [word, segments])).toEqual([
    [
      "carry out",
      [
        { index: 3, length: 7 },
        { index: 21, length: 3 },
      ],
    ],
  ]);
  expect(find("carry it to the lab out")).toEqual([]);
  expect(find("go to the store on Monday")).toEqual([]);
});

test("prefers the longer match where a word is also part of a recorded phrase", () => {
  const { find } = createMatcher(["take", "take ~ into account", "risk"], getForms);
  expect(find("take the risk into account; take it").map(({ word }) => word)).toEqual([
    "take ~ into account",
    "risk",
    "take",
  ]);
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

  expect(await lookupMeaning("traces", { getForms, getEntries: () => [], getDescriptions, suggest })).toEqual({
    head: "trace",
    meaning: "跡;追跡",
    source: "辞書",
  });
  expect(suggest).not.toHaveBeenCalled();

  expect(await lookupMeaning("accretion", { getForms, getEntries: () => [], getDescriptions, suggest })).toEqual({
    head: "accretion",
    meaning: "降着",
    source: "JMdict (Jisho.org)",
  });

  const failing = vi.fn().mockRejectedValue(new Error("offline"));
  expect(
    await lookupMeaning("accretion", { getForms, getEntries: () => [], getDescriptions, suggest: failing }),
  ).toEqual({
    head: "accretion",
    meaning: "",
    source: "",
  });
});

test("records a phrase under the dictionary entry that covers all of it", async () => {
  const suggest = vi.fn().mockResolvedValue(null);
  const getEntries = () => ["took the risk", "take the risk", "take ~ into account", "take into"];
  const getDescriptions = async (entries: string[]) =>
    Object.fromEntries(entries.filter((e) => e.startsWith("take")).map((e) => [e, `${e}の訳`]));

  expect(await lookupMeaning("took the risk into account", { getForms, getEntries, getDescriptions, suggest })).toEqual(
    {
      head: "take ~ into account",
      meaning: "take ~ into accountの訳",
      source: "辞書",
    },
  );
  expect(await lookupMeaning("set off", { getForms, getEntries: () => [], getDescriptions, suggest })).toEqual({
    head: "set off",
    meaning: "",
    source: "",
  });
});

test("asks the online dictionaries for a phrase in its base form when it is not in the dictionary", async () => {
  const suggest = vi.fn(async (word: string) =>
    word === "make up one's mind" ? { meaning: "決心する", source: "Wiktionary英語版" } : null,
  );
  const getEntries = () => [
    "made up his mind",
    "make up his mind",
    "made ~ mind",
    "made up one's mind",
    "make up one's mind",
  ];
  expect(
    await lookupMeaning("made up his mind", { getForms, getEntries, getDescriptions: async () => ({}), suggest }),
  ).toEqual({ head: "make up one's mind", meaning: "決心する", source: "Wiktionary英語版" });
  expect(suggest.mock.calls.map(([word]) => word)).toEqual([
    "made up his mind",
    "make up one's mind",
    "make up his mind",
    "made up one's mind",
  ]);
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

test("colors meanings with the dialog's replace rules after escaping them", () => {
  const colorize = createColorizer([
    { search: "(〈.+?〉)", replace: '<span style="color:#008000;{{cssReset}}">$1</span>' },
    { search: "\\n", replace: "<br/>" },
    { search: "([", replace: "broken" },
  ]);
  expect(colorize("〈U〉超過\n<b>余分</b>")).toBe(
    '<span style="color:#008000;">〈U〉</span>超過<br/>&lt;b&gt;余分&lt;/b&gt;',
  );
  expect(createColorizer()("a & b")).toBe("a &amp; b");
});
