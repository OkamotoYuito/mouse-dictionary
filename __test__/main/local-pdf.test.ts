import { afterEach, expect, test, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

test("localhost viewer starts the existing dictionary and looks up selected PDF text", async () => {
  vi.stubGlobal("location", new URL("http://127.0.0.1:8765/options/pdf/web/viewer.html?file=/pdf/test"));
  vi.stubGlobal("DIALOG_ID", "test-dictionary");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({}) }));
  vi.stubGlobal("chrome", {
    runtime: { getURL: (path: string) => path, onMessage: { addListener: vi.fn() } },
    storage: {
      sync: { get: (_keys: string[], callback: (value: unknown) => void) => callback({}), set: vi.fn() },
      local: {
        get: (_keys: string[], callback: (value: unknown) => void) =>
          callback({ "**** loaded ****": true, astronomy: "天文学" }),
      },
    },
  });
  const text = document.createElement("p");
  text.textContent = "astronomy";
  document.body.append(text);
  await import("../../src/main/local-pdf");
  await vi.dynamicImportSettled();
  const host = document.getElementById("test-dictionary_SH");
  expect(host?.shadowRoot?.getElementById("test-dictionary")).not.toBeNull();
  const range = document.createRange();
  range.selectNodeContents(text);
  window.getSelection()?.addRange(range);
  document.body.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  await expect.poll(() => host?.shadowRoot?.textContent).toContain("天文学");
  window.getSelection()?.removeAllRanges();
});
