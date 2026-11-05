import { expect, test } from "vitest";
import { americanize } from "../../../src/main/core/rule/british";
import spelling from "../../../src/main/core/rule/spelling";
import { formsOf } from "../../../src/pdf-viewer/recorded-words";

test("turns British spellings into American ones", () => {
  const pairs: [string, string][] = [
    ["colour", "color"],
    ["behaviours", "behaviors"],
    ["favourable", "favorable"],
    ["neighbouring", "neighboring"],
    ["ionisation", "ionization"],
    ["characterised", "characterized"],
    ["analyse", "analyze"],
    ["catalysed", "catalyzed"],
    ["centre", "center"],
    ["metres", "meters"],
    ["centred", "centered"],
    ["fibre", "fiber"],
    ["catalogue", "catalog"],
    ["modelled", "modeled"],
    ["labelling", "labeling"],
    ["cancelled", "canceled"],
    ["defence", "defense"],
    ["haemoglobin", "hemoglobin"],
    ["palaeontology", "paleontology"],
    ["aluminium", "aluminum"],
    ["grey", "gray"],
    ["focussed", "focused"],
  ];
  for (const [british, american] of pairs) expect(americanize(british)).toBe(american);
});

test("keeps capitalized words capitalized and leaves acronyms and plain words alone", () => {
  expect(americanize("Colour")).toBe("Color");
  expect(americanize("COLOUR")).toBeNull();
  for (const word of ["hour", "hours", "four", "your", "filled", "called", "color", "the", "this", "store", "genre"]) {
    expect(americanize(word)).toBeNull();
  }
});

test("adds American spellings to the spelling variants used for lookups", () => {
  const rule = new Map([["grey", "gray"]]);
  expect(spelling(rule, ["the", "modelled", "colour"])).toEqual(["the", "modeled", "color"]);
  expect(spelling(rule, ["the", "plain", "words"])).toBeNull();
});

test("lets British and American spellings match each other", () => {
  const doBase = (word: string) => (word.endsWith("s") ? [word.slice(0, -1)] : []);
  expect(formsOf("centres", doBase)).toEqual(expect.arrayContaining(["centres", "centre", "centers", "center"]));
  expect(formsOf("center", doBase)).toEqual(["center"]);
});
