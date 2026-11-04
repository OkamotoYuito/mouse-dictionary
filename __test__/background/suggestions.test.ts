import { afterEach, expect, test, vi } from "vitest";
import { extractEnglishMeanings, suggestMeaning } from "../../src/background/suggestions";

afterEach(() => vi.unstubAllGlobals());

test("falls back to the English section of Japanese Wiktionary when the first dictionary is empty", async () => {
  const extract =
    "== イタリア語 ==\n=== 名詞 ===\nnebula\n\n霧。\n== 英語 ==\n=== 名詞 ===\nnebula (複数形)\n\n星雲。\n\n==== 類義語 ====\n無関係";
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, text: async () => "" })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ query: { pages: { "1": { extract } } } }) });
  vi.stubGlobal("fetch", fetchMock);
  expect(await suggestMeaning("nebula")).toEqual({
    meaning: "【名詞】星雲。",
    source: "ウィクショナリー日本語版",
    sourceUrl: "https://ja.wiktionary.org/wiki/nebula",
  });
  expect(String(fetchMock.mock.calls[1][0])).toContain("explaintext=1");
  expect(extractEnglishMeanings("== イタリア語 ==\n=== 名詞 ===\n霧")).toBe("");
});

test("preserves the first dictionary result and reports errors when no source is available", async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, text: async () => "雲" });
  vi.stubGlobal("fetch", fetchMock);
  expect(await suggestMeaning("cloud")).toEqual({ meaning: "雲", source: "ExcelAPI" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  fetchMock
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({ ok: true, json: async () => ({ query: { pages: {} } }) });
  expect(await suggestMeaning("cloud")).toHaveProperty("error");
});
