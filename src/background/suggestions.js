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

export const extractEnglishMeanings = (extract) => {
  const english = extract.split(/^==\s*英語\s*==\s*$/m)[1]?.split(/^==[^=].*==\s*$/m)[0];
  if (!english) return "";
  const parts = english.split(/^===\s*(名詞|動詞|形容詞|副詞|代名詞|前置詞|接続詞|間投詞)\s*===\s*$/m);
  const meanings = [];
  for (let i = 1; i < parts.length; i += 2) {
    const body = parts[i + 1]?.split(/^={3,}.*={3,}\s*$/m)[0] ?? "";
    const paragraphs = body
      .split(/\n\s*\n/)
      .slice(1)
      .join("\n");
    const lines = paragraphs
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /[\u3040-\u30ff\u3400-\u9fff]/.test(line));
    if (lines.length) meanings.push(`【${parts[i]}】${lines.slice(0, 4).join(" / ")}`);
  }
  return meanings.join("\n").slice(0, 3000);
};

export const suggestMeaning = async (word) => {
  let failed = false;
  try {
    const url = new URL("https://api.excelapi.org/dictionary/enja");
    url.searchParams.set("word", word);
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const meaning = (await response.text()).trim().slice(0, 5000);
    if (meaning) return { meaning, source: "ExcelAPI" };
  } catch {
    failed = true;
  }
  try {
    const response = await fetch(dictionaryUrl(word), { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    const pages = Object.values(result.query?.pages ?? {});
    const meaning = extractEnglishMeanings(pages[0]?.extract ?? "");
    if (meaning)
      return {
        meaning,
        source: "ウィクショナリー日本語版",
        sourceUrl: `https://ja.wiktionary.org/wiki/${encodeURIComponent(word)}`,
      };
    return failed ? { error: "一部の辞書に接続できず、他に候補も見つかりませんでした" } : { meaning: "" };
  } catch {
    return { error: "辞書に接続できませんでした" };
  }
};
