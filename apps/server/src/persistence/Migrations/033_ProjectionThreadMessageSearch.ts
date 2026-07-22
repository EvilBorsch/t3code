import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE VIRTUAL TABLE IF NOT EXISTS projection_thread_messages_search USING fts5(
      text,
      content='projection_thread_messages',
      content_rowid='rowid',
      tokenize='trigram'
    )
  `;

  yield* sql`
    CREATE TRIGGER IF NOT EXISTS projection_thread_messages_search_insert
    AFTER INSERT ON projection_thread_messages
    BEGIN
      INSERT INTO projection_thread_messages_search(rowid, text)
      VALUES (new.rowid, new.text);
    END
  `;

  yield* sql`
    CREATE TRIGGER IF NOT EXISTS projection_thread_messages_search_delete
    AFTER DELETE ON projection_thread_messages
    BEGIN
      INSERT INTO projection_thread_messages_search(
        projection_thread_messages_search,
        rowid,
        text
      )
      VALUES ('delete', old.rowid, old.text);
    END
  `;

  yield* sql`
    CREATE TRIGGER IF NOT EXISTS projection_thread_messages_search_update
    AFTER UPDATE OF text ON projection_thread_messages
    BEGIN
      INSERT INTO projection_thread_messages_search(
        projection_thread_messages_search,
        rowid,
        text
      )
      VALUES ('delete', old.rowid, old.text);
      INSERT INTO projection_thread_messages_search(rowid, text)
      VALUES (new.rowid, new.text);
    END
  `;

  yield* sql`
    INSERT INTO projection_thread_messages_search(projection_thread_messages_search)
    VALUES ('rebuild')
  `;
});
