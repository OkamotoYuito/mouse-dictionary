/**
 * Mouse Dictionary (https://github.com/wtetsu/mouse-dictionary/)
 * Copyright 2018-present wtetsu
 * Licensed under MIT
 */

import { convertToBase64 } from "../main/lib/base64";
import pdfCache from "./pdf-cache";
import ExpiringQueue from "./queue";
import generateUniqueId from "./unique";

if (BROWSER === "chrome") {
  chrome.action.onClicked.addListener((tab) => {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["main.js"],
    });
  });
} else {
  chrome.browserAction.onClicked.addListener(() => {
    chrome.tabs.executeScript({
      file: "./main.js",
    });
  });
}

// cross-extension messaging
chrome.runtime.onMessageExternal.addListener((message) => {
  sendToActiveTab((tabId) => {
    chrome.tabs.sendMessage(tabId, { message: message });
  });
});

// Shortcut key handling
chrome.commands.onCommand.addListener((command) => {
  switch (command) {
    case "scroll_up":
      sendToActiveTab((tabId) => chrome.tabs.sendMessage(tabId, { message: { type: "scroll_up" } }));
      break;
    case "scroll_down":
      sendToActiveTab((tabId) => chrome.tabs.sendMessage(tabId, { message: { type: "scroll_down" } }));
      break;
    case "activate_extension":
      // Workaround for Vivaldi (see #84)
      sendToActiveTab((tabId) =>
        chrome.scripting.executeScript({
          target: { tabId },
          files: ["main.js"],
        }),
      );
      break;
  }
});

// PDF handling
const queue = new ExpiringQueue(1000 * 30);
const PDF_CACHE_CLEANUP_ALARM = "pdf-cache-cleanup";

const getPdfViewerUrl = (id) => chrome.runtime.getURL(`options/pdf/web/viewer.html?id=${encodeURIComponent(id)}`);

const focusExistingPdfViewer = async (id) => {
  if (typeof chrome.runtime.getContexts !== "function") {
    return false;
  }

  let contexts;
  try {
    contexts = await chrome.runtime.getContexts({
      contextTypes: ["TAB"],
    });
  } catch {
    return false;
  }

  const viewerUrl = getPdfViewerUrl(id);
  const context = contexts.find(({ documentUrl, tabId }) => tabId >= 0 && documentUrl?.startsWith(viewerUrl));
  if (!context) {
    return false;
  }

  try {
    await chrome.tabs.update(context.tabId, { active: true });
  } catch {
    return false;
  }
  try {
    await chrome.windows?.update(context.windowId, { focused: true });
  } catch {
    // Activating the tab is enough when focusing its window is unavailable.
  }
  return true;
};

const openPdf = async (request, sendResponse) => {
  let id = queue.findId(request.payload);
  if (!id) {
    try {
      id = await pdfCache.findByData(request.payload);
    } catch {
      id = null;
    }
  }
  id ??= generateUniqueId();

  queue.push(id, request.payload);
  const persist =
    request.persist === true
      ? pdfCache.set(id, request.payload, { sourceUrl: request.sourceUrl, title: request.title }).catch(console.error)
      : Promise.resolve();
  await persist;

  if (await focusExistingPdfViewer(id)) {
    sendResponse();
    return;
  }

  chrome.runtime.sendMessage({ type: "prepare_pdf" });
  chrome.runtime.openOptionsPage(() => {
    sendResponse();
  });
};

chrome.alarms?.create(PDF_CACHE_CLEANUP_ALARM, { periodInMinutes: 24 * 60 });
chrome.alarms?.onAlarm.addListener((alarm) => {
  if (alarm.name === PDF_CACHE_CLEANUP_ALARM) {
    pdfCache.cleanup().catch(console.error);
  }
});

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  switch (request?.type) {
    case "open_pdf": {
      openPdf(request, sendResponse).catch(() => sendResponse());
      return true;
    }
    case "fetch_local_pdf": {
      if (typeof request.url !== "string" || !request.url.startsWith("file://")) {
        sendResponse(null);
        break;
      }
      fetch(request.url)
        .then(async (response) => {
          if (!response.ok && response.status !== 0) {
            return null;
          }
          return { payload: convertToBase64(await response.arrayBuffer()) };
        })
        .then(sendResponse)
        .catch(() => sendResponse(null));
      return true;
    }
    case "list_pdf_cache":
      pdfCache
        .list()
        .then(sendResponse)
        .catch(() => sendResponse([]));
      return true;
    case "remove_pdf_cache":
      pdfCache
        .remove(request.id)
        .then(() => sendResponse(true))
        .catch(() => sendResponse(false));
      return true;
    case "clear_pdf_cache":
      pdfCache
        .clear()
        .then(() => sendResponse(true))
        .catch(() => sendResponse(false));
      return true;
    case "shift_pdf_id": {
      const frontId = queue.shiftId();
      sendResponse(frontId);
      break;
    }
    case "get_pdf_data": {
      const pdfData = queue.get(request.id);
      if (pdfData !== null) {
        sendResponse(pdfData);
        break;
      }
      pdfCache
        .get(request.id)
        .then(sendResponse)
        .catch(() => sendResponse(null));
      return true;
    }
  }
});

const sendToActiveTab = (callback) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    for (let i = 0; i < tabs.length; i++) {
      callback(tabs[i].id);
    }
  });
};
