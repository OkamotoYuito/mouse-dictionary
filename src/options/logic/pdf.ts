export const setPdfViewerLinkTarget = (target: "self" | "blank" | undefined): void => {
  let preferences = {};
  try {
    preferences = JSON.parse(localStorage.getItem("pdfjs.preferences") ?? "{}") ?? {};
  } catch {
    // Ignore invalid PDF.js preferences and replace them with the selected value.
  }
  localStorage.setItem(
    "pdfjs.preferences",
    JSON.stringify({ ...preferences, externalLinkTarget: target === "self" ? 1 : 2 }),
  );
};

export type PdfCacheEntry = {
  id: string;
  sourceUrl: string;
  title: string;
  createdAt: number;
  lastAccessAt: number;
  expiresAt: number;
};

const sendMessage = <T>(message: unknown): Promise<T> =>
  new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => resolve(response as T));
  });

export const listPdfCache = (): Promise<PdfCacheEntry[]> => sendMessage({ type: "list_pdf_cache" });

export const removePdfCache = (id: string): Promise<boolean> => sendMessage({ type: "remove_pdf_cache", id });

export const clearPdfCache = (): Promise<boolean> => sendMessage({ type: "clear_pdf_cache" });
