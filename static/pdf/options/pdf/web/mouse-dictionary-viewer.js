/*
 * Mouse Dictionary (https://github.com/wtetsu/mouse-dictionary/)
 * Copyright 2018-present wtetsu
 * Licensed under MIT
 */

import { PDFViewerApplication } from "./viewer.mjs";

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

  const id = new URLSearchParams(location.search).get("id");
  if (!id) return;

  const payload = await getPdfData(id);
  if (typeof payload !== "string") {
    throw new Error("PDF data is no longer available.");
  }

  const data = Uint8Array.from(atob(payload), (character) => character.charCodeAt(0));
  await PDFViewerApplication.open({ data });
};

loadPdf().catch((error) => console.error("Mouse Dictionary PDF viewer:", error));
