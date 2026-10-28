import type { DesktopOpenWorkspaceIntent, EnvironmentId } from "@t3tools/contracts";
import { useEffect, useEffectEvent, useRef } from "react";

import { useAtomValue } from "@effect/atom-react";

import { isElectron } from "../env";
import { useNewThreadHandler } from "../hooks/useHandleNewThread";
import { useClientSettings } from "../hooks/useSettings";
import { selectProjectGroupingSettings } from "@t3tools/client-runtime/state/project-grouping";
import { openWorkspaceInDesktop } from "../lib/openWorkspaceIntent";
import { buildSidebarProjectSnapshots } from "../sidebarProjectGrouping";
import { readProjects, waitForProject } from "../state/entities";
import { primaryServerProvidersAtom } from "../state/server";
import { usePrimaryEnvironment } from "../state/environments";
import { projectEnvironment } from "../state/projects";
import { useAtomCommand } from "../state/use-atom-command";
import { useUiStateStore } from "../uiStateStore";
import { sidebarFolderExpansionKeys } from "./Sidebar.logic";
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
          // Раскрываем теми же ключами, что проверяет папка сайдбара: иначе сохранённый
          // `false` у папки репозитория или scratch-группы перевесит.
          const group = buildSidebarProjectSnapshots({
            projects: readProjects(),
            settings: projectGroupingSettings,
            groupScratchProjects: true,
            primaryEnvironmentId: targetEnvironmentId,
            resolveEnvironmentLabel: () => null,
          }).find((candidate) =>
            candidate.memberProjectRefs.some(
              (ref) =>
                ref.environmentId === projectRef.environmentId &&
                ref.projectId === projectRef.projectId,
            ),
          );
          useUiStateStore
            .getState()
            .setProjectExpanded(
              group
                ? sidebarFolderExpansionKeys(group)
                : `${projectRef.environmentId}:${projectRef.projectId}`,
              true,
            );
        },
        onError: (title, description) => {
          toastManager.add(stackedThreadToast({ type: "error", title, description }));
        },
      }),
  );

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- подписка на IPC-интенты desktop-моста, пока подключено окружение
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
      await openIntent(intent, environmentId)
        .then(() => bridge.ackOpenWorkspace())
        .finally(() => {
          if (inFlightKeyRef.current === key) {
            inFlightKeyRef.current = null;
          }
        });
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
