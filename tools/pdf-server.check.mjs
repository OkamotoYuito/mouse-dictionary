import assert from "node:assert/strict";
import { request } from "node:http";
import { test } from "node:test";
import { createPdfServer } from "./pdf-server.mjs";

test("loopback PDF transfer, viewer assets, and trust boundaries", async () => {
  const server = createPdfServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const send = (path, method = "GET", body = "", headers = {}) => new Promise((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port: server.address().port, path, method,
      headers: { Host: "127.0.0.1:8765", ...headers } }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString() }));
    });
    req.on("error", reject);
    req.end(body);
  });
  try {
    const headers = { Origin: `chrome-extension://${"a".repeat(32)}`, "Content-Type": "application/pdf" };
    assert.equal((await send("/pdf", "POST", "%PDF-test", { Origin: "https://evil.example" })).status, 403);
    assert.equal((await send("/pdf", "POST", "%PDF-test")).status, 403);
    assert.equal((await send("/pdf", "POST", "not a PDF", headers)).status, 400);
    const saved = await send("/pdf", "POST", "%PDF-test", headers);
    assert.equal(saved.status, 200);
    const id = JSON.parse(saved.text).id;
    assert.equal(JSON.parse((await send("/pdf", "POST", "%PDF-test", headers)).text).id, id);
    assert.equal((await send(`/pdf/${id}`)).text, "%PDF-test");
    assert.equal((await send("/pdf/missing")).status, 404);
    assert.equal((await send(`/pdf/${id}`, "GET", "", { Host: "evil.example" })).status, 403);
    assert.equal((await send(`/pdf/${id}`, "GET", "", { Origin: "https://evil.example" })).status, 403);
    assert.equal((await send("/options/pdf/%2e%2e%2f%2e%2e%2fpackage.json")).status, 403);
    const viewer = await send("/options/pdf/web/viewer.html");
    assert.equal(viewer.status, 200);
    assert.match(viewer.text, /local-pdf-viewer.mjs/);
    assert.doesNotMatch(viewer.text, /mouse-dictionary-viewer.js/);
    assert.match((await send("/local-pdf-viewer.mjs")).headers["content-type"], /javascript/);
    assert.equal((await send("/options/pdf/build/pdf.worker.mjs")).status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
