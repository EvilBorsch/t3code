import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { requestSidebarThreadReveal, useRevealActiveThreadRow } from "./Sidebar.logic";

let renderer: ReactTestRenderer | undefined;
let rowKey: string | null;
let scrollTop: number;
let frames: Map<number, FrameRequestCallback>;
let mutations: Set<MutationCallback>;
let nextFrame: number;
let rowHeight: number;
const viewportEvents = new EventTarget();
const viewport = {
  clientHeight: 400,
  get scrollTop() {
    return scrollTop;
  },
  set scrollTop(value: number) {
    scrollTop = value;
  },
  getBoundingClientRect: () => ({ top: 0, bottom: 400 }),
  addEventListener: viewportEvents.addEventListener.bind(viewportEvents),
  removeEventListener: viewportEvents.removeEventListener.bind(viewportEvents),
};
const row = {
  getBoundingClientRect: () =>
    rowHeight === 0
      ? { top: 0, bottom: 0 }
      : { top: 2000 - scrollTop, bottom: 2000 + rowHeight - scrollTop },
  scrollIntoView: () => {
    scrollTop = 1640;
  },
  closest: () => viewport,
};
const content = {
  querySelector: (selector: string) => (rowKey && selector.includes(rowKey) ? row : null),
  closest: () => viewport,
};

function Sidebar({ threadKey }: { threadKey: string | null }) {
  useRevealActiveThreadRow(threadKey);
  return null;
}

async function frame() {
  await act(() => {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback(0));
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("CSS", { escape: (value: string) => value });
  rowKey = null;
  scrollTop = 0;
  nextFrame = 0;
  rowHeight = 40;
  frames = new Map();
  mutations = new Set();
  const target = new EventTarget();
  vi.stubGlobal("window", target);
  vi.stubGlobal("document", {
    querySelector: (selector: string) =>
      selector.includes("sidebar-content") ? content : content.querySelector(selector),
  });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.stubGlobal(
    "MutationObserver",
    class {
      constructor(private callback: MutationCallback) {}
      observe() {
        mutations.add(this.callback);
      }
      disconnect() {
        mutations.delete(this.callback);
      }
    },
  );
});

afterEach(async () => {
  await act(() => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
});

describe("sidebar navigation reveal", () => {
  it("reveals a distant thread when its project rows arrive after navigation", async () => {
    await act(() => {
      renderer = create(<Sidebar threadKey="env:gigavoice" />);
    });
    await frame();
    expect(scrollTop).toBe(0);
    rowKey = "env:gigavoice";
    await act(() => mutations.forEach((callback) => callback([], {} as MutationObserver)));
    await frame();
    expect(row.getBoundingClientRect().bottom).toBeLessThanOrEqual(viewport.clientHeight);
    expect(row.getBoundingClientRect().top).toBeGreaterThanOrEqual(0);
    expect(mutations.size).toBe(0);
  });

  it("cancels a pending reveal when navigation leaves the thread", async () => {
    await act(() => {
      renderer = create(<Sidebar threadKey="env:gigavoice" />);
    });
    await frame();
    await act(() => renderer!.update(<Sidebar threadKey={null} />));
    rowKey = "env:gigavoice";
    await act(() => mutations.forEach((callback) => callback([], {} as MutationObserver)));
    await frame();
    expect(scrollTop).toBe(0);
    expect(mutations.size).toBe(0);
  });
  it("reveals the same search result again after the user scrolls away", async () => {
    rowKey = "env:gigavoice";
    await act(() => {
      renderer = create(<Sidebar threadKey={rowKey} />);
    });
    await frame();
    scrollTop = 0;
    await act(() => requestSidebarThreadReveal("env:gigavoice"));
    await frame();
    expect(row.getBoundingClientRect().bottom).toBeLessThanOrEqual(viewport.clientHeight);
    expect(mutations.size).toBe(0);
  });
  it("waits until a collapsed project row has a layout box", async () => {
    rowKey = "env:gigavoice";
    rowHeight = 0;
    await act(() => {
      renderer = create(<Sidebar threadKey={rowKey} />);
    });
    await frame();
    rowHeight = 40;
    await act(() => mutations.forEach((callback) => callback([], {} as MutationObserver)));
    await frame();
    expect(row.getBoundingClientRect().bottom).toBeLessThanOrEqual(viewport.clientHeight);
  });

  it("lets manual scrolling cancel a pending search reveal", async () => {
    await act(() => {
      renderer = create(<Sidebar threadKey="env:gigavoice" />);
    });
    await frame();
    viewportEvents.dispatchEvent(new Event("wheel"));
    rowKey = "env:gigavoice";
    await act(() => mutations.forEach((callback) => callback([], {} as MutationObserver)));
    await frame();
    expect(scrollTop).toBe(0);
    expect(mutations.size).toBe(0);
  });

  it("ignores a superseded search navigation that finishes after another chat opens", async () => {
    rowKey = "env:current";
    await act(() => {
      renderer = create(<Sidebar threadKey={rowKey} />);
    });
    await frame();
    scrollTop = 0;
    rowKey = "env:gigavoice";
    await act(() => requestSidebarThreadReveal("env:gigavoice"));
    await frame();
    expect(scrollTop).toBe(0);
    expect(mutations.size).toBe(0);
  });
});
