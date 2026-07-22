import {
  EventId,
  ProviderDriverKind,
  ThreadId,
  TurnId,
  type ProviderRuntimeEvent,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { runtimeEventToActivities } from "./ProviderRuntimeIngestion.ts";

describe("runtimeEventToActivities model.rerouted", () => {
  it("maps a model reroute into an info work-log activity", () => {
    const event = {
      type: "model.rerouted",
      eventId: EventId.make("evt-model-rerouted"),
      provider: ProviderDriverKind.make("claudeAgent"),
      createdAt: "2026-07-22T00:00:00.000Z",
      threadId: ThreadId.make("thread-1"),
      turnId: TurnId.make("turn-1"),
      payload: {
        fromModel: "claude-fable-5",
        toModel: "claude-opus-4-8",
        reason: "refusal:cyber",
      },
    } satisfies ProviderRuntimeEvent;

    const [activity] = runtimeEventToActivities(event);

    expect(activity?.kind).toBe("model.rerouted");
    expect(activity?.tone).toBe("info");
    expect(activity?.turnId).toBe("turn-1");
    expect(activity?.summary).toBe(
      "Model switched: claude-fable-5 → claude-opus-4-8 (refusal:cyber)",
    );
    expect(activity?.payload).toEqual({
      fromModel: "claude-fable-5",
      toModel: "claude-opus-4-8",
      reason: "refusal:cyber",
    });
  });
});
