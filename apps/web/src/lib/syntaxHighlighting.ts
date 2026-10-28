import {
  getSharedHighlighter,
  type DiffsHighlighter,
  type HighlighterTypes,
  type SupportedLanguages,
} from "@pierre/diffs";

import { DIFF_THEME_NAMES } from "./diffRendering";

/**
 * Highlights' hand-written WASM lexers tokenize large files 10-40x faster than
 * Shiki and never backtrack like Shiki's JS regex engine. Only one highlighter
 * type can be active per thread, so every creation site must pass this value.
 */
export const PREFERRED_HIGHLIGHTER: HighlighterTypes = "highlights";

const highlighterPromiseCache = new Map<string, Promise<DiffsHighlighter>>();

export function getSyntaxHighlighterPromise(language: string): Promise<DiffsHighlighter> {
  const cached = highlighterPromiseCache.get(language);
  if (cached) return cached;

  const promise = getSharedHighlighter({
    // Both palettes, so switching appearance never needs a new highlighter.
    themes: Object.values(DIFF_THEME_NAMES),
    langs: [language as SupportedLanguages],
    preferredHighlighter: PREFERRED_HIGHLIGHTER,
  }).catch((error) => {
    if (language === "text") {
      highlighterPromiseCache.delete(language);
      throw error;
    }
    return getSyntaxHighlighterPromise("text");
  });
  highlighterPromiseCache.set(language, promise);
  return promise;
}

/**
 * Вызывать до первого рендера: общий highlighter один на документ, и его движок выбирает
 * первый вызывающий. Вызов без `preferredHighlighter` иначе поднимет дефолтный `shiki-js`,
 * чей бэктрекинг подвешивает чат.
 */
export function claimSyntaxHighlighterEngine(): void {
  // Ошибку глотаем: захват движка — это оптимизация, а настоящий отчёт об
  // ошибке придёт от того, кто реально просит подсветку в рендере.
  void getSyntaxHighlighterPromise("text").catch(() => {});
}
