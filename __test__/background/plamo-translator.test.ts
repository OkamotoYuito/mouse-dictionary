import { afterEach, expect, test, vi } from "vitest";
import { translateWithPlamo } from "../../src/background/plamo-translator";

afterEach(() => vi.unstubAllGlobals());

const reply = (content: string) => ({ ok: true, json: async () => ({ choices: [{ message: { content } }] }) });

test("translates each paragraph through the default local server, keeping TeX", async () => {
  const fetchMock = vi.fn(async (_url: URL, options: RequestInit) => {
    const text = JSON.parse(String(options.body)).messages[0].content;
    return reply(text.includes("MDTEXTOKEN0END") ? "質量はMDTEXTOKEN0ENDです。" : "銀河は回転する。");
  });
  vi.stubGlobal("fetch", fetchMock);
  expect(await translateWithPlamo("The mass is $M$.\n\nGalaxies rotate.", { url: "" })).toEqual({
    translation: "質量は$M$です。\n\n銀河は回転する。",
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  const [url, options] = fetchMock.mock.calls[0];
  expect(String(url)).toBe("http://127.0.0.1:8080/v1/chat/completions");
  expect(JSON.parse(String(options.body))).toMatchObject({
    messages: [{ role: "user", content: "The mass is MDTEXTOKEN0END." }],
    chat_template_kwargs: { source_lang: "en", target_lang: "ja" },
  });
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
