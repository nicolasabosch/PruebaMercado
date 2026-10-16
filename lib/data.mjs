import { readFileSync } from "node:fs";

export function loadData(name) {
  return JSON.parse(readFileSync(new URL(`../data/${name}`, import.meta.url), "utf8"));
}
