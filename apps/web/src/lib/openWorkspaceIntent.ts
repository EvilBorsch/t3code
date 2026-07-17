import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import {
  type AtomCommandResult,
  isAtomCommandInterrupted,
  settlePromise,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import {
  DEFAULT_MODEL,
  type DesktopOpenWorkspaceIntent,
  type EnvironmentId,
  type ProjectId,
  ProviderInstanceId,
  type ScopedProjectRef,
} from "@t3tools/contracts";
import { findProjectByPath, inferProjectTitleFromPath } from "./projectPaths";
import { newProjectId } from "./utils";

export type OpenWorkspaceProject = {
  readonly id: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly workspaceRoot: string;
  readonly deletedAt?: string | null;
};

export async function openWorkspaceInDesktop(input: {
  readonly intent: DesktopOpenWorkspaceIntent;
  readonly environmentId: EnvironmentId;
  readonly projects: readonly OpenWorkspaceProject[];
  readonly createProject: (args: {
    readonly environmentId: EnvironmentId;
    readonly input: {
      readonly projectId: ProjectId;
      readonly title: string;
      readonly workspaceRoot: string;
      readonly createWorkspaceRootIfMissing: boolean;
      readonly defaultModelSelection: {
        readonly instanceId: ReturnType<typeof ProviderInstanceId.make>;
        readonly model: typeof DEFAULT_MODEL;
      };
    };
  }) => Promise<AtomCommandResult<unknown, unknown>>;
  readonly handleNewThread: (projectRef: ScopedProjectRef) => Promise<void>;
  readonly expandProject?: (projectRef: ScopedProjectRef) => void;
  readonly onError?: (title: string, description: string) => void;
}): Promise<boolean> {
  const workspaceRoot = input.intent.workspaceRoot.trim();
  if (workspaceRoot.length === 0) {
    input.onError?.("Failed to open workspace", "Workspace path cannot be empty.");
    return false;
  }

  const existing = findProjectByPath(
    input.projects.filter((project) => project.environmentId === input.environmentId),
    workspaceRoot,
  );

  let projectRef: ScopedProjectRef;
  if (existing) {
    projectRef = scopeProjectRef(existing.environmentId, existing.id);
  } else {
    const projectId = newProjectId();
    const createResult = await input.createProject({
      environmentId: input.environmentId,
      input: {
        projectId,
        title: inferProjectTitleFromPath(workspaceRoot),
        workspaceRoot,
        createWorkspaceRootIfMissing: true,
        defaultModelSelection: {
          instanceId: ProviderInstanceId.make("codex"),
          model: DEFAULT_MODEL,
        },
      },
    });
    if (createResult._tag === "Failure") {
      if (!isAtomCommandInterrupted(createResult)) {
        const error = squashAtomCommandFailure(createResult);
        input.onError?.(
          "Failed to open workspace",
          error instanceof Error ? error.message : "An error occurred.",
        );
      }
      return false;
    }
    projectRef = scopeProjectRef(input.environmentId, projectId);
  }

  input.expandProject?.(projectRef);

  if (input.intent.newThread || !existing) {
    const navigationResult = await settlePromise(() => input.handleNewThread(projectRef));
    if (navigationResult._tag === "Failure") {
      const error = squashAtomCommandFailure(navigationResult);
      input.onError?.(
        "Failed to start a new thread",
        error instanceof Error ? error.message : "An error occurred.",
      );
      return false;
    }
  }

  return true;
}
