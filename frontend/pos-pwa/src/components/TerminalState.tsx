import type { TerminalStatus } from "../lib/api/types";
import { Pill } from "./ui";

/** Reachability + who is logged in — two separate facts, shown side by side. */
export function TerminalState({ t }: { t: TerminalStatus }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {t.online ? (
        <Pill tone="success" dot>
          En ligne
        </Pill>
      ) : (
        <Pill tone="danger" dot>
          Hors-ligne
        </Pill>
      )}
      {t.loggedIn && t.currentUserName && t.online ? (
        <Pill tone="info">Connecté : {t.currentUserName}</Pill>
      ) : t.loggedIn && t.currentUserName ? (
        // Went offline without logging out (tab closed, network lost): the
        // session is still open on that device, but nobody is "connected" now.
        <Pill tone="warning">Dernier utilisateur : {t.currentUserName} (session non fermée)</Pill>
      ) : (
        <Pill tone="neutral">Aucun utilisateur</Pill>
      )}
    </div>
  );
}
