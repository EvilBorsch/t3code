import { MessageId, ThreadId } from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { ProjectionThreadMessageRepository } from "../Services/ProjectionThreadMessages.ts";
import { ProjectionThreadMessageRepositoryLive } from "./ProjectionThreadMessages.ts";
import { SqlitePersistenceMemory } from "./Sqlite.ts";

const layer = it.layer(
  ProjectionThreadMessageRepositoryLive.pipe(Layer.provideMerge(SqlitePersistenceMemory)),
);

layer("ProjectionThreadMessageRepository", (it) => {
  it.effect("searches active threads by Unicode message content", () =>
    Effect.gen(function* () {
      const repository = yield* ProjectionThreadMessageRepository;
      const sql = yield* SqlClient.SqlClient;
      const activeThreadId = ThreadId.make("thread-message-search-active");
      const archivedThreadId = ThreadId.make("thread-message-search-archived");
      const createdAt = "2026-07-22T08:00:00.000Z";

      yield* sql`
        INSERT INTO projection_threads (
          thread_id,
          project_id,
          title,
          model_selection_json,
          runtime_mode,
          interaction_mode,
          branch,
          worktree_path,
          latest_turn_id,
          created_at,
          updated_at,
          deleted_at,
          archived_at
        )
        VALUES
          (
            ${activeThreadId},
            'project-message-search',
            'Active thread',
            '{"instanceId":"codex","model":"gpt-5"}',
            'full-access',
            'default',
            NULL,
            NULL,
            NULL,
            ${createdAt},
            '2026-07-22T08:00:02.000Z',
            NULL,
            NULL
          ),
          (
            ${archivedThreadId},
            'project-message-search',
            'Archived thread',
            '{"instanceId":"codex","model":"gpt-5"}',
            'full-access',
            'default',
            NULL,
            NULL,
            NULL,
            ${createdAt},
            '2026-07-22T08:00:01.000Z',
            NULL,
            '2026-07-22T08:00:03.000Z'
          )
      `;

      yield* repository.upsert({
        messageId: MessageId.make("message-search-active"),
        threadId: activeThreadId,
        turnId: null,
        role: "user",
        text: "Привет из нужного диалога",
        isStreaming: false,
        createdAt,
        updatedAt: createdAt,
      });
      yield* repository.upsert({
        messageId: MessageId.make("message-search-archived"),
        threadId: archivedThreadId,
        turnId: null,
        role: "assistant",
        text: "Привет из архивного диалога",
        isStreaming: false,
        createdAt,
        updatedAt: createdAt,
      });

      const matches = yield* repository.searchThreadIds({ query: "ПРИВЕТ", limit: 20 });

      assert.deepStrictEqual(matches, [activeThreadId]);
    }),
  );

  it.effect("preserves existing attachments when upsert omits attachments", () =>
    Effect.gen(function* () {
      const repository = yield* ProjectionThreadMessageRepository;
      const threadId = ThreadId.make("thread-preserve-attachments");
      const messageId = MessageId.make("message-preserve-attachments");
      const createdAt = "2026-02-28T19:00:00.000Z";
      const updatedAt = "2026-02-28T19:00:01.000Z";
      const persistedAttachments = [
        {
          type: "image" as const,
          id: "thread-preserve-attachments-att-1",
          name: "example.png",
          mimeType: "image/png",
          sizeBytes: 5,
        },
      ];

      yield* repository.upsert({
        messageId,
        threadId,
        turnId: null,
        role: "user",
        text: "initial",
        attachments: persistedAttachments,
        isStreaming: false,
        createdAt,
        updatedAt,
      });

      yield* repository.upsert({
        messageId,
        threadId,
        turnId: null,
        role: "user",
        text: "updated",
        isStreaming: false,
        createdAt,
        updatedAt: "2026-02-28T19:00:02.000Z",
      });

      const rows = yield* repository.listByThreadId({ threadId });
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.text, "updated");
      assert.deepEqual(rows[0]?.attachments, persistedAttachments);

      const rowById = yield* repository.getByMessageId({ messageId });
      assert.equal(rowById._tag, "Some");
      if (rowById._tag === "Some") {
        assert.equal(rowById.value.text, "updated");
        assert.deepEqual(rowById.value.attachments, persistedAttachments);
      }
    }),
  );

  it.effect("allows explicit attachment clearing with an empty array", () =>
    Effect.gen(function* () {
      const repository = yield* ProjectionThreadMessageRepository;
      const threadId = ThreadId.make("thread-clear-attachments");
      const messageId = MessageId.make("message-clear-attachments");
      const createdAt = "2026-02-28T19:10:00.000Z";

      yield* repository.upsert({
        messageId,
        threadId,
        turnId: null,
        role: "assistant",
        text: "with attachment",
        attachments: [
          {
            type: "image",
            id: "thread-clear-attachments-att-1",
            name: "example.png",
            mimeType: "image/png",
            sizeBytes: 5,
          },
        ],
        isStreaming: false,
        createdAt,
        updatedAt: "2026-02-28T19:10:01.000Z",
      });

      yield* repository.upsert({
        messageId,
        threadId,
        turnId: null,
        role: "assistant",
        text: "cleared",
        attachments: [],
        isStreaming: false,
        createdAt,
        updatedAt: "2026-02-28T19:10:02.000Z",
      });

      const rows = yield* repository.listByThreadId({ threadId });
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.text, "cleared");
      assert.deepEqual(rows[0]?.attachments, []);
    }),
  );
});
