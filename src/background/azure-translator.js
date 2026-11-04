import { fromTranslatorHtml, toTranslatorHtml } from "../main/core/translation";

export const AZURE_TRANSLATOR_KEY = "**** azure translator ****";

export const MISSING_REGION_MESSAGE = "Azureのリージョンが未入力です（設定画面に japaneast などを入力してください）";

const ERROR_MESSAGES = {
  401: "Azureのキーかリージョンが正しくありません",
  403: "Azureの無料枠を使い切ったか、キーとリージョンが一致しません",
  429: "Azureへのリクエストが多すぎます",
};

// The portal shows regions like "Japan East", while the API expects "japaneast".
const normalizeRegion = (region = "") => region.toLowerCase().replace(/[\s_-]/g, "");

export const translateWithAzure = async (text, { key, region } = {}) => {
  key = key?.trim();
  region = normalizeRegion(region);
  if (!key) return {};
  // Without the region, regional resources reject even a correct key with 401001.
  if (!region) return { error: MISSING_REGION_MESSAGE };
  const { html, expressions } = toTranslatorHtml(text);
  const url = new URL("https://api.cognitive.microsofttranslator.com/translate");
  url.search = new URLSearchParams({ "api-version": "3.0", from: "en", to: "ja", textType: "html" });
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Ocp-Apim-Subscription-Key": key,
        ...(region !== "global" ? { "Ocp-Apim-Subscription-Region": region } : {}),
      },
      body: JSON.stringify([{ Text: html }]),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      const code = (await response.json().catch(() => null))?.error?.code;
      const message = ERROR_MESSAGES[response.status] ?? "Azureの翻訳エラー";
      return { error: `${message}（${code ?? `HTTP ${response.status}`}）` };
    }
    const result = await response.json();
    const translated = result?.[0]?.translations?.[0]?.text;
    return translated
      ? { translation: fromTranslatorHtml(translated, expressions) }
      : { error: "Azureの応答が空でした" };
  } catch {
    return { error: "Azureに接続できませんでした" };
  }
};
