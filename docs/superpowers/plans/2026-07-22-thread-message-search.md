# Thread Message Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сделать треды доступными в палитре команд по совпадениям не только в заголовке, но и в тексте сообщений.

**Architecture:** Сервер индексирует `projection_thread_messages.text` в FTS5 trigram-таблице и отдаёт scoped-совместимые идентификаторы через новый типизированный unary RPC. Веб-клиент дебаунсит запросы ко всем окружениям и добавляет совпадение по сообщению как дополнительный, более слабый поисковый термин существующего элемента треда.

**Tech Stack:** TypeScript, Effect Schema/RPC/Atom, SQLite FTS5, React, Vite+ Test.

## Global Constraints

- Не загружать полные детали всех тредов ради поиска.
- Поиск по сообщениям начинается с 3 символов, запрос ограничен 256 символами, ответ — 200 тредами.
- Исключать удалённые и архивные треды.
- Сохранять существующее ранжирование заголовка, проекта и ветки выше содержимого сообщения.
- Не выполнять git commit, push, branch, worktree, merge, pull, rebase, stash или PR.

---

### Task 1: Индекс и репозиторий сообщений

**Files:**

- Create: `apps/server/src/persistence/Migrations/033_ProjectionThreadMessageSearch.ts`
- Create: `apps/server/src/persistence/Migrations/033_ProjectionThreadMessageSearch.test.ts`
- Modify: `apps/server/src/persistence/Migrations.ts`
- Modify: `apps/server/src/persistence/Services/ProjectionThreadMessages.ts`
- Modify: `apps/server/src/persistence/Layers/ProjectionThreadMessages.ts`
- Test: `apps/server/src/persistence/Layers/ProjectionThreadMessages.test.ts`

**Interfaces:**

- Produces: `ProjectionThreadMessageRepository.searchThreadIds({ query, limit }): Effect<ReadonlyArray<ThreadId>, ProjectionRepositoryError>`.

- [ ] **Step 1: Write the failing repository test**

```ts
const matches = yield * repository.searchThreadIds({ query: "ПРИВЕТ", limit: 20 });
assert.deepStrictEqual(matches, [threadId]);
```

Добавить строки активного и архивного тредов, сообщение `"Привет из диалога"` и утверждение, что возвращается только активный тред.

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test run apps/server/src/persistence/Layers/ProjectionThreadMessages.test.ts`

Expected: FAIL, потому что `searchThreadIds` ещё отсутствует.

- [ ] **Step 3: Add the FTS migration**

```sql
CREATE VIRTUAL TABLE projection_thread_messages_search USING fts5(
  text,
  content='projection_thread_messages',
  content_rowid='rowid',
  tokenize='trigram'
);
INSERT INTO projection_thread_messages_search(projection_thread_messages_search) VALUES ('rebuild');
```

Добавить `AFTER INSERT`, `AFTER UPDATE` и `AFTER DELETE` триггеры, зарегистрировать миграцию под номером 33 и проверить backfill отдельным миграционным тестом.

- [ ] **Step 4: Implement repository search**

```sql
SELECT DISTINCT messages.thread_id AS "threadId"
FROM projection_thread_messages_search
INNER JOIN projection_thread_messages AS messages
  ON messages.rowid = projection_thread_messages_search.rowid
INNER JOIN projection_threads AS threads
  ON threads.thread_id = messages.thread_id
WHERE projection_thread_messages_search MATCH $phrase
  AND threads.deleted_at IS NULL
  AND threads.archived_at IS NULL
ORDER BY threads.updated_at DESC, threads.thread_id ASC
LIMIT $limit
```

Формировать безопасную FTS-фразу как двойную кавычку, запрос с удвоенными внутренними кавычками и закрывающую кавычку.

- [ ] **Step 5: Run focused persistence tests**

Run: `vp test run apps/server/src/persistence/Migrations/033_ProjectionThreadMessageSearch.test.ts apps/server/src/persistence/Layers/ProjectionThreadMessages.test.ts`

Expected: PASS.

### Task 2: Типизированный RPC поиска

**Files:**

- Modify: `packages/contracts/src/orchestration.ts`
- Modify: `packages/contracts/src/rpc.ts`
- Modify: `packages/client-runtime/src/state/orchestration.ts`
- Modify: `apps/server/src/orchestration/runtimeLayer.ts`
- Modify: `apps/server/src/ws.ts`

**Interfaces:**

- Consumes: `ProjectionThreadMessageRepository.searchThreadIds` из Task 1.
- Produces: `ORCHESTRATION_WS_METHODS.searchThreads`, `OrchestrationSearchThreadsInput`, `OrchestrationSearchThreadsResult`, `orchestrationEnvironment.searchThreads(...)`.

- [ ] **Step 1: Define schemas and RPC**

```ts
export const OrchestrationSearchThreadsInput = Schema.Struct({
  query: TrimmedNonEmptyString.check(Schema.isMinLength(3), Schema.isMaxLength(256)),
  limit: PositiveInt.check(Schema.isLessThanOrEqualTo(200)),
});
export const OrchestrationSearchThreadsResult = Schema.Struct({
  threadIds: Schema.Array(ThreadId),
});
```

Добавить RPC в `WsRpcGroup` с `OrchestrationGetSnapshotError | EnvironmentAuthorizationError`.

- [ ] **Step 2: Wire server handler and authorization**

```ts
[ORCHESTRATION_WS_METHODS.searchThreads]: (input) =>
  observeRpcEffect(
    ORCHESTRATION_WS_METHODS.searchThreads,
    projectionThreadMessages.searchThreadIds(input).pipe(
      Effect.map((threadIds) => ({ threadIds })),
      Effect.mapError((cause) => new OrchestrationGetSnapshotError({ message: "Failed to search threads", cause })),
    ),
    { "rpc.aggregate": "orchestration" },
  )
