/*
 * Mouse Dictionary (https://github.com/wtetsu/mouse-dictionary/)
 * Copyright 2018-present wtetsu
 * Licensed under MIT
 */

import { PDFViewerApplication } from "./viewer.mjs";

const shareButton = document.createElement("button");
shareButton.type = "button";
shareButton.textContent = "Gemini用に開く";
shareButton.disabled = true;
document.getElementById("toolbarViewerRight").prepend(shareButton);
PDFViewerApplication.initializedPromise.then(() => {
  PDFViewerApplication.eventBus.on("documentloaded", () => {
    shareButton.disabled = false;
  });
});
shareButton.addEventListener("click", async () => {
  shareButton.disabled = true;
  try {
    const data = await PDFViewerApplication.pdfDocument.getData();
    const response = await fetch("http://127.0.0.1:8765/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/pdf" },
      body: data,
    });
    if (!response.ok) {
      throw new Error(response.status === 507
        ? "サーバーの保存容量が上限に達しました。npm run pdf-server を再起動してください。"
        : `PDF server: ${response.status}`);
    }
    const { id } = await response.json();
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("Invalid PDF ID");
    const preferences = JSON.parse(localStorage.getItem("pdfjs.preferences") ?? "{}");
    const target = preferences.externalLinkTarget === 1 ? 1 : 2;
    const url = `http://127.0.0.1:8765/options/pdf/web/viewer.html?file=/pdf/${id}&target=${target}`;
    const [existing] = await chrome.tabs.query({ url });
    if (existing) {
      await chrome.tabs.update(existing.id, { active: true });
      await chrome.windows.update(existing.windowId, { focused: true });
    } else {
      await chrome.tabs.create({ url });
    }
  } catch (error) {
    console.error(error);
    alert("Gemini用viewerを開けませんでした。リポジトリで npm run pdf-server を起動してください。\n" + error.message);
  } finally {
    shareButton.disabled = false;
  }
});

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
