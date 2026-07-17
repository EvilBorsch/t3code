import * as NodeOS from "node:os";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { ClaudeSettings } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { beforeEach, vi } from "vite-plus/test";

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
}));

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: queryMock,
}));

import { probeClaudeCapabilities } from "./ClaudeProvider.ts";

const decodeClaudeSettings = Schema.decodeSync(ClaudeSettings);

describe("probeClaudeCapabilities", () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryMock.mockReturnValue({
      initializationResult: () =>
        Promise.resolve({
          account: {
            email: "developer@example.com",
            subscriptionType: "Claude Pro",
          },
          commands: [
            {
              name: "review",
              description: "Review changes",
              argumentHint: "[path]",
            },
          ],
        }),
    });
  });

  it.layer(NodeServices.layer)("Claude Agent SDK", (it) => {
    it.effect("runs the initialization probe outside the server working directory", () =>
      Effect.gen(function* () {
        const capabilities = yield* probeClaudeCapabilities(decodeClaudeSettings({}));
        const invocation = queryMock.mock.calls[0]?.[0] as
          | {
              readonly options?: {
                readonly cwd?: string;
                readonly pathToClaudeCodeExecutable?: string;
              };
            }
          | undefined;

        expect(invocation?.options?.cwd).toBe(NodeOS.tmpdir());
        expect(invocation?.options?.pathToClaudeCodeExecutable).toBe("claude");
        expect(capabilities).toEqual({
          authenticated: true,
          email: "developer@example.com",
          subscriptionType: "Claude Pro",
          tokenSource: undefined,
          slashCommands: [
            {
              name: "review",
              description: "Review changes",
              input: { hint: "[path]" },
            },
          ],
        });
      }),
    );

    it.effect("recognizes a first-party account without credentials as unauthenticated", () =>
      Effect.gen(function* () {
        queryMock.mockReturnValue({
          initializationResult: () =>
            Promise.resolve({
              account: {
                tokenSource: "none",
                apiProvider: "firstParty",
              },
              commands: [{ name: "login", description: "Sign in", argumentHint: "" }],
            }),
        });

        const capabilities = yield* probeClaudeCapabilities(decodeClaudeSettings({}));

        expect(capabilities).toEqual({
          authenticated: false,
          email: undefined,
          subscriptionType: undefined,
          tokenSource: "none",
          slashCommands: [{ name: "login", description: "Sign in" }],
        });
      }),
    );
  });
});