```

Подключить репозиторий в orchestration infrastructure layer и добавить read-scope в `RPC_REQUIRED_SCOPE`.

- [ ] **Step 3: Expose the client query atom**

```ts
searchThreads: createEnvironmentRpcQueryAtomFamily(runtime, {
  label: "environment-data:orchestration:search-threads",
  tag: ORCHESTRATION_WS_METHODS.searchThreads,
  staleTimeMs: 0,
}),
```

- [ ] **Step 4: Run focused contract/server/client-runtime type checks**

Run: `vp run --filter @t3tools/contracts typecheck`

Run: `vp run --filter @t3tools/client-runtime typecheck`

Run: `vp run --filter t3 typecheck`

Expected: all commands exit 0.

### Task 3: Объединение результатов в палитре команд

**Files:**

- Modify: `apps/web/src/state/queries.ts`
- Modify: `apps/web/src/components/CommandPalette.logic.ts`
- Modify: `apps/web/src/components/CommandPalette.logic.test.ts`
- Modify: `apps/web/src/components/CommandPalette.tsx`

**Interfaces:**

- Consumes: `orchestrationEnvironment.searchThreads` из Task 2.
- Produces: `useThreadMessageSearch(...)` и опциональные `messageMatchThreadKeys`/`messageSearchQuery` для `buildThreadActionItems`.

- [ ] **Step 1: Write the failing palette logic test**

```ts
const messageMatchThreadKeys = new Set([
  scopedThreadKey({
    environmentId: LOCAL_ENVIRONMENT_ID,
    threadId: ThreadId.make("thread-message-match"),
  }),
]);
const items = buildThreadActionItems({
  threads,
  projectTitleById,
  sortOrder: "updated_at",
  icon: null,
  messageMatchThreadKeys,
  messageSearchQuery: "needle",
  runThread: async () => undefined,
});
```

Проверить, что `needle` находит тред с нерелевантным заголовком, а совпадение в заголовке ранжируется выше.

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test run apps/web/src/components/CommandPalette.logic.test.ts`

Expected: FAIL, потому что совпадения сообщений ещё не входят в `searchTerms`.

- [ ] **Step 3: Implement multi-environment search hook**

Дебаунсить нормализованный запрос на 120 ms, создавать query atom для каждого окружения, объединять успешные `threadIds` в `Set<scopedThreadKey>`, не применять данные старого запроса при ожидании нового.

- [ ] **Step 4: Add message matches to thread items**

```ts
searchTerms: [
  thread.title,
  projectTitle ?? "",
  thread.branch ?? "",
  ...(input.messageMatchThreadKeys?.has(scopedThreadKey({
    environmentId: thread.environmentId,
    threadId: thread.id,
  })) ? [input.messageSearchQuery ?? ""] : []),
],
```

Передать результаты `useThreadMessageSearch` из `OpenCommandPaletteDialog`; не запускать поиск в submenu, browse и actions-only режимах.

- [ ] **Step 5: Run the web logic test**

Run: `vp test run apps/web/src/components/CommandPalette.logic.test.ts`

Expected: PASS.

### Task 4: Проверка и UI-сценарий

**Files:**

- Verify all files changed by Tasks 1-3.

- [ ] **Step 1: Format affected files**

Run: `vp fmt <changed-files>`

Expected: exit 0.

- [ ] **Step 2: Run focused tests**

Run: `vp test run apps/server/src/persistence/Migrations/033_ProjectionThreadMessageSearch.test.ts apps/server/src/persistence/Layers/ProjectionThreadMessages.test.ts apps/web/src/components/CommandPalette.logic.test.ts`

Expected: PASS.

- [ ] **Step 3: Run targeted lint and type checks**

Run targeted `vp lint` for changed files and package-level type checks for contracts, client-runtime, server and web.

Expected: exit 0.

- [ ] **Step 4: Verify in an isolated web environment**

Запустить `vp run dev --home-dir <isolated-dir>`, использовать одноразовую pairing URL в контролируемом браузере, создать/засеять два треда с уникальным словом только в сообщении, открыть палитру и убедиться, что запрос показывает правильный тред.

- [ ] **Step 5: Stop all long-running processes**

Остановить dev server и браузерную тестовую сессию; удалять только явно созданную временную директорию.
