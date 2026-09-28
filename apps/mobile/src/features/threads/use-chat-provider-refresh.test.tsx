import { RegistryContext } from "@effect/atom-react";
import { EnvironmentId } from "@t3tools/contracts";
import { AsyncResult, AtomRegistry } from "effect/unstable/reactivity";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { useChatProviderRefresh } from "./use-chat-provider-refresh";

const navigation = vi.hoisted(() => ({ focused: true }));
const rpc = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("@react-navigation/native", () => ({
  useIsFocused: () => navigation.focused,
}));
vi.mock("../../state/server", () => ({
  serverEnvironment: {
    refreshProviders: {
      label: "test.refresh-providers",
      run: (_registry: unknown, target: unknown) => rpc.refresh(target),
    },
  },
}));

const environmentId = EnvironmentId.make("phone-host");
let root: Root;
let registry: AtomRegistry.AtomRegistry;

function Chat({
  environment = environmentId,
  chatId = "draft-1",
  connected = true,
}: {
  environment?: EnvironmentId | null;
  chatId?: string | null;
  connected?: boolean;
}) {
  useChatProviderRefresh(environment, chatId, connected);
  return null;
}

beforeEach(() => {
  const document = { nodeType: 9, addEventListener() {}, removeEventListener() {} };
  const container = {
    nodeType: 1,
    tagName: "DIV",
    namespaceURI: "http://www.w3.org/1999/xhtml",
    ownerDocument: document,
    addEventListener() {},
    removeEventListener() {},
  };
  vi.stubGlobal("document", document);
  vi.stubGlobal("window", { document, HTMLIFrameElement: EventTarget });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  registry = AtomRegistry.make();
  root = createRoot(container as unknown as HTMLElement);
  navigation.focused = true;
  rpc.refresh.mockReset().mockResolvedValue(AsyncResult.success([]));
});

afterEach(async () => {
  await act(() => root.unmount());
  registry.dispose();
  vi.unstubAllGlobals();
});

async function render(props: Parameters<typeof Chat>[0] = {}) {
  await act(() =>
    root.render(
      <RegistryContext.Provider value={registry}>
        <Chat {...props} />
      </RegistryContext.Provider>,
    ),
  );
}

it("refreshes on returning to a mounted chat but not on ordinary renders or in the background", async () => {
  await render();
  await render();
  expect(rpc.refresh).toHaveBeenCalledExactlyOnceWith({
    environmentId: "phone-host",
    input: { refreshModels: true },
  });
  navigation.focused = false;
  await render();
  await render({ chatId: "another-chat" });
  expect(rpc.refresh).toHaveBeenCalledTimes(1);
  navigation.focused = true;
  await render({ chatId: "another-chat" });
  expect(rpc.refresh).toHaveBeenCalledTimes(2);
});

it("waits for the environment and draft to be ready without repeating after a later reconnect", async () => {
  await render({ environment: null, chatId: null, connected: false });
  await render({ connected: false });
  expect(rpc.refresh).not.toHaveBeenCalled();
  await render();
  await render({ connected: false });
  await render();
  expect(rpc.refresh).toHaveBeenCalledTimes(1);
});

it("retries a failed refresh on reentry and refreshes a newly selected draft environment", async () => {
  rpc.refresh.mockRejectedValueOnce(new Error("Connection lost"));
  await render();
  navigation.focused = false;
  await render();
  navigation.focused = true;
  await render();
  await render({ environment: EnvironmentId.make("second-host") });
  expect(rpc.refresh).toHaveBeenCalledTimes(3);
  expect(rpc.refresh).toHaveBeenLastCalledWith({
    environmentId: "second-host",
    input: { refreshModels: true },
  });
});
