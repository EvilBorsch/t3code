import type { DesktopOpenWorkspaceIntent } from "@t3tools/contracts";
import { useEffect, useRef } from "react";

import { isElectron } from "../env";
import { useNewThreadHandler } from "../hooks/useHandleNewThread";
import { useClientSettings } from "../hooks/useSettings";
import {
  deriveLogicalProjectKeyFromSettings,
  selectProjectGroupingSettings,
} from "../logicalProject";
import { openWorkspaceInDesktop } from "../lib/openWorkspaceIntent";
import { useProjects } from "../state/entities";
import { usePrimaryEnvironment } from "../state/environments";
import { projectEnvironment } from "../state/projects";
import { useAtomCommand } from "../state/use-atom-command";
import { useUiStateStore } from "../uiStateStore";
import { stackedThreadToast, toastManager } from "./ui/toast";

export function DesktopOpenWorkspaceListener() {
  const primaryEnvironment = usePrimaryEnvironment();
  const projects = useProjects();
  const handleNewThread = useNewThreadHandler();
  const createProject = useAtomCommand(projectEnvironment.create, {
    reportFailure: false,
  });
  const projectGroupingSettings = useClientSettings(selectProjectGroupingSettings);
  const projectsRef = useRef(projects);
  const primaryEnvironmentRef = useRef(primaryEnvironment);
  const handleNewThreadRef = useRef(handleNewThread);
  const createProjectRef = useRef(createProject);
  const projectGroupingSettingsRef = useRef(projectGroupingSettings);
  const inFlightKeyRef = useRef<string | null>(null);

  projectsRef.current = projects;
  primaryEnvironmentRef.current = primaryEnvironment;
  handleNewThreadRef.current = handleNewThread;
  createProjectRef.current = createProject;
  projectGroupingSettingsRef.current = projectGroupingSettings;

  useEffect(() => {
    if (!isElectron) {
      return;
    }
    const bridge = window.desktopBridge;
    if (!bridge?.onOpenWorkspace || !bridge.getPendingOpenWorkspace || !bridge.ackOpenWorkspace) {
      return;
    }

    let cancelled = false;

    const intentKey = (intent: DesktopOpenWorkspaceIntent) =>
      `${intent.source}:${intent.workspaceRoot}:${intent.newThread ? "1" : "0"}`;

    const handleIntent = async (intent: DesktopOpenWorkspaceIntent) => {
      const key = intentKey(intent);
      if (inFlightKeyRef.current === key) {
        return;
      }

      const waitForEnvironment = async () => {
        for (let attempt = 0; attempt < 40; attempt += 1) {
          if (cancelled) return null;
          const environment = primaryEnvironmentRef.current;
          if (environment) return environment;
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        return null;
      };

      const environment = await waitForEnvironment();
      if (!environment || cancelled) {
        return;
      }

      inFlightKeyRef.current = key;
      try {
        await openWorkspaceInDesktop({
          intent,
          environmentId: environment.environmentId,
          projects: projectsRef.current,
          createProject: createProjectRef.current,
          handleNewThread: handleNewThreadRef.current,
          expandProject: (projectRef) => {
            const project = projectsRef.current.find(
              (candidate) =>
                candidate.id === projectRef.projectId &&
                candidate.environmentId === projectRef.environmentId,
            );
            const projectKey = project
              ? deriveLogicalProjectKeyFromSettings(project, projectGroupingSettingsRef.current)
              : `${projectRef.environmentId}:${projectRef.projectId}`;
            useUiStateStore.getState().setProjectExpanded(projectKey, true);
          },
          onError: (title, description) => {
            toastManager.add(
              stackedThreadToast({
                type: "error",
                title,
                description,
              }),
            );
          },
        });
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
      unsubscribe?.();
    };
  }, []);

  return null;
}
