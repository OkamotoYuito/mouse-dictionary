import { beforeEach, expect, test } from "vitest";
import pdfCache from "../../src/background/pdf-cache";
import Chrome from "../main/chrome";

beforeEach(() => {
  global.chrome = new Chrome() as any;
});

test("keeps PDF data after the in-memory background queue is recreated", async () => {
  await pdfCache.set("pdf-1", "base64-data");

  const persistedData = global.chrome.storage.local.data;
  global.chrome = new Chrome() as any;
  global.chrome.storage.local.data = persistedData;

  expect(await pdfCache.get("pdf-1")).toBe("base64-data");
});

test("lists saved PDF metadata and removes entries", async () => {
  await pdfCache.set("pdf-1", "base64-data", {
    sourceUrl: "https://example.com/file.pdf",
    title: "Example PDF",
  });

  expect(await pdfCache.list()).toEqual([
    expect.objectContaining({
      id: "pdf-1",
      sourceUrl: "https://example.com/file.pdf",
      title: "Example PDF",
    }),
  ]);

  await pdfCache.remove("pdf-1");
  expect(await pdfCache.list()).toEqual([]);
});
