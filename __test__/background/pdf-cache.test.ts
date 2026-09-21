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
