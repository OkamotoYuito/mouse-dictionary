/**
 * Mouse Dictionary (https://github.com/wtetsu/mouse-dictionary/)
 * Copyright 2018-present wtetsu
 * Licensed under MIT
 */

export const convertToBase64 = (arrayBuffer) => {
  let result = "";
  const byteArray = new Uint8Array(arrayBuffer);

  for (let i = 0; ; i++) {
    if (i * 1023 >= byteArray.length) {
      break;
    }
    const start = i * 1023;
    const end = (i + 1) * 1023;

    const slice = byteArray.slice(start, end);
    result += btoa(String.fromCharCode(...slice));
  }
  return result;
};

export const convertFromBase64 = (payload) => {
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};
