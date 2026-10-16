export function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, code) => String.fromCharCode(Number.parseInt(code, 10)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function textFromHtml(html) {
  return decodeHtmlEntities(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseSpanishMoney(value) {
  const cleaned = String(value || "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? numeric : null;
}

export function parseWholeNumber(value) {
  const numeric = Number(String(value || "").replace(/[^\d-]/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}
