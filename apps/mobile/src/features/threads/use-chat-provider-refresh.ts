import { useIsFocused } from "@react-navigation/native";
import type { EnvironmentId } from "@t3tools/contracts";
import { useEffect, useRef } from "react";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";

export function useChatProviderRefresh(
  environmentId: EnvironmentId | null,
  chatId: string | null,
  isConnected: boolean,
) {
  const focused = useIsFocused();
  const entry = useRef<{ environmentId: EnvironmentId; chatId: string; refreshed: boolean } | null>(
    null,
  );
  const refreshProviders = useAtomCommand(serverEnvironment.refreshProviders, {
    reportFailure: false,
    reportDefect: false,
  });

  useEffect(() => {
    if (!focused || environmentId === null || chatId === null) {
      entry.current = null;
      return;
    }
    if (entry.current?.environmentId !== environmentId || entry.current.chatId !== chatId) {
      entry.current = { environmentId, chatId, refreshed: false };
    }
    if (!isConnected || entry.current.refreshed) return;
    entry.current.refreshed = true;
    void refreshProviders({ environmentId, input: { refreshModels: true } });
  }, [environmentId, chatId, focused, isConnected, refreshProviders]);
}
