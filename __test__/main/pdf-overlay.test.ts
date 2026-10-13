import { afterEach, expect, test, vi } from "vitest";
import pdf from "../../src/main/core/pdf";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

test("original PDF tab fills the window and honors cache settings without new tabs", async () => {
  // happy-dom cannot navigate extension URLs; use an empty srcdoc for the frame.
  vi.spyOn(HTMLIFrameElement.prototype, "src", "set").mockImplementation(function (value) {
    this.dataset.viewerUrl = value;
    this.srcdoc = "<html></html>";
  });
  vi.spyOn(HTMLIFrameElement.prototype, "src", "get").mockImplementation(function () {
    return this.dataset.viewerUrl ?? "";
  });
  const originalUrl = location.href;
  const sendMessage = vi.fn();
  vi.stubGlobal("chrome", {
    runtime: { getURL: (path: string) => `chrome-extension://${"a".repeat(32)}/${path}`, sendMessage },
  });
  const fetchPdf = vi
    .fn()
    .mockResolvedValue({ status: 200, arrayBuffer: async () => new TextEncoder().encode("%PDF-1.4\n").buffer });
  vi.stubGlobal("fetch", fetchPdf);
  const nativePdf = document.createElement("embed");
  nativePdf.type = "application/pdf";
  document.body.append(nativePdf);
  await pdf.invoke({ persistPdf: true, pdfLinkTarget: "blank" });
  const frame = document.querySelector("iframe");
  if (!frame?.contentWindow) throw new Error("PDF viewer frame was not created");
  expect(frame.src).toContain("viewer.html?embedded=1");
  expect(nativePdf.isConnected).toBe(true);
  expect(location.href).toBe(originalUrl);
  expect(frame.style.top).toBe("0px");
  expect(frame.style.height).toBe("100%");
  expect(sendMessage).toHaveBeenCalledWith(
    {
      type: "open_pdf",
      embedded: true,
      payload: btoa("%PDF-1.4\n"),
      persist: true,
      sourceUrl: originalUrl,
      title: document.title,
    },
    expect.any(Function),
  );
  const transfer = vi.spyOn(frame.contentWindow, "postMessage").mockImplementation(() => {});
  window.dispatchEvent(
    new MessageEvent("message", {
      data: { type: "mouse_dictionary_pdf_ready" },
      origin: "https://evil.example",
      source: frame.contentWindow,
    }),
  );
  expect(transfer).not.toHaveBeenCalled();
  window.dispatchEvent(
    new MessageEvent("message", {
      data: { type: "mouse_dictionary_pdf_ready" },
      origin: `chrome-extension://${"a".repeat(32)}`,
      source: frame.contentWindow,
    }),
  );
  expect(transfer).toHaveBeenCalledWith(
    { type: "mouse_dictionary_pdf_data", payload: btoa("%PDF-1.4\n"), linkTarget: "blank" },
    `chrome-extension://${"a".repeat(32)}`,
  );
  await pdf.invoke({});
  expect(fetchPdf).toHaveBeenCalledTimes(1);
  document.querySelector<HTMLButtonElement>("#mouse-dictionary-pdf-overlay button")?.click();
  expect(document.querySelector("iframe")).toBeNull();
  expect(nativePdf.isConnected).toBe(true);
  sendMessage.mockClear();
  await pdf.invoke({ persistPdf: false });
  expect(sendMessage).not.toHaveBeenCalled();
  document.querySelector<HTMLButtonElement>("#mouse-dictionary-pdf-overlay button")?.click();
});
