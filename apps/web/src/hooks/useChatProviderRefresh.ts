import type { EnvironmentId } from "@t3tools/contracts";
import { useEffect, useRef } from "react";
import { serverEnvironment } from "../state/server";
import { useAtomCommand } from "../state/use-atom-command";

export function useChatProviderRefresh(
  environmentId: EnvironmentId,
  chatId: string,
  isConnected: boolean,
) {
  const entry = useRef<{ environmentId: EnvironmentId; chatId: string; refreshed: boolean } | null>(
    null,
  );
  const refreshProviders = useAtomCommand(serverEnvironment.refreshProviders, {
    reportFailure: false,
    reportDefect: false,
  });

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- refreshes the environment's providers once per opened chat after its connection comes up
  useEffect(() => {
    if (entry.current?.environmentId !== environmentId || entry.current.chatId !== chatId) {
      entry.current = { environmentId, chatId, refreshed: false };
    }
    if (!isConnected || entry.current.refreshed) return;
    entry.current.refreshed = true;
    void refreshProviders({ environmentId, input: { refreshModels: true } });
  }, [environmentId, chatId, isConnected, refreshProviders]);
}
