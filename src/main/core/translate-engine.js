/**
 * Mouse Dictionary (https://github.com/wtetsu/mouse-dictionary/)
 * Copyright 2018-present wtetsu
 * Licensed under MIT
 */

// English → Japanese translation shared by the dictionary window and the PDF viewer's
// translation tab: the background's PLaMo/Azure first, then Chrome's built-in Translator.

import { prepareText, translatePreservingTex } from "./translation";

const TRANSLATOR_OPTIONS = { sourceLanguage: "en", targetLanguage: "ja" };

const askBackground = (text) =>
  new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: "translate_text", text }, (response) => {
        resolve(chrome.runtime.lastError ? null : response);
      });
    } catch {
      resolve(null);
    }
  });

// Returns translate(text, onStatus), which resolves to
// { translation, engine, note } on success or { error } with a message to show.
export const createTranslateEngine = () => {
  let translatorPromise = null;
  const availability =
    "Translator" in globalThis
      ? globalThis.Translator.availability(TRANSLATOR_OPTIONS).catch(() => null)
      : Promise.resolve(null);

  return async (rawText, onStatus = () => {}) => {
    const text = prepareText(rawText);
    onStatus("翻訳しています…");
    const remote = await askBackground(text);
    if (remote?.translation) {
      return { text, translation: remote.translation, engine: remote.engine ?? "Azure", note: "" };
    }

    const note = remote?.error ? `${remote.error}。内蔵翻訳を使用` : "";
    if (!("Translator" in globalThis)) {
      return { error: `このChromeではTranslator APIを利用できません${note ? `（${note}）` : ""}` };
    }
    onStatus("翻訳モデルを準備しています…");
    if (!translatorPromise) {
      translatorPromise = globalThis.Translator.create({
        ...TRANSLATOR_OPTIONS,
        monitor(monitor) {
          monitor.addEventListener("downloadprogress", (event) => {
            onStatus(`翻訳モデルをダウンロード中… ${Math.round(event.loaded * 100)}%`);
          });
        },
      });
      translatorPromise.catch(() => {
        translatorPromise = null;
      });
    }
    try {
      const translator = await translatorPromise;
      onStatus("翻訳しています…");
      const translation = await translatePreservingTex(translator, text);
      return { text, translation, engine: "Chrome内蔵", note };
    } catch (error) {
      console.error(error);
      if (error?.name === "NotSupportedError") {
        const state = await availability;
        return {
          error:
            state === "unavailable"
              ? "このChromeでは英語→日本語の翻訳モデルを利用できません"
              : `翻訳モデルを作成できませんでした（availability: ${state ?? "不明"}）`,
        };
      }
      return { error: `翻訳できませんでした（${error?.name ?? "エラー"}）` };
    }
  };
};

// The status line shown under a finished translation.
export const engineLabel = ({ engine, note }) =>
  engine === "Chrome内蔵" ? `英語 → 日本語${note ? `（${note}）` : ""}` : `英語 → 日本語（${engine}）`;
