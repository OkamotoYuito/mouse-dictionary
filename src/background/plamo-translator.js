import { translatePreservingTex } from "../main/core/translation";

export const PLAMO_TRANSLATOR_KEY = "**** plamo translator ****";

export const DEFAULT_PLAMO_URL = "http://127.0.0.1:8080";

const STOP = ["<|plamo:tag|>", "<|plamo:bos|>"];

// PLaMo 3 Translate served by an OpenAI-compatible server such as llama-server, mlx_lm.server or vLLM.
const requestTranslation = async (baseUrl, text) => {
  const response = await fetch(new URL("/v1/chat/completions", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "plamo-3-translate",
      messages: [{ role: "user", content: text }],
      chat_template_kwargs: { source_lang: "en", target_lang: "ja" },
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

export const translateWithPlamo = async (text, { url } = {}) => {
  const baseUrl = url?.trim() || DEFAULT_PLAMO_URL;
  const translator = { translate: (part) => requestTranslation(baseUrl, part) };
  try {
    // One paragraph per request keeps each prompt well inside the server's small context window.
    const paragraphs = [];
    for (const paragraph of text.split("\n\n")) {
      paragraphs.push(await translatePreservingTex(translator, paragraph));
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
