import { RegistryContext } from "@effect/atom-react";
import { EnvironmentId } from "@t3tools/contracts";
import { AsyncResult, AtomRegistry } from "effect/unstable/reactivity";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { useChatProviderRefresh } from "./useChatProviderRefresh";

const rpc = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("../state/server", () => ({
  serverEnvironment: {
    refreshProviders: {
      label: "test.refresh-providers",
      run: (_registry: unknown, target: unknown) => rpc.refresh(target),
    },
  },
}));

const environmentId = EnvironmentId.make("remote");
let registry: AtomRegistry.AtomRegistry;
let renderer: ReactTestRenderer | undefined;

function Chat({
  environment = environmentId,
  chatId = "draft-1",
  prompt = "",
  connected = true,
}: {
  environment?: EnvironmentId;
  chatId?: string;
  prompt?: string;
  connected?: boolean;
}) {
  useChatProviderRefresh(environment, chatId, connected);
  return <input value={prompt} />;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  registry = AtomRegistry.make();
  rpc.refresh.mockReset().mockResolvedValue(AsyncResult.success([]));
});

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
  registry.dispose();
  vi.unstubAllGlobals();
});

it("refreshes availability and models once on draft entry without repeating while typing", async () => {
  await act(async () => {
    renderer = create(
      <RegistryContext.Provider value={registry}>
        <Chat />
      </RegistryContext.Provider>,
    );
  });

  expect(rpc.refresh).toHaveBeenCalledExactlyOnceWith({
    environmentId: "remote",
    input: { refreshModels: true },
  });

  await act(async () => {
    renderer!.update(
      <RegistryContext.Provider value={registry}>
        <Chat prompt="Write a test" />
      </RegistryContext.Provider>,
    );
  });
  expect(renderer!.root.findByType("input").props.value).toBe("Write a test");
  expect(rpc.refresh).toHaveBeenCalledTimes(1);
});

it("refreshes each opened chat and targets the new environment when switching hosts", async () => {
  for (const [environment, chatId] of [
    [environmentId, "draft-1"],
    [environmentId, "existing-1"],
    [environmentId, "draft-1"],
    [EnvironmentId.make("another-host"), "draft-1"],
  ] as const) {
    await act(async () => {
      const element = (
        <RegistryContext.Provider value={registry}>
          <Chat environment={environment} chatId={chatId} />
        </RegistryContext.Provider>
      );
      if (renderer) renderer.update(element);
      else renderer = create(element);
    });
  }

  expect(rpc.refresh.mock.calls).toEqual([
    [{ environmentId: "remote", input: { refreshModels: true } }],
    [{ environmentId: "remote", input: { refreshModels: true } }],
    [{ environmentId: "remote", input: { refreshModels: true } }],
    [{ environmentId: "another-host", input: { refreshModels: true } }],
  ]);
});

it("keeps the chat usable after refresh failure and retries when the same chat is reopened", async () => {
  rpc.refresh.mockRejectedValueOnce(new Error("Disconnected"));
  await act(async () => {
    renderer = create(
      <RegistryContext.Provider value={registry}>
        <Chat prompt="Keep this draft" />
      </RegistryContext.Provider>,
    );
  });
  expect(renderer!.root.findByType("input").props.value).toBe("Keep this draft");
  await act(async () => renderer!.update(<></>));
  await act(async () => {
    renderer!.update(
      <RegistryContext.Provider value={registry}>
        <Chat prompt="Keep this draft" />
      </RegistryContext.Provider>,
    );
  });
  expect(rpc.refresh).toHaveBeenCalledTimes(2);
});

it("allows typing while provider discovery is still running", async () => {
  let completeDiscovery!: () => void;
  rpc.refresh.mockReturnValueOnce(
    new Promise((resolve) => {
      completeDiscovery = () => resolve(AsyncResult.success([]));
    }),
  );
  await act(async () => {
    renderer = create(
      <RegistryContext.Provider value={registry}>
        <Chat />
      </RegistryContext.Provider>,
    );
  });
  await act(async () => {
    renderer!.update(
      <RegistryContext.Provider value={registry}>
        <Chat prompt="Do not wait for discovery" />
      </RegistryContext.Provider>,
    );
  });

  expect(renderer!.root.findByType("input").props.value).toBe("Do not wait for discovery");
  expect(rpc.refresh).toHaveBeenCalledTimes(1);
  await act(async () => completeDiscovery());
});

it("waits for a cold connection and refreshes only once during that chat entry", async () => {
  await act(async () => {
    renderer = create(
      <RegistryContext.Provider value={registry}>
        <Chat connected={false} />
      </RegistryContext.Provider>,
    );
  });
  expect(rpc.refresh).not.toHaveBeenCalled();
  for (const connected of [true, false, true]) {
    await act(async () => {
      renderer!.update(
        <RegistryContext.Provider value={registry}>
          <Chat connected={connected} />
        </RegistryContext.Provider>,
      );
    });
  }
  expect(rpc.refresh).toHaveBeenCalledExactlyOnceWith({
    environmentId: "remote",
    input: { refreshModels: true },
  });
});
