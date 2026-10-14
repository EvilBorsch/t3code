import type { DesktopOpenWorkspaceIntent, EnvironmentId } from "@t3tools/contracts";
import { useEffect, useEffectEvent, useRef } from "react";

import { useAtomValue } from "@effect/atom-react";

import { isElectron } from "../env";
import { useNewThreadHandler } from "../hooks/useHandleNewThread";
import { useClientSettings } from "../hooks/useSettings";
import {
  deriveLogicalProjectKeyFromSettings,
  selectProjectGroupingSettings,
} from "../logicalProject";
import { openWorkspaceInDesktop } from "../lib/openWorkspaceIntent";
import { readProject, readProjects, waitForProject } from "../state/entities";
import { primaryServerProvidersAtom } from "../state/server";
import { usePrimaryEnvironment } from "../state/environments";
import { projectEnvironment } from "../state/projects";
import { useAtomCommand } from "../state/use-atom-command";
import { useUiStateStore } from "../uiStateStore";
import { stackedThreadToast, toastManager } from "./ui/toast";

export function DesktopOpenWorkspaceListener() {
  const primaryEnvironment = usePrimaryEnvironment();
  const providers = useAtomValue(primaryServerProvidersAtom);
  const handleNewThread = useNewThreadHandler();
  const createProject = useAtomCommand(projectEnvironment.create, {
    reportFailure: false,
  });
  const projectGroupingSettings = useClientSettings(selectProjectGroupingSettings);
  const inFlightKeyRef = useRef<string | null>(null);
  const environmentId =
    primaryEnvironment?.connection.phase === "connected" ? primaryEnvironment.environmentId : null;

  const openIntent = useEffectEvent(
    (intent: DesktopOpenWorkspaceIntent, targetEnvironmentId: EnvironmentId) =>
      openWorkspaceInDesktop({
        intent,
        environmentId: targetEnvironmentId,
        projects: readProjects(),
        providers,
        createProject,
        waitForProject,
        handleNewThread,
        expandProject: (projectRef) => {
          const project = readProject(projectRef);
          const projectKey = project
            ? deriveLogicalProjectKeyFromSettings(project, projectGroupingSettings)
            : `${projectRef.environmentId}:${projectRef.projectId}`;
          useUiStateStore.getState().setProjectExpanded(projectKey, true);
        },
        onError: (title, description) => {
          toastManager.add(stackedThreadToast({ type: "error", title, description }));
        },
      }),
  );

  useEffect(() => {
    const bridge = isElectron ? window.desktopBridge : undefined;
    if (
      environmentId === null ||
      !bridge?.onOpenWorkspace ||
      !bridge.getPendingOpenWorkspace ||
      !bridge.ackOpenWorkspace
    ) {
      return;
    }

    let cancelled = false;
    // Интент может прийти дважды: событием и через getPendingOpenWorkspace при подписке.
    const handleIntent = async (intent: DesktopOpenWorkspaceIntent) => {
      const key = `${intent.source}:${intent.workspaceRoot}:${intent.newThread ? "1" : "0"}`;
      if (inFlightKeyRef.current === key) {
        return;
      }
      inFlightKeyRef.current = key;
      try {
        await openIntent(intent, environmentId);
        await bridge.ackOpenWorkspace();
      } finally {
        if (inFlightKeyRef.current === key) {
          inFlightKeyRef.current = null;
        }
      }
    };

    const unsubscribe = bridge.onOpenWorkspace((intent) => {
      void handleIntent(intent);
    });
    void bridge.getPendingOpenWorkspace().then((pending) => {
      if (pending && !cancelled) {
        void handleIntent(pending);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [environmentId]);

  return null;
}
