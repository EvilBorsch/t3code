import { getSharedHighlighter } from "@pierre/diffs";
import { expect, it } from "vite-plus/test";

import { resolveDiffThemeName } from "./diffRendering";
import { claimSyntaxHighlighterEngine, PREFERRED_HIGHLIGHTER } from "./syntaxHighlighting";

it("keeps the claimed engine when a later surface asks for the default highlighter", async () => {
  // Порядок как в приложении: стартовый claim, потом поверхность без `preferredHighlighter`,
  // которая сама по себе подняла бы `shiki-js`.
  claimSyntaxHighlighterEngine();
  const highlighter = await getSharedHighlighter({
    themes: [resolveDiffThemeName("dark")],
    langs: ["go"],
  });

  expect(highlighter.name).toBe(PREFERRED_HIGHLIGHTER);
});
