import { RegistryContext } from "@effect/atom-react";
import { EnvironmentId } from "@t3tools/contracts";
import { AsyncResult, AtomRegistry } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";

import { act, render } from "../../test/render";
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
const refreshCall = (environment: string) => ({
  environmentId: environment,
  input: { refreshModels: true },
});

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
  return <input value={prompt} readOnly />;
}

function setup() {
  rpc.refresh.mockReset().mockResolvedValue(AsyncResult.success([]));
  const registry = AtomRegistry.make();
  return {
    chat: (props: Parameters<typeof Chat>[0] = {}) => (
      <RegistryContext.Provider value={registry}>
        <Chat {...props} />
      </RegistryContext.Provider>
    ),
    [Symbol.dispose]: () => registry.dispose(),
  };
}

it("refreshes availability and models once on draft entry without repeating while typing", async () => {
  using env = setup();
  const { chat } = env;
  await using screen = await render(chat(), { router: false });
  expect(rpc.refresh).toHaveBeenCalledExactlyOnceWith(refreshCall("remote"));

  await screen.rerender(chat({ prompt: "Write a test" }));
  expect(rpc.refresh).toHaveBeenCalledTimes(1);
});

it("refreshes each opened chat and targets the new environment when switching hosts", async () => {
  using env = setup();
  const { chat } = env;
  await using screen = await render(chat(), { router: false });
  await screen.rerender(chat({ chatId: "existing-1" }));
  await screen.rerender(chat({ chatId: "draft-1" }));
  await screen.rerender(chat({ environment: EnvironmentId.make("another-host") }));

  expect(rpc.refresh.mock.calls).toEqual([
    [refreshCall("remote")],
    [refreshCall("remote")],
    [refreshCall("remote")],
    [refreshCall("another-host")],
  ]);
});

it("keeps the chat usable after refresh failure and retries when the same chat is reopened", async () => {
  using env = setup();
  const { chat } = env;
  rpc.refresh.mockRejectedValueOnce(new Error("Disconnected"));
  await using screen = await render(chat({ prompt: "Keep this draft" }), { router: false });
  expect(screen.container.querySelector("input")?.value).toBe("Keep this draft");

  await screen.rerender(<></>);
  await screen.rerender(chat({ prompt: "Keep this draft" }));
  expect(rpc.refresh).toHaveBeenCalledTimes(2);
});

it("allows typing while provider discovery is still running", async () => {
  using env = setup();
  const { chat } = env;
  let completeDiscovery!: () => void;
  rpc.refresh.mockReturnValueOnce(
    new Promise((resolve) => {
      completeDiscovery = () => resolve(AsyncResult.success([]));
    }),
  );
  await using screen = await render(chat(), { router: false });
  await screen.rerender(chat({ prompt: "Do not wait for discovery" }));

  expect(screen.container.querySelector("input")?.value).toBe("Do not wait for discovery");
  expect(rpc.refresh).toHaveBeenCalledTimes(1);
  await act(async () => completeDiscovery());
});

it("waits for a cold connection and refreshes only once during that chat entry", async () => {
  using env = setup();
  const { chat } = env;
  await using screen = await render(chat({ connected: false }), { router: false });
  expect(rpc.refresh).not.toHaveBeenCalled();

  for (const connected of [true, false, true]) {
    await screen.rerender(chat({ connected }));
  }
  expect(rpc.refresh).toHaveBeenCalledExactlyOnceWith(refreshCall("remote"));
});
