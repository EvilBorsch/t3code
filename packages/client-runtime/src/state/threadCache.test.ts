import { describe, expect, it } from "@effect/vitest";
import {
  MessageId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  TurnId,
  type OrchestrationThread,
  type OrchestrationThreadDetailSnapshot,
} from "@t3tools/contracts";

import { isReusableThreadDetailCache } from "./threads.ts";

const THREAD_ID = ThreadId.make("thread-cache");

function makeThread(overrides: Partial<OrchestrationThread> = {}): OrchestrationThread {
  return {
    id: THREAD_ID,
    projectId: ProjectId.make("project-1"),
    title: "Cached thread",
    modelSelection: {
      instanceId: ProviderInstanceId.make("codex"),
      model: "gpt-5.4",
    },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: "main",
    worktreePath: null,
    latestTurn: null,
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    deletedAt: null,
    messages: [],
    proposedPlans: [],
    activities: [],
    checkpoints: [],
    session: null,
    ...overrides,
  };
}

function makeSnapshot(thread: OrchestrationThread): OrchestrationThreadDetailSnapshot {
  return { snapshotSequence: 10, thread };
}

describe("isReusableThreadDetailCache", () => {
  it("accepts empty drafts and threads that still include a user message", () => {
    expect(isReusableThreadDetailCache(makeSnapshot(makeThread()))).toBe(true);
    expect(
      isReusableThreadDetailCache(
        makeSnapshot(
          makeThread({
            messages: [
              {
                id: MessageId.make("user-1"),
                role: "user",
                text: "hello",
                turnId: null,
                streaming: false,
                createdAt: "2026-04-01T00:00:00.000Z",
                updatedAt: "2026-04-01T00:00:00.000Z",
              },
              {
                id: MessageId.make("assistant-1"),
                role: "assistant",
                text: "hi",
                turnId: TurnId.make("turn-1"),
                streaming: false,
                createdAt: "2026-04-01T00:00:01.000Z",
                updatedAt: "2026-04-01T00:00:01.000Z",
              },
            ],
          }),
        ),
      ),
    ).toBe(true);
  });

  it("rejects assistant-only caches that would resume past the missing user prompt", () => {
    expect(
      isReusableThreadDetailCache(
        makeSnapshot(
          makeThread({
            messages: [
              {
                id: MessageId.make("assistant-1"),
                role: "assistant",
                text: "Done",
                turnId: TurnId.make("turn-1"),
                streaming: false,
                createdAt: "2026-04-01T00:00:01.000Z",
                updatedAt: "2026-04-01T00:00:01.000Z",
              },
            ],
            latestTurn: {
              turnId: TurnId.make("turn-1"),
              state: "completed",
              requestedAt: "2026-04-01T00:00:00.000Z",
              startedAt: "2026-04-01T00:00:00.000Z",
              completedAt: "2026-04-01T00:00:02.000Z",
              assistantMessageId: MessageId.make("assistant-1"),
            },
          }),
        ),
      ),
    ).toBe(false);
  });
});
