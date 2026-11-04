import { afterEach, expect, test, vi } from "vitest";
import {
  extractEnglishMeanings,
  extractJishoSuggestions,
  extractLsdMeanings,
  extractWikipediaTitle,
  extractWiktionaryTranslations,
  suggestMeaning,
} from "../../src/background/suggestions";

afterEach(() => vi.unstubAllGlobals());

const mockFetch = (responses: Record<string, unknown>) => {
  const fetchMock = vi.fn(async (url: URL) => {
    const host = new URL(String(url)).host;
    const value = responses[host];
    if (value instanceof Error || value === undefined) throw value ?? new Error("offline");
    return { ok: true, text: async () => value, json: async () => value };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

test("falls back to the English section of Japanese Wiktionary when the other dictionaries are empty", async () => {
  const extract =
    "== イタリア語 ==\n=== 名詞 ===\nnebula\n\n霧。\n== 英語 ==\n=== 名詞 ===\nnebula (複数形)\n\n星雲。\n\n==== 類義語 ====\n無関係";
  const fetchMock = mockFetch({
    "api.excelapi.org": "",
    "jisho.org": { data: [] },
    "en.wiktionary.org": { parse: { wikitext: "" } },
    "ja.wiktionary.org": { query: { pages: { "1": { extract } } } },
  });
  expect(await suggestMeaning("nebula")).toEqual({
    meaning: "【名詞】星雲。",
    source: "ウィクショナリー日本語版",
    sourceUrl: "https://ja.wiktionary.org/wiki/nebula",
  });
  expect(fetchMock.mock.calls.some(([url]) => String(url).includes("explaintext=1"))).toBe(true);
  expect(extractEnglishMeanings("== イタリア語 ==\n=== 名詞 ===\n霧")).toBe("");
});

test("collects candidates from JMdict and English Wiktionary", async () => {
  mockFetch({
    "api.excelapi.org": "",
    "jisho.org": {
      data: [
        {
          japanese: [{ word: "赤方偏移", reading: "せきほうへんい" }],
          senses: [{ english_definitions: ["redshift"] }],
        },
        {
          japanese: [{ word: "偏移", reading: "へんい" }],
          senses: [{ english_definitions: ["shift (e.g. redshift)"] }],
        },
      ],
    },
    "en.wiktionary.org": {
      parse: { wikitext: "{{trans-top|astronomy}}\n* Japanese: {{t+|ja|赤方偏移|tr=sekihō hen'i}}\n{{trans-bottom}}" },
    },
    "ja.wiktionary.org": { query: { pages: {} } },
  });
  const result = await suggestMeaning("redshift");
  expect(result.meaning).toBe("赤方偏移（せきほうへんい）");
  expect(result.source).toBe("JMdict (Jisho.org)");
  expect(result.alternatives).toEqual([
    {
      meaning: "【astronomy】赤方偏移",
      source: "Wiktionary英語版",
      sourceUrl: "https://en.wiktionary.org/wiki/redshift#Translations",
    },
  ]);
});

test("extracts JMdict entries, preferring exact gloss matches", () => {
  const data = [
    { japanese: [{ word: "癒着", reading: "ゆちゃく" }], senses: [{ english_definitions: ["adhesion", "accretion"] }] },
    { japanese: [{ word: "降着円盤" }], senses: [{ english_definitions: ["accretion disk"] }] },
  ];
  expect(extractJishoSuggestions(data, "accretion")).toEqual(["癒着（ゆちゃく）"]);
  expect(extractJishoSuggestions(data.slice(1), "accretion")).toEqual(["降着円盤 〔accretion disk〕"]);
});

test("extracts Japanese translations per sense from English Wiktionary", () => {
  const wikitext =
    "{{trans-top|growth by addition}}\n* French: {{t+|fr|accrétion}}\n* Japanese: {{t+|ja|降着|tr=kōchaku}}, {{t|ja|付着}}\n{{trans-bottom}}\n{{trans-top|other}}\n* French: {{t|fr|x}}\n{{trans-bottom}}";
  expect(extractWiktionaryTranslations(wikitext)).toEqual(["【growth by addition】降着、付着"]);
});

test("preserves the first dictionary result and reports errors when no source is available", async () => {
  mockFetch({ "api.excelapi.org": "雲", "jisho.org": { data: [] }, "en.wiktionary.org": {} });
  expect(await suggestMeaning("cloud")).toEqual({ meaning: "雲", source: "ExcelAPI" });
  const offline = mockFetch({});
  expect(await suggestMeaning("Cloud")).toEqual({ meaning: "雲", source: "ExcelAPI" });
  expect(offline).not.toHaveBeenCalled();
  expect(await suggestMeaning("sky")).toHaveProperty("error");
});

test("uses the Japanese Wikipedia title linked from the English article", () => {
  const query = { pages: [{ title: "Bolometer", langlinks: [{ lang: "ja", title: "ボロメータ" }] }] };
  expect(extractWikipediaTitle(query, "bolometer")).toBe("ボロメータ");
  expect(extractWikipediaTitle(query, "bolometric")).toBe("ボロメータ 〔Bolometer〕");
  expect(extractWikipediaTitle({ pages: [{ title: "Accretion" }] }, "accretion")).toBe("");
});

test("extracts meanings of the exact headword from the Life Science Dictionary page", () => {
  const html = `<div class="caption">
<span class="headword">culture</span>
</div>
<div class="meaning">
<span class="headword"><a href="#">培養</a></span>, 
<span class="explanation">(教養)</span>
<span class="headword"><a href="#">文化</a></span>, 
<span class="headword"><a href="#">培養</a></span>
<span class="inflection">する</span>
</div>
<div class="caption"><span class="headword">culture medium</span></div>
<div class="meaning"><span class="headword"><a href="#">培地</a></span></div>`;
  expect(extractLsdMeanings(html, "Culture")).toEqual(["培養、(教養)文化、培養する"]);
  expect(extractLsdMeanings("<html></html>", "culture")).toEqual([]);
});
