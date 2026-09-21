/**
 * Mouse Dictionary (https://github.com/wtetsu/mouse-dictionary/)
 * Copyright 2018-present wtetsu
 * Licensed under MIT
 */

import { convertFromBase64, convertToBase64 } from "../lib/base64";
import ribbon from "../lib/ribbon";
import res from "./resource";

const invoke = async (settings) => {
  const [updateRibbon, closeRibbon] = ribbon.create();

  updateRibbon(res("downloadingPdf"));

  updateRibbon(res("preparingPdf"));
  let arrayBuffer;
  try {
    if (location.protocol === "file:") {
      const result = await sendMessage({ type: "fetch_local_pdf", url: location.href });
      if (!result?.payload) {
        throw new Error(res("cannotFetchLocalPdf"));
      }
      arrayBuffer = convertFromBase64(result.payload);
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
  sendMessage({
    type: "open_pdf",
    payload,
    persist: settings.persistPdf,
    sourceUrl: location.href,
    title: document.title,
  });

  closeRibbon();
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
