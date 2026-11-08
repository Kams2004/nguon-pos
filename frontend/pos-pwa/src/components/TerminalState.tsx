import type { TerminalStatus } from "../lib/api/types";
import { useI18n } from "../i18n";
import { Pill } from "./ui";

/** Reachability + who is logged in — two separate facts, shown side by side. */
export function TerminalState({ t: terminal }: { t: TerminalStatus }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {terminal.online ? (
        <Pill tone="success" dot>
          {t("common.online")}
        </Pill>
      ) : (
        <Pill tone="danger" dot>
          {t("common.offline")}
        </Pill>
      )}
      {terminal.loggedIn && terminal.currentUserName && terminal.online ? (
        <Pill tone="info">{t("reports.terminal.connected", { name: terminal.currentUserName })}</Pill>
      ) : terminal.loggedIn && terminal.currentUserName ? (
        // Went offline without logging out (tab closed, network lost): the
        // session is still open on that device, but nobody is "connected" now.
        <Pill tone="warning">{t("reports.terminal.lastUser", { name: terminal.currentUserName })}</Pill>
      ) : (
        <Pill tone="neutral">{t("reports.terminal.noUser")}</Pill>
      )}
    </div>
  );
}
