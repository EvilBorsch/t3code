import { getSharedHighlighter } from "@pierre/diffs";
import { expect, it } from "vite-plus/test";

import { resolveDiffThemeName } from "./diffRendering";
import { claimSyntaxHighlighterEngine, getSyntaxHighlighterPromise } from "./syntaxHighlighting";

// Обычная Go-структура с выровненными пробелами полями: на JS-движке регэкспов
// её токенизация уходит в катастрофический бэктрекинг (~100 секунд на 22
// строки) и намертво вешает рендер-поток, потому что codeToHtml вызывается
// синхронно в рендере. На oniguruma тот же блок — десятки миллисекунд.
const PATHOLOGICAL_GO_SNIPPET = `func New(cfg Config) (agent.Agent, error)

type Config struct {
    Name                  string                 // уникальное имя; не может быть "user"
    Description           string                 // одна строка, используется при делегировании
    Model                 model.LLM              // модель
    Instruction           string                 // системный промпт
    InstructionProvider   InstructionProvider    // приоритетнее Instruction
    GlobalInstruction     string
    Tools                 []tool.Tool
    SubAgents             []agent.Agent
    GenerateContentConfig *genai.GenerateContentConfig

    BeforeAgentCallbacks  []agent.BeforeAgentCallback
    AfterAgentCallbacks   []agent.AfterAgentCallback
    BeforeModelCallbacks  []BeforeModelCallback
    AfterModelCallbacks   []AfterModelCallback
    OnModelErrorCallbacks []OnModelErrorCallback
    BeforeToolCallbacks   []BeforeToolCallback
    AfterToolCallbacks    []AfterToolCallback
}
`;

it(
  "highlights aligned Go struct fields without catastrophic backtracking",
  { timeout: 60_000 },
  async () => {
    // Порядок повторяет реальный: сначала стартовый claim, и только потом
    // diff-поверхность просит highlighter с дефолтным движком. Highlighter в
    // @pierre/diffs один на документ, поэтому второй вызов обязан получить уже
    // выбранный oniguruma — иначе чат опять встанет на минуту.
    claimSyntaxHighlighterEngine();
    await getSyntaxHighlighterPromise("go");
    const highlighter = await getSharedHighlighter({
      themes: [resolveDiffThemeName("dark")],
      langs: ["go"],
    });

    const startedAt = performance.now();
    const html = highlighter.codeToHtml(PATHOLOGICAL_GO_SNIPPET, {
      lang: "go",
      theme: resolveDiffThemeName("dark"),
    });
    const elapsedMs = performance.now() - startedAt;

    expect(html).toContain("Config");
    expect(elapsedMs).toBeLessThan(5_000);
  },
);
