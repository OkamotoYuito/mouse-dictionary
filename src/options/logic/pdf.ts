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
