const dictionaryUrl = (word) => {
  const url = new URL("https://ja.wiktionary.org/w/api.php");
  url.search = new URLSearchParams({
    action: "query",
    prop: "extracts",
    explaintext: "1",
    titles: word,
    format: "json",
  });
  return url;
};

export const extractEnglishSuggestions = (extract) => {
  const english = extract.split(/^==\s*英語\s*==\s*$/m)[1]?.split(/^==[^=].*==\s*$/m)[0];
  if (!english) return [];
  const parts = english.split(/^===\s*(名詞|動詞|形容詞|副詞|代名詞|前置詞|接続詞|間投詞)\s*===\s*$/m);
  const meanings = [];
  for (let i = 1; i < parts.length; i += 2) {
    const body = parts[i + 1]?.split(/^={3,}.*={3,}\s*$/m)[0] ?? "";
    const lines = body
      .split(/\n\s*\n/)
      .slice(1)
      .join("\n")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /[\u3040-\u30ff\u3400-\u9fff]/.test(line))
      .map((line) => `【${parts[i]}】${line.replace(/^#+\s*/, "")}`);
    meanings.push(...lines);
  }
  return meanings.slice(0, 8).map((meaning) => meaning.slice(0, 500));
};

export const extractEnglishMeanings = (extract) => extractEnglishSuggestions(extract).join("\n");

export const suggestMeaning = async (word) => {
  const [excelResult, wiktionaryResult] = await Promise.allSettled([
    (async () => {
      const url = new URL("https://api.excelapi.org/dictionary/enja");
      url.searchParams.set("word", word);
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return (await response.text()).trim().slice(0, 5000);
    })(),
    (async () => {
      const response = await fetch(dictionaryUrl(word), { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      const pages = Object.values(result.query?.pages ?? {});
      return extractEnglishSuggestions(pages[0]?.extract ?? "").map((meaning) => ({
        meaning,
        source: "ウィクショナリー日本語版",
        sourceUrl: `https://ja.wiktionary.org/wiki/${encodeURIComponent(word)}`,
      }));
    })(),
  ]);
  const suggestions = [];
  if (excelResult.status === "fulfilled" && excelResult.value)
    suggestions.push({ meaning: excelResult.value, source: "ExcelAPI" });
  if (wiktionaryResult.status === "fulfilled") suggestions.push(...wiktionaryResult.value);
  const unique = [...new Map(suggestions.map((item) => [item.meaning, item])).values()].slice(0, 8);
  if (!unique.length) {
    return excelResult.status === "rejected" && wiktionaryResult.status === "rejected"
      ? { error: "辞書に接続できませんでした" }
      : { meaning: "" };
  }
  return {
    meaning: unique[0].meaning,
    source: unique[0].source,
    ...(unique[0].sourceUrl ? { sourceUrl: unique[0].sourceUrl } : {}),
    ...(unique.length > 1 ? { alternatives: unique.slice(1) } : {}),
  };
};
