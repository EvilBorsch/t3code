import * as Cause from "effect/Cause";
import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { AsyncResult } from "effect/unstable/reactivity";
import { describe, expect, it, vi } from "vite-plus/test";

import { openWorkspaceInDesktop } from "./openWorkspaceIntent";

const environmentId = EnvironmentId.make("env-1");

describe("openWorkspaceInDesktop", () => {
  it("creates a project and starts a new thread when missing", async () => {
    const createProject = vi.fn(async () => AsyncResult.success(undefined));
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
      createProject,
      handleNewThread,
      expandProject,
    });

    expect(ok).toBe(true);
    expect(createProject).toHaveBeenCalledOnce();
    expect(handleNewThread).toHaveBeenCalledOnce();
    expect(expandProject).toHaveBeenCalledOnce();
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
      createProject,
      handleNewThread,
    });

    expect(ok).toBe(true);
    expect(createProject).not.toHaveBeenCalled();
    expect(handleNewThread).toHaveBeenCalledWith({
      environmentId,
      projectId,
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
      createProject: async () => AsyncResult.failure(Cause.fail(new Error("nope"))),
      handleNewThread: async () => undefined,
      onError,
    });

    expect(ok).toBe(false);
    expect(onError).toHaveBeenCalled();
  });
});
