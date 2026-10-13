/*
 * Mouse Dictionary (https://github.com/wtetsu/mouse-dictionary/)
 * Copyright 2018-present wtetsu
 * Licensed under MIT
 */

import { PDFViewerApplication, PDFViewerApplicationOptions } from "./viewer.mjs";

PDFViewerApplicationOptions.set("defaultUrl", "");

const params = new URLSearchParams(location.search);
const embeddedData = params.get("embedded") === "1" && window.parent !== window
  ? new Promise((resolve) => {
      const receivePdf = (event) => {
        if (event.source !== window.parent || event.data?.type !== "mouse_dictionary_pdf_data" || typeof event.data.payload !== "string") return;
        window.removeEventListener("message", receivePdf);
        resolve(event.data);
      };
      window.addEventListener("message", receivePdf);
      window.parent.postMessage({ type: "mouse_dictionary_pdf_ready" }, "*");
    })
  : null;

if (embeddedData) {
  const close = document.createElement("button");
  close.id = "mouseDictionaryClose";
  close.className = "toolbarButton";
  close.type = "button";
  close.title = "辞書付きPDFを閉じる";
  close.setAttribute("aria-label", close.title);
  close.addEventListener("click", () => {
    window.parent.postMessage({ type: "mouse_dictionary_pdf_close" }, "*");
  });
  document.getElementById("toolbarViewerRight").append(close);
}

const loadMouseDictionary = () =>
  new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("main.js");
    script.onload = resolve;
    script.onerror = () => reject(new Error("Failed to load Mouse Dictionary."));
    document.head.appendChild(script);
  });

const getPdfData = (id) =>
  new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "get_pdf_data", id }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });

const loadPdf = async () => {
  await PDFViewerApplication.initializedPromise;
  await loadMouseDictionary();

  const id = params.get("id");
  if (!id && !embeddedData) return;

  const embedded = embeddedData ? await embeddedData : null;
  if (embedded) {
    PDFViewerApplication.pdfLinkService.externalLinkTarget = embedded.linkTarget === "self" ? 1 : 2;
  }
  const payload = embedded ? embedded.payload : await getPdfData(id);
  if (typeof payload !== "string") {
    throw new Error("PDF data is no longer available.");
  }

  const data = Uint8Array.from(atob(payload), (character) => character.charCodeAt(0));
  await PDFViewerApplication.open({ data });
};

loadPdf().catch((error) => {
  console.error("Mouse Dictionary PDF viewer:", error);
  alert("PDFを読み込めませんでした。元のPDFタブで辞書を起動し直してください。");
});
