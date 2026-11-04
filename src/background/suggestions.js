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

const normalizeGloss = (gloss) =>
  gloss
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/^to /, "")
    .trim();

// Jisho.org searches the English glosses of JMdict (about 200k entries), which covers many technical terms.
export const extractJishoSuggestions = (data, word) => {
  const target = word.toLowerCase();
  const entries = data
    .map((entry) => {
      const glosses = entry.senses.flatMap((sense) => sense.english_definitions ?? []);
      const exact = glosses.some((gloss) => normalizeGloss(gloss) === target);
      const partial = glosses.some((gloss) => new RegExp(`\\b${target}\\b`, "i").test(gloss));
      const { word: written, reading } = entry.japanese?.[0] ?? {};
      const head = written ? (reading ? `${written}（${reading}）` : written) : reading;
      return { exact, partial, head, glosses };
    })
    .filter((entry) => entry.head && (entry.exact || entry.partial));
  const exact = entries.filter((entry) => entry.exact);
  return (exact.length ? exact.slice(0, 6) : entries.slice(0, 3)).map(
    (entry) => `${entry.head}${entry.exact ? "" : ` 〔${entry.glosses.slice(0, 3).join("; ")}〕`}`,
  );
};

// English Wiktionary has Japanese translation tables for many words not found in the Japanese edition.
export const extractWiktionaryTranslations = (wikitext) => {
  const meanings = [];
  for (const block of wikitext.split("{{trans-top").slice(1)) {
    const gloss = block.slice(0, block.indexOf("}}")).replace(/^\|/, "").replace(/\|.*$/, "").trim();
    const section = block.split("{{trans-bottom")[0];
    const terms = [...section.matchAll(/\{\{tt?\+?\|ja\|([^|}]+)(?:\|[^}]*)?\}\}/g)].map((match) => match[1].trim());
    const unique = [...new Set(terms)];
    if (unique.length) meanings.push(`${gloss ? `【${gloss.slice(0, 40)}】` : ""}${unique.join("、")}`);
  }
  return meanings.slice(0, 8);
};

const fetchJson = async (url, options = {}) => {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};

// Wikipedia's interlanguage links give the Japanese article title, which covers many technical and proper nouns.
export const extractWikipediaTitle = (query, word) => {
  const page = query?.pages?.[0];
  const title = page?.langlinks?.find((link) => link.lang === "ja")?.title;
  if (!title) return "";
  return page.title.toLowerCase() === word.toLowerCase() ? title : `${title} 〔${page.title}〕`;
};

const decodeEntities = (text) =>
  text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&");

// Life Science Dictionary (about 120k English headwords) only offers an HTML search page.
export const extractLsdMeanings = (html, word) =>
  html
    .split('<div class="caption">')
    .slice(1)
    .filter((block) => block.match(/<span class="headword">([^<]*)<\/span>/)?.[1].toLowerCase() === word.toLowerCase())
    .map((block) => block.match(/<div class="meaning">([\s\S]*?)<\/div>/)?.[1] ?? "")
    .map((meaning) =>
      decodeEntities(meaning.replace(/>\s+</g, "><").replace(/<[^>]*>/g, ""))
        .replace(/\s*,\s*/g, "、")
        .trim(),
    )
    .filter(Boolean)
    .slice(0, 4);

const cache = new Map();

export const suggestMeaning = async (word) => {
  const key = word.toLowerCase();
  if (cache.has(key)) return cache.get(key);
  const result = await lookup(word);
  if (!result.error) {
    cache.set(key, result);
    if (cache.size > 200) cache.delete(cache.keys().next().value);
  }
  return result;
};

const lookup = async (word) => {
  const results = await Promise.allSettled([
    (async () => {
      const url = new URL("https://api.excelapi.org/dictionary/enja");
      url.searchParams.set("word", word);
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return (await response.text()).trim().slice(0, 5000);
    })(),
    (async () => {
      const url = new URL("https://jisho.org/api/v1/search/words");
      url.searchParams.set("keyword", `"${word}"`);
      const result = await fetchJson(url);
      const meaning = extractJishoSuggestions(result.data ?? [], word).join(" / ");
      return meaning
        ? [{ meaning, source: "JMdict (Jisho.org)", sourceUrl: `https://jisho.org/search/${encodeURIComponent(word)}` }]
        : [];
    })(),
    (async () => {
      const url = new URL("https://en.wiktionary.org/w/api.php");
      url.search = new URLSearchParams({
        action: "parse",
        page: word.toLowerCase(),
        prop: "wikitext",
        redirects: "1",
        format: "json",
        formatversion: "2",
      });
      const result = await fetchJson(url, { headers: { "Api-User-Agent": "MouseDictionary/1.0" } });
      return extractWiktionaryTranslations(result.parse?.wikitext ?? "").map((meaning) => ({
        meaning,
        source: "Wiktionary英語版",
        sourceUrl: `https://en.wiktionary.org/wiki/${encodeURIComponent(word.toLowerCase())}#Translations`,
      }));
    })(),
    (async () => {
      const url = new URL("https://en.wikipedia.org/w/api.php");
      url.search = new URLSearchParams({
        action: "query",
        titles: word,
        prop: "langlinks",
        lllang: "ja",
        redirects: "1",
        format: "json",
        formatversion: "2",
      });
      const result = await fetchJson(url, { headers: { "Api-User-Agent": "MouseDictionary/1.0" } });
      const meaning = extractWikipediaTitle(result.query, word);
      const page = result.query?.pages?.[0]?.title ?? word;
      return meaning
        ? [{ meaning, source: "Wikipedia", sourceUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(page)}` }]
        : [];
    })(),
    (async () => {
      const response = await fetch("https://lsd-project.jp/bin/ejdic.pl?opt=c", {
        method: "POST",
        body: new URLSearchParams({ query: word, mode: "exactly match", max: "100", inflect: "Ignore", romaji: "no" }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return extractLsdMeanings(await response.text(), word).map((meaning) => ({
        meaning,
        source: "ライフサイエンス辞書",
        sourceUrl: "https://lsd-project.jp/",
      }));
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
  const [excelResult, ...otherResults] = results;
  const suggestions = [];
  if (excelResult.status === "fulfilled" && excelResult.value)
    suggestions.push({ meaning: excelResult.value, source: "ExcelAPI" });
  for (const result of otherResults) {
    if (result.status === "fulfilled") suggestions.push(...result.value);
  }
  const unique = [...new Map(suggestions.map((item) => [item.meaning, item])).values()].slice(0, 10);
  if (!unique.length) {
    return results.every((result) => result.status === "rejected")
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
