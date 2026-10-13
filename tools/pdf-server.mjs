import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const toolsDirectory = dirname(fileURLToPath(import.meta.url));
const pdfDirectory = resolve(toolsDirectory, "../static/pdf/options/pdf");
const limit = 100 * 1024 * 1024;
const mimeTypes = {
  ".html": "text/html; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".ftl": "text/plain; charset=utf-8", ".wasm": "application/wasm",
};

export const createPdfServer = () => {
  const documents = new Map();
  let storedBytes = 0;
  return createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    const fail = (code) => response.writeHead(code).end();
    try {
      if (request.headers.host !== "127.0.0.1:8765") return fail(403);
      const origin = request.headers.origin;
      if (origin && origin !== "http://127.0.0.1:8765" && !/^chrome-extension:\/\/[a-p]{32}$/.test(origin)) {
        return fail(403);
      }
      if (origin?.startsWith("chrome-extension://")) response.setHeader("Access-Control-Allow-Origin", origin);
      const path = decodeURIComponent(new URL(request.url, "http://127.0.0.1:8765").pathname);
      if (request.method === "OPTIONS" && path === "/pdf") {
        response.setHeader("Access-Control-Allow-Methods", "POST");
        response.setHeader("Access-Control-Allow-Headers", "Content-Type");
        return response.writeHead(204).end();
      }
      if (request.method === "POST" && path === "/pdf") {
        if (!/^chrome-extension:\/\/[a-p]{32}$/.test(origin ?? "")) return fail(403);
        const chunks = [];
        let size = 0;
        for await (const chunk of request) {
          size += chunk.length;
          if (size > limit) return fail(413);
          chunks.push(chunk);
        }
        const data = Buffer.concat(chunks);
        if (data.subarray(0, 5).toString() !== "%PDF-") return fail(400);
        for (const [id, existing] of documents) {
          if (existing.equals(data)) {
            response.setHeader("Content-Type", "application/json");
            return response.end(JSON.stringify({ id }));
          }
        }
        if (storedBytes + size > 2 * limit) return fail(507);
        const id = randomUUID();
        documents.set(id, data);
        storedBytes += size;
        response.setHeader("Content-Type", "application/json");
        return response.end(JSON.stringify({ id }));
      }
      if (request.method !== "GET") return fail(405);
      if (path.startsWith("/pdf/")) {
        const data = documents.get(path.slice(5));
        if (!data) return fail(404);
        response.setHeader("Content-Type", "application/pdf");
        return response.end(data);
      }
      let file;
      if (path === "/local-pdf-viewer.mjs" || path === "/local-pdf-viewer.css") {
        file = resolve(toolsDirectory, path.slice(1));
      } else {
        if (!path.startsWith("/options/pdf/")) return fail(404);
        file = resolve(pdfDirectory, path.slice("/options/pdf/".length));
        if (!file.startsWith(pdfDirectory + sep)) return fail(403);
      }
      let data = await readFile(file);
      if (path === "/options/pdf/web/viewer.html") {
        data = data.toString()
          .replace('<script src="viewer.mjs" type="module"></script>', "")
          .replace('<script src="mouse-dictionary-viewer.js" type="module"></script>',
            '<link rel="stylesheet" href="/local-pdf-viewer.css"><script src="/local-pdf-viewer.mjs" type="module"></script>');
      }
      response.setHeader("Content-Type", mimeTypes[extname(file)] ?? "application/octet-stream");
      response.end(data);
    } catch (error) {
      if (!response.headersSent) fail(error.code === "ENOENT" ? 404 : 400);
      else response.destroy();
    }
  });
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createPdfServer();
  server.on("error", (error) => {
    console.error("PDF server:", error.message);
    process.exitCode = 1;
  });
  server.listen(8765, "127.0.0.1", () => console.log("PDF viewer server: http://127.0.0.1:8765 (Ctrl+Cで終了)"));
}
