import * as Cause from "effect/Cause";
import {
  EnvironmentId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
} from "@t3tools/contracts";
import { AsyncResult } from "effect/reactivity";
import { describe, expect, it, vi } from "vite-plus/test";

import { openWorkspaceInDesktop } from "./openWorkspaceIntent";

const environmentId = EnvironmentId.make("env-1");

const provider = (instanceId: string, driver: string, modelSlug: string): ServerProvider => ({
  instanceId: ProviderInstanceId.make(instanceId),
  driver: ProviderDriverKind.make(driver),
  enabled: true,
  installed: true,
  version: null,
  status: "ready",
  auth: { status: "authenticated" },
  checkedAt: "2026-01-01T00:00:00.000Z",
  models: [
    { slug: modelSlug, name: modelSlug, isCustom: false, isDefault: true, capabilities: {} },
  ],
  slashCommands: [],
  skills: [],
});

describe("openWorkspaceInDesktop", () => {
  it("creates a project and starts a new thread when missing", async () => {
    const createProject = vi.fn(async () => AsyncResult.success(undefined));
    const waitForProject = vi.fn(async () => undefined);
    const handleNewThread = vi.fn(async () => undefined);
    const expandProject = vi.fn();

    const ok = await openWorkspaceInDesktop({
      intent: {
        workspaceRoot: "/tmp/brain",
        newThread: true,
        source: "argv",
      },
      environmentId,
      projects: [],
      providers: [],
      createProject,
      waitForProject,
      handleNewThread,
      expandProject,
    });

    expect(ok).toBe(true);
    expect(createProject).toHaveBeenCalledOnce();
    expect(handleNewThread).toHaveBeenCalledOnce();
    expect(expandProject).toHaveBeenCalledOnce();
    // Тред открывается только после того, как созданный проект появился в read model.
    expect(waitForProject.mock.invocationCallOrder[0]).toBeLessThan(
      handleNewThread.mock.invocationCallOrder[0]!,
    );
  });

  it("reuses an existing project and still starts a new thread", async () => {
    const projectId = ProjectId.make("project-1");
    const createProject = vi.fn(async () => AsyncResult.success(undefined));
    const handleNewThread = vi.fn(async () => undefined);

    const ok = await openWorkspaceInDesktop({
      intent: {
        workspaceRoot: "/tmp/brain",
        newThread: true,
        source: "second-instance",
      },
      environmentId,
      projects: [
        {
          id: projectId,
          environmentId,
          workspaceRoot: "/tmp/brain",
          deletedAt: null,
        },
      ],
      providers: [],
      createProject,
      waitForProject: async () => undefined,
      handleNewThread,
    });

    expect(ok).toBe(true);
    expect(createProject).not.toHaveBeenCalled();
    expect(handleNewThread).toHaveBeenCalledWith({
      environmentId,
      projectId,
    });
  });

  it("gives a new project the environment's own default provider, not a hardcoded one", async () => {
    type CreateProjectArgs = Parameters<
      Parameters<typeof openWorkspaceInDesktop>[0]["createProject"]
    >[0];
    let created: CreateProjectArgs | undefined;
    const createProject = async (args: CreateProjectArgs) => {
      created = args;
      return AsyncResult.success(undefined);
    };

    await openWorkspaceInDesktop({
      intent: {
        workspaceRoot: "/tmp/brain",
        newThread: true,
        source: "argv",
      },
      environmentId,
      projects: [],
      providers: [provider("claudeAgent", "claude", "claude-opus-5")],
      createProject,
      waitForProject: async () => undefined,
      handleNewThread: async () => undefined,
    });

    expect(created?.input.defaultModelSelection).toEqual({
      instanceId: ProviderInstanceId.make("claudeAgent"),
      model: "claude-opus-5",
    });
  });

  it("reports create failures", async () => {
    const onError = vi.fn();
    const ok = await openWorkspaceInDesktop({
      intent: {
        workspaceRoot: "/tmp/brain",
        newThread: true,
        source: "argv",
      },
      environmentId,
      projects: [],
      providers: [],
      createProject: async () => AsyncResult.failure(Cause.fail(new Error("nope"))),
      waitForProject: async () => undefined,
      handleNewThread: async () => undefined,
      onError,
    });

    expect(ok).toBe(false);
    expect(onError).toHaveBeenCalled();
  });

  it("does not open a thread when the new project never reaches the read model", async () => {
    const onError = vi.fn();
    const handleNewThread = vi.fn(async () => undefined);
    const ok = await openWorkspaceInDesktop({
      intent: {
        workspaceRoot: "/tmp/brain",
        newThread: true,
        source: "pending-file",
      },
      environmentId,
      projects: [],
      providers: [],
      createProject: async () => AsyncResult.success(undefined),
      waitForProject: async () => {
        throw new Error("The project did not appear in the desktop app.");
      },
      handleNewThread,
      onError,
    });

    expect(ok).toBe(false);
    expect(handleNewThread).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      "Failed to open workspace",
      "The project did not appear in the desktop app.",
    );
  });
});
