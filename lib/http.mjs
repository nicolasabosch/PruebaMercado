import { gzipSync } from "node:zlib";
import { withCache } from "./cache.mjs";

const DEFAULT_TIMEOUT_MS = 8000;

export function acceptsGzip(request) {
  return /\bgzip\b/.test(request.headers["accept-encoding"] || "");
}

export function sendJson(request, response, statusCode, body) {
  const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", Vary: "Accept-Encoding" };
  let payload = Buffer.from(JSON.stringify(body));
  if (acceptsGzip(request) && payload.length > 1024) {
    payload = gzipSync(payload);
    headers["Content-Encoding"] = "gzip";
  }
  response.writeHead(statusCode, headers);
  response.end(payload);
}

export function sendText(response, statusCode, text) {
  response.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(text);
}

export async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`Tiempo de espera agotado (${timeoutMs} ms) al consultar ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchRemote(url, responseType, timeoutMs) {
  const response = await fetchWithTimeout(url, {
    headers: {
      accept: responseType === "json" ? "application/json" : "text/html, text/plain;q=0.9, */*;q=0.8",
      "user-agent": "PruebaMercado local dashboard"
    }
  }, timeoutMs);

  if (!response.ok) {
    throw new Error(`Error ${response.status} al consultar ${url}`);
  }

  return responseType === "json" ? await response.json() : await response.text();
}

export function fetchWithCache(url, ttlMs, responseType = "json", timeoutMs = DEFAULT_TIMEOUT_MS, options) {
  return withCache(url, ttlMs, () => fetchRemote(url, responseType, timeoutMs), options);
}
