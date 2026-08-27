import {
  getSharedHighlighter,
  type DiffsHighlighter,
  type SupportedLanguages,
} from "@pierre/diffs";

import { resolveDiffThemeName } from "./diffRendering";

const highlighterPromiseCache = new Map<string, Promise<DiffsHighlighter>>();

export function getSyntaxHighlighterPromise(language: string): Promise<DiffsHighlighter> {
  const cached = highlighterPromiseCache.get(language);
  if (cached) return cached;

  const promise = getSharedHighlighter({
    themes: [resolveDiffThemeName("dark"), resolveDiffThemeName("light")],
    langs: [language as SupportedLanguages],
    // Только oniguruma (wasm): JS-движок регэкспов уходит в катастрофический
    // бэктрекинг на обычной Go-структуре с выровненными полями — 22 строки
    // токенизируются ~100 секунд и намертво вешают рендер-поток, потому что
    // codeToHtml вызывается синхронно в рендере. На wasm тот же блок — 23 мс
    // с побайтово одинаковым HTML.
    preferredHighlighter: "shiki-wasm",
  }).catch((error) => {
    if (language === "text") {
      highlighterPromiseCache.delete(language);
      // "text" itself failed — Shiki cannot initialize at all, surface the error
      throw error;
    }
    // Language not supported by Shiki — fall back to "text"
    return getSyntaxHighlighterPromise("text");
  });
  highlighterPromiseCache.set(language, promise);
  return promise;
}
