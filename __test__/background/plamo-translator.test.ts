import { afterEach, expect, test, vi } from "vitest";
import { translateWithPlamo } from "../../src/background/plamo-translator";

afterEach(() => vi.unstubAllGlobals());

const reply = (content: string) => ({ ok: true, json: async () => ({ choices: [{ message: { content } }] }) });

const sentText = (options: RequestInit) => JSON.parse(String(options.body)).messages[0].content;

test("translates each paragraph with its TeX through the default local server", async () => {
  const fetchMock = vi.fn(async (_url: URL, options: RequestInit) =>
    reply(sentText(options).includes("$M$") ? "質量は$M$です。" : "銀河は回転する。"),
  );
  vi.stubGlobal("fetch", fetchMock);
  expect(await translateWithPlamo("The mass is $M$.\n\nGalaxies rotate.", { url: "" })).toEqual({
    translation: "質量は$M$です。\n\n銀河は回転する。",
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  const [url, options] = fetchMock.mock.calls[0];
  expect(String(url)).toBe("http://127.0.0.1:8080/v1/chat/completions");
  expect(JSON.parse(String(options.body))).toMatchObject({
    messages: [{ role: "user", content: "The mass is $M$." }],
    chat_template_kwargs: { source_lang: "en", target_lang: "ja" },
  });
});

test("masks TeX and retries when the translation alters it", async () => {
  const fetchMock = vi.fn(async (_url: URL, options: RequestInit) =>
    reply(sentText(options).includes("MDTEXTOKEN0END") ? "質量はMDTEXTOKEN0ENDです。" : "質量はMです。"),
  );
  vi.stubGlobal("fetch", fetchMock);
  expect(await translateWithPlamo("The mass is $M$.")).toEqual({ translation: "質量は$M$です。" });
  expect(sentText(fetchMock.mock.calls[1][1])).toBe("The mass is MDTEXTOKEN0END.");
});

test("uses the configured server URL", async () => {
  const fetchMock = vi.fn(async () => reply("こんにちは"));
  vi.stubGlobal("fetch", fetchMock);
  await translateWithPlamo("Hello", { url: " http://localhost:9000 " });
  expect(String(fetchMock.mock.calls[0][0])).toBe("http://localhost:9000/v1/chat/completions");
});

test("reports server and connection errors so the caller can fall back", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: false, status: 500 })),
  );
  expect(await translateWithPlamo("text")).toEqual({ error: "PLaMoの翻訳エラー（HTTP 500）" });

  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }),
  );
  expect((await translateWithPlamo("text")).error).toContain("PLaMoのサーバーに接続できませんでした");
});
