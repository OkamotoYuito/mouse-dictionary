import { afterEach, expect, test, vi } from "vitest";
import { MISSING_REGION_MESSAGE, translateWithAzure } from "../../src/background/azure-translator";

afterEach(() => vi.unstubAllGlobals());

test("does nothing without a key", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  expect(await translateWithAzure("text", { key: "", region: "" })).toEqual({});
  expect(await translateWithAzure("text", undefined)).toEqual({});
  expect(fetchMock).not.toHaveBeenCalled();
});

test("translates as HTML with the key and region, keeping TeX", async () => {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => [{ translations: [{ text: '質量は<span class="notranslate">$M$</span>です', to: "ja" }] }],
  }));
  vi.stubGlobal("fetch", fetchMock);
  expect(await translateWithAzure("The mass is $M$.", { key: "test-key", region: "japaneast" })).toEqual({
    translation: "質量は$M$です",
  });
  const [url, options] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
  expect(String(url)).toContain("textType=html");
  expect(options.headers).toMatchObject({
    "Ocp-Apim-Subscription-Key": "test-key",
    "Ocp-Apim-Subscription-Region": "japaneast",
  });
  expect(JSON.parse(String(options.body))).toEqual([{ Text: 'The mass is <span class="notranslate">$M$</span>.' }]);
});

test("reports quota and connection errors so the caller can fall back", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ error: { code: 403001 } }) })),
  );
  expect(await translateWithAzure("text", { key: "k", region: "japaneast" })).toEqual({
    error: "Azureの無料枠を使い切ったか、キーとリージョンが一致しません（403001）",
  });
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  expect(await translateWithAzure("text", { key: "k", region: "japaneast" })).toEqual({
    error: "Azureに接続できませんでした",
  });
});

test("requires the region before calling Azure", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  expect(await translateWithAzure("text", { key: "k", region: " " })).toEqual({ error: MISSING_REGION_MESSAGE });
  expect(await translateWithAzure("text", { key: "k" })).toEqual({ error: MISSING_REGION_MESSAGE });
  expect(fetchMock).not.toHaveBeenCalled();
});

test("accepts region names as shown in the portal", async () => {
  const fetchMock = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ error: { code: 401000 } }) }));
  vi.stubGlobal("fetch", fetchMock);
  expect(await translateWithAzure("text", { key: " k ", region: "Japan East" })).toEqual({
    error: "Azureのキーかリージョンが正しくありません（401000）",
  });
  const options = fetchMock.mock.calls[0][1 as never] as RequestInit;
  expect(options.headers).toMatchObject({
    "Ocp-Apim-Subscription-Key": "k",
    "Ocp-Apim-Subscription-Region": "japaneast",
  });
  await translateWithAzure("text", { key: "k", region: "global" });
  expect((fetchMock.mock.calls[1][1 as never] as RequestInit).headers).not.toHaveProperty(
    "Ocp-Apim-Subscription-Region",
  );
});
