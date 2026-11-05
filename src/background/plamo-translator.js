import { TEX_EXPRESSION, translatePreservingTex } from "../main/core/translation";

export const PLAMO_TRANSLATOR_KEY = "**** plamo translator ****";

export const DEFAULT_PLAMO_URL = "http://127.0.0.1:8080";

const STOP = ["<|plamo:tag|>", "<|plamo:bos|>"];

// The model's chat template rejects text containing its own control tokens.
const isSafe = (text) => !text.includes("<|plamo:");

// PLaMo 3 Translate served by an OpenAI-compatible server such as llama-server, mlx_lm.server or vLLM.
// Its chat template turns glossary ([{ source, target }]) and context into the model's own prompt fields.
const requestTranslation = async (baseUrl, text, { glossary = [], context = "" } = {}) => {
  const terms = glossary.filter(({ source, target }) => isSafe(source) && isSafe(target));
  const response = await fetch(new URL("/v1/chat/completions", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "plamo-3-translate",
      messages: [{ role: "user", content: text }],
      chat_template_kwargs: {
        source_lang: "en",
        target_lang: "ja",
        ...(terms.length ? { glossary: terms } : {}),
        ...(context && isSafe(context) ? { context } : {}),
      },
      temperature: 0,
      max_tokens: 2048,
      stop: STOP,
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const translated = (await response.json())?.choices?.[0]?.message?.content?.trim();
  if (!translated) throw new Error("empty");
  return translated;
};

// PLaMo keeps TeX intact and translates better when it sees the math, so masking is only the fallback.
const translateParagraph = async (translator, paragraph) => {
  const expressions = paragraph.match(TEX_EXPRESSION) ?? [];
  const translated = await translator.translate(paragraph);
  if (expressions.every((expression) => translated.includes(expression))) return translated;
  return translatePreservingTex(translator, paragraph);
};

// glossaryFor picks the glossary entries for a paragraph; context describes what the text is.
export const translateWithPlamo = async (text, { url } = {}, { glossaryFor = () => [], context = "" } = {}) => {
  const baseUrl = url?.trim() || DEFAULT_PLAMO_URL;
  try {
    // One paragraph per request keeps each prompt well inside the server's small context window.
    const paragraphs = [];
    for (const paragraph of text.split("\n\n")) {
      const options = { glossary: glossaryFor(paragraph), context };
      const translator = { translate: (part) => requestTranslation(baseUrl, part, options) };
      paragraphs.push(await translateParagraph(translator, paragraph));
    }
    return { translation: paragraphs.join("\n\n") };
  } catch (error) {
    return {
      error:
        error?.message?.startsWith("HTTP") || error?.message === "empty"
          ? `PLaMoの翻訳エラー（${error.message}）`
          : "PLaMoのサーバーに接続できませんでした（llama-server が起動しているか確認してください）",
    };
  }
};
