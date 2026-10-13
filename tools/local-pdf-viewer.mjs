const preferences = JSON.parse(localStorage.getItem("pdfjs.preferences") ?? "{}");
preferences.externalLinkTarget = new URLSearchParams(location.search).get("target") === "1" ? 1 : 2;
localStorage.setItem("pdfjs.preferences", JSON.stringify(preferences));

const { PDFViewerApplication } = await import("/options/pdf/web/viewer.mjs");
await PDFViewerApplication.initializedPromise;

const article = document.createElement("main");
article.id = "pdfFullText";
article.setAttribute("aria-label", "PDF本文（全ページ）");
const heading = document.createElement("h1");
heading.textContent = "PDF本文（全ページ）";
article.append(heading);
document.body.append(article);
const status = document.createElement("p");
status.textContent = "本文を抽出中…";
article.append(status);

let currentDocument;
const showText = async () => {
  const pdf = PDFViewerApplication.pdfDocument;
  if (!pdf || pdf === currentDocument) return;
  currentDocument = pdf;
  article.replaceChildren(heading, status);
  status.textContent = "本文を抽出中…";
  let hasText = false;
  try {
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      if (pdf !== currentDocument) return;
      const section = document.createElement("section");
      const title = document.createElement("h2");
      title.textContent = `ページ ${number}`;
      const text = document.createElement("p");
      text.textContent = content.items
        .filter((item) => typeof item.str === "string")
        .map((item) => item.str + (item.hasEOL ? "\n" : " "))
        .join("");
      hasText ||= text.textContent.trim().length > 0;
      section.append(title, text);
      article.append(section);
      status.textContent = `${number} / ${pdf.numPages} ページを抽出済み`;
    }
    status.textContent = hasText
      ? "全ページを抽出済み。このタブをGeminiに共有してください。"
      : "文字データのないPDFです。Geminiへ元のPDFを添付してください。";
  } catch (error) {
    status.textContent = "本文の抽出に失敗しました。PDFを開き直してください。";
    console.error(error);
  }
};
PDFViewerApplication.eventBus.on("documentloaded", showText);
showText();
