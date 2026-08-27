import {
  getSharedHighlighter,
  type DiffsHighlighter,
  type SupportedLanguages,
} from "@pierre/diffs";

import { resolveDiffThemeName } from "./diffRendering";

const highlighterPromiseCache = new Map<string, Promise<DiffsHighlighter>>();

// Только oniguruma (wasm): JS-движок регэкспов уходит в катастрофический
// бэктрекинг на обычной Go-структуре с выровненными полями — 22 строки
// токенизируются ~100 секунд и намертво вешают рендер-поток, потому что
// codeToHtml вызывается синхронно в рендере. На wasm тот же блок — 23 мс
// с побайтово одинаковым HTML.
const SYNTAX_HIGHLIGHTER_ENGINE = "shiki-wasm" as const;

export function getSyntaxHighlighterPromise(language: string): Promise<DiffsHighlighter> {
  const cached = highlighterPromiseCache.get(language);
  if (cached) return cached;

  const promise = getSharedHighlighter({
    themes: [resolveDiffThemeName("dark"), resolveDiffThemeName("light")],
    langs: [language as SupportedLanguages],
    preferredHighlighter: SYNTAX_HIGHLIGHTER_ENGINE,
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

/**
 * `getSharedHighlighter` держит один highlighter на весь документ, и движок
 * регэкспов выбирает первый вызывающий — остальным возвращается уже созданный
 * инстанс, а их `preferredHighlighter` игнорируется. Забираем выбор себе до
 * первого рендера: иначе diff-панель поднимет highlighter на JS-движке и
 * подвесит вместе с собой весь чат.
 */
export function claimSyntaxHighlighterEngine(): void {
  void getSyntaxHighlighterPromise("text");
}
