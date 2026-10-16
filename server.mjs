import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { acceptsGzip, sendJson, sendText } from "./lib/http.mjs";
import { getAuctionPayload } from "./sources/auctions.mjs";
import { getDollarQuotesPayload } from "./sources/dollar.mjs";
import { getMacroPayload } from "./sources/macro.mjs";
import { getCensusPayload } from "./sources/census.mjs";
import { getData912, getLivePayload, isAllowedData912Path } from "./sources/data912.mjs";

const __dirname = resolve(fileURLToPath(new URL(".", import.meta.url)));
const publicDir = join(__dirname, "public");
const port = Number(process.env.PORT || 4173);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

const apiRoutes = {
  "/api/auctions": getAuctionPayload,
  "/api/dollar-quotes": getDollarQuotesPayload,
  "/api/macro": getMacroPayload,
  "/api/census": getCensusPayload
};

async function handleApi(request, requestUrl, response) {
  const route = apiRoutes[requestUrl.pathname];
  if (route) {
    sendJson(request, response, 200, await route());
    return true;
  }

  if (requestUrl.pathname === "/api/live") {
    const keys = (requestUrl.searchParams.get("keys") || "").split(",").filter(Boolean);
    sendJson(request, response, 200, await getLivePayload(keys));
    return true;
  }

  if (requestUrl.pathname.startsWith("/api/data/")) {
    const dataPath = decodeURIComponent(requestUrl.pathname.replace("/api/data/", ""));
    if (!isAllowedData912Path(dataPath)) {
      sendJson(request, response, 400, { error: "Endpoint de Data912 no permitido" });
      return true;
    }

    sendJson(request, response, 200, await getData912(dataPath, requestUrl.search));
    return true;
  }

  return false;
}

// Los estáticos se leen y comprimen una sola vez por versión del archivo (mtime);
// el navegador revalida con ETag y recibe 304 si no cambió.
const staticCache = new Map();

async function loadStaticFile(path) {
  const info = await stat(path);
  if (!info.isFile()) throw new Error("No es un archivo");

  const cached = staticCache.get(path);
  if (cached && cached.mtimeMs === info.mtimeMs) return cached;

  const raw = await readFile(path);
  const type = mimeTypes[extname(path)] || "application/octet-stream";
  const entry = {
    mtimeMs: info.mtimeMs,
    type,
    raw,
    gzip: /^text\/|javascript|json|svg/.test(type) ? gzipSync(raw) : null,
    etag: `"${info.mtimeMs.toString(16)}-${info.size.toString(16)}"`
  };
  staticCache.set(path, entry);
  return entry;
}

async function serveStatic(request, requestUrl, response) {
  const requestedPath = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  const resolvedPath = resolve(publicDir, `.${decodeURIComponent(requestedPath)}`);
  const pathFromPublic = relative(publicDir, resolvedPath);

  if (pathFromPublic.startsWith("..") || resolve(pathFromPublic) === pathFromPublic) {
    sendText(response, 403, "Acceso denegado");
    return;
  }

  try {
    const file = await loadStaticFile(resolvedPath);
    const headers = { "Content-Type": file.type, "Cache-Control": "no-cache", ETag: file.etag, Vary: "Accept-Encoding" };

    if (request.headers["if-none-match"] === file.etag) {
      response.writeHead(304, headers);
      response.end();
      return;
    }

    const useGzip = file.gzip && acceptsGzip(request);
    if (useGzip) headers["Content-Encoding"] = "gzip";
    response.writeHead(200, headers);
    response.end(useGzip ? file.gzip : file.raw);
  } catch {
    sendText(response, 404, "No encontrado");
  }
}

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    const handledApi = await handleApi(request, requestUrl, response);
    if (!handledApi) await serveStatic(request, requestUrl, response);
  } catch (error) {
    sendJson(request, response, 500, { error: error.message || "Error interno" });
  }
});

function warmCaches() {
  // Dispara las fuentes lentas (sobre todo el censo) al arrancar para que la
  // caché ya esté caliente cuando llegue el primer visitante.
  Promise.allSettled([
    getCensusPayload(),
    getAuctionPayload(),
    getDollarQuotesPayload(),
    getMacroPayload()
  ]).catch(() => {});
}

server.listen(port, () => {
  console.log(`Prueba Mercado listo en http://localhost:${port}`);
  warmCaches();
});
