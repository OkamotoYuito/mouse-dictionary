import { beforeEach, expect, test, vi } from "vitest";

const stored: Record<string, unknown> = {};

vi.mock("../../src/main/lib/storage", () => ({
  default: {
    local: {
      pick: async (key: string) => stored[key],
      get: async (keys: string[]) => Object.fromEntries(keys.filter((k) => k in stored).map((k) => [k, stored[k]])),
    },
  },
}));

// Plurals are enough to check that inflected forms match.
vi.mock("../../src/main/core/rule", () => ({
  default: { load: async () => {}, doBase: (word: string) => (word.endsWith("s") ? [word.slice(0, -1)] : []) },
}));

const { createGlossary, firstSense } = await import("../../src/background/glossary");

beforeEach(() => {
  for (const key of Object.keys(stored)) delete stored[key];
});

test("takes the first sense of a dictionary or user-written meaning", () => {
  expect(firstSense("『避けがたい』,免れられない")).toBe("避けがたい");
  expect(firstSense("〈U〉(大きさ・数などが)等しくないこと / 不平等")).toBe("等しくないこと");
  expect(firstSense("ビリアル比<br>2番目の意味")).toBe("ビリアル比");
  expect(firstSense("A &amp; B、C")).toBe("A & B");
  expect(firstSense("…‘を'四方に散らす,追い散らす")).toBe("四方に散らす");
  expect(firstSense("〈線・図形〉‘を'『描く』")).toBe("描く");
  expect(firstSense("(…まで)…‘の'由来をさかのぼる")).toBe("由来をさかのぼる");
  expect(firstSense(undefined)).toBe("");
});

test("picks the astronomy terms that appear in a paragraph, including plurals and longer phrases", async () => {
  const glossaryFor = await createGlossary({ astronomy: true, recordedWords: false });
  expect(glossaryFor("The outflows from the hot core are seen in the dust continuum map.")).toEqual([
    { source: "outflow", target: "アウトフロー" },
    { source: "hot core", target: "ホットコア" },
    { source: "dust continuum", target: "ダスト連続波" },
  ]);
  expect(glossaryFor("Nothing relevant here.")).toEqual([]);
});

test("puts the user's own meanings first and dictionary meanings of recorded words last", async () => {
  stored["**** recorded words ****"] = { source: {}, clump: {}, ineffective: {} };
  stored["**** custom word ****:source"] = "電波源";
  stored.clump = "かたまり,群れ";
  stored.ineffective = "効果のない,むだな";
  const glossaryFor = await createGlossary();
  expect(glossaryFor("The source has clumps, but the method is ineffective.")).toEqual([
    { source: "source", target: "電波源" },
    { source: "clump", target: "クランプ" },
    { source: "ineffective", target: "効果のない" },
  ]);
});

test("uses the list edited on the options page instead of the built-in one, skipping blank rows", async () => {
  stored["**** astronomy glossary ****"] = [
    ["outflow", "分子流"],
    ["", "空欄"],
    ["clump", " "],
  ];
  const glossaryFor = await createGlossary({ astronomy: true, recordedWords: false });
  expect(glossaryFor("The outflow from the clump and the hot core.")).toEqual([
    { source: "outflow", target: "分子流" },
  ]);
});

test("returns nothing when both glossaries are turned off", async () => {
  const glossaryFor = await createGlossary({ astronomy: false, recordedWords: false });
  expect(glossaryFor("The outflow is strong.")).toEqual([]);
});
