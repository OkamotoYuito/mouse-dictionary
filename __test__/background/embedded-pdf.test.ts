import { afterEach, expect, test, vi } from "vitest";

const cache = vi.hoisted(() => ({
  findByData: vi.fn().mockResolvedValue("existing-pdf"),
  set: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../src/background/pdf-cache", () => ({ default: cache }));

afterEach(() => vi.unstubAllGlobals());

test("embedded PDF saves to the existing cache without opening or queuing another viewer", async () => {
  let receive: (request: unknown, sender: unknown, respond: (result: unknown) => void) => unknown;
  const openOptionsPage = vi.fn();
  const getContexts = vi.fn();
  vi.stubGlobal("chrome", {
    action: { onClicked: { addListener: vi.fn() } },
    commands: { onCommand: { addListener: vi.fn() } },
    runtime: {
      onMessageExternal: { addListener: vi.fn() },
      onMessage: {
        addListener: (listener: typeof receive) => {
          receive = listener;
        },
      },
      openOptionsPage,
      getContexts,
    },
  });
  await import("../../src/background/background");
  const respond = vi.fn();
  receive(
    {
      type: "open_pdf",
      embedded: true,
      payload: "%PDF-data",
      persist: true,
      sourceUrl: "https://example.test/paper.pdf",
      title: "paper",
    },
    {},
    respond,
  );
  await vi.waitFor(() => expect(respond).toHaveBeenCalledWith("existing-pdf"));
  expect(cache.set).toHaveBeenCalledWith("existing-pdf", "%PDF-data", {
    sourceUrl: "https://example.test/paper.pdf",
    title: "paper",
  });
  expect(openOptionsPage).not.toHaveBeenCalled();
  expect(getContexts).not.toHaveBeenCalled();
  const shifted = vi.fn();
  receive({ type: "shift_pdf_id" }, {}, shifted);
  expect(shifted).toHaveBeenCalledWith(null);
});
