import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("033_ProjectionThreadMessageSearch", (it) => {
  it.effect("backfills and maintains the Unicode message search index", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations({ toMigrationInclusive: 32 });
      yield* sql`
        INSERT INTO projection_thread_messages (
          message_id,
          thread_id,
          turn_id,
          role,
          text,
          is_streaming,
          created_at,
          updated_at
        )
        VALUES (
          'message-search-existing',
          'thread-search-existing',
          NULL,
          'user',
          'Привет из существующего сообщения',
          0,
          '2026-07-22T08:00:00.000Z',
          '2026-07-22T08:00:00.000Z'
        )
      `;

      yield* runMigrations({ toMigrationInclusive: 33 });

      const backfilled = yield* sql<{ readonly text: string }>`
        SELECT text
        FROM projection_thread_messages_search
        WHERE projection_thread_messages_search MATCH '"ПРИВЕТ"'
      `;
      assert.deepStrictEqual(backfilled, [{ text: "Привет из существующего сообщения" }]);

      yield* sql`
        UPDATE projection_thread_messages
        SET text = 'Обновлённое содержимое диалога'
        WHERE message_id = 'message-search-existing'
      `;

      const stale = yield* sql<{ readonly text: string }>`
        SELECT text
        FROM projection_thread_messages_search
        WHERE projection_thread_messages_search MATCH '"ПРИВЕТ"'
      `;
      const updated = yield* sql<{ readonly text: string }>`
        SELECT text
        FROM projection_thread_messages_search
        WHERE projection_thread_messages_search MATCH '"ОБНОВЛЁННОЕ"'
      `;
      assert.deepStrictEqual(stale, []);
      assert.deepStrictEqual(updated, [{ text: "Обновлённое содержимое диалога" }]);

      yield* sql`
        DELETE FROM projection_thread_messages
        WHERE message_id = 'message-search-existing'
      `;

      const deleted = yield* sql<{ readonly text: string }>`
        SELECT text
        FROM projection_thread_messages_search
        WHERE projection_thread_messages_search MATCH '"ОБНОВЛЁННОЕ"'
      `;
      assert.deepStrictEqual(deleted, []);
    }),
  );
});
