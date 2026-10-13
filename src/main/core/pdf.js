/**
 * Mouse Dictionary (https://github.com/wtetsu/mouse-dictionary/)
 * Copyright 2018-present wtetsu
 * Licensed under MIT
 */

import { convertFromBase64, convertToBase64 } from "../lib/base64";
import ribbon from "../lib/ribbon";
import res from "./resource";

const invoke = async (settings) => {
  if (document.getElementById("mouse-dictionary-pdf-overlay")) return;
  const [updateRibbon, closeRibbon] = ribbon.create();

  updateRibbon(res("downloadingPdf"));

  updateRibbon(res("preparingPdf"));
  let arrayBuffer;
  try {
    if (location.protocol === "file:") {
      arrayBuffer = await fetchLocalPdf();
    } else {
      const response = await fetch(location.href);
      if (response.status !== 200) {
        updateRibbon(await response.text(), [""]);
        return;
      }
      arrayBuffer = await response.arrayBuffer();
    }
  } catch (e) {
    updateRibbon(e.message ?? res("cannotFetchLocalPdf"), [""]);
    return;
  }

  if (!isPdf(arrayBuffer)) {
    updateRibbon(res("nonPdf"), [""]);
    return;
  }

  const payload = convertToBase64(arrayBuffer);
  if (BROWSER === "chrome") {
    showInCurrentTab(payload, settings);
    closeRibbon();
    return;
  }
  sendMessage({
    type: "open_pdf",
    payload,
    persist: settings.persistPdf,
    sourceUrl: location.href,
    title: document.title,
  });

  closeRibbon();
};

const showInCurrentTab = (payload, settings) => {
  const overlay = document.createElement("div");
  overlay.id = "mouse-dictionary-pdf-overlay";
  Object.assign(overlay.style, { position: "fixed", inset: "0", zIndex: "2147483647", background: "#fff" });
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "辞書付きPDFを閉じる";
  Object.assign(close.style, { height: "30px", position: "absolute", top: "0", left: "0" });
  const frame = document.createElement("iframe");
  frame.title = "Mouse Dictionary PDF viewer";
  frame.src = chrome.runtime.getURL("options/pdf/web/viewer.html?embedded=1");
  Object.assign(frame.style, {
    position: "absolute",
    top: "30px",
    left: "0",
    width: "100%",
    height: "calc(100% - 30px)",
    border: "0",
  });
  const viewerOrigin = frame.src.split("/").slice(0, 3).join("/");
  const sendPdf = (event) => {
    if (
      event.source !== frame.contentWindow ||
      event.origin !== viewerOrigin ||
      event.data?.type !== "mouse_dictionary_pdf_ready"
    )
      return;
    window.removeEventListener("message", sendPdf);
    frame.contentWindow.postMessage(
      { type: "mouse_dictionary_pdf_data", payload, linkTarget: settings.pdfLinkTarget },
      viewerOrigin,
    );
  };
  window.addEventListener("message", sendPdf);
  close.addEventListener("click", () => {
    window.removeEventListener("message", sendPdf);
    overlay.remove();
  });
  overlay.append(close, frame);
  document.body.append(overlay);
};

const fetchLocalPdf = async () => {
  try {
    const response = await fetch(location.href);
    if (response.ok || response.status === 0) {
      return response.arrayBuffer();
    }
  } catch {
    // Fall back to the extension background for browsers that block file fetches here.
  }

  const result = await sendMessage({ type: "fetch_local_pdf", url: location.href });
  if (!result?.payload) {
    throw new Error(res("cannotFetchLocalPdf"));
  }
  return convertFromBase64(result.payload);
};

const isPdf = (arrayBuffer) => {
  const first4 = new Uint8Array(arrayBuffer.slice(0, 4));
  return first4[0] === 37 && first4[1] === 80 && first4[2] === 68 && first4[3] === 70;
};

const sendMessage = async (message) => {
  return new Promise((done) => {
    chrome.runtime.sendMessage(message, (response) => {
      done(response);
    });
  });
};

export default { invoke };
