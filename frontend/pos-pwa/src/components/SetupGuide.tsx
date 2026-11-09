import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, DoorOpen, MonitorSmartphone, Ticket, Users, type LucideIcon } from "lucide-react";
import { useI18n, type MessageKey } from "../i18n";
import { Modal } from "./ui";

export type GuideStep = "gates" | "ticketTypes" | "users" | "devices";

const STEPS: { id: GuideStep; to: string; icon: LucideIcon }[] = [
  { id: "gates", to: "/admin/gates", icon: DoorOpen },
  { id: "ticketTypes", to: "/admin/ticket-types", icon: Ticket },
  { id: "users", to: "/admin/users", icon: Users },
  { id: "devices", to: "/admin/gates", icon: MonitorSmartphone },
];

const CHANGES = ["price", "newCashier", "disable", "move", "void", "revoke"] as const;

/** "Guide" button for the pages that set up gates, tickets, users and tills; `here` highlights this page's step. */
export function GuideButton({ here }: { here: GuideStep }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-outline">
        <BookOpen className="h-4 w-4" /> {t("guide.button")}
      </button>
      {open && <SetupGuide here={here} onClose={() => setOpen(false)} />}
    </>
  );
}

function SetupGuide({ here, onClose }: { here: GuideStep; onClose: () => void }) {
  const { t } = useI18n();
  const body = (id: GuideStep) => {
    if (id === "users") {
      return (
        <>
          <p>{t("guide.users.body")}</p>
          <ul className="mt-1.5 space-y-1">
            {(["cashier", "coordinator", "admin"] as const).map((r) => (
              <li key={r} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-secondary" />
                {t(`guide.users.${r}`)}
              </li>
            ))}
          </ul>
        </>
      );
    }
    if (id === "devices") {
      return (
        <ol className="list-decimal space-y-1 pl-4">
          <li>{t("guide.devices.body1")}</li>
          <li>{t("guide.devices.body2")}</li>
          <li>{t("guide.devices.body3")}</li>
        </ol>
      );
    }
    return <p>{t(`guide.${id}.body` as MessageKey)}</p>;
  };

  return (
    <Modal title={t("guide.title")} onClose={onClose} size="xl">
      <div className="space-y-6 text-sm">
        <p className="text-muted-foreground">{t("guide.intro")}</p>

        <ol className="grid gap-3 md:grid-cols-2">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const current = s.id === here;
            return (
              <li
                key={s.id}
                className={`rounded-2xl border p-4 ${current ? "border-secondary bg-blue-50/60 ring-2 ring-secondary/20" : "border-border bg-card"}`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${current ? "bg-secondary text-white" : "bg-royal/10 text-royal"}`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold text-muted-foreground">
                      {t("guide.step", { n: i + 1 })} · {t(`guide.${s.id}.where` as MessageKey)}
                    </p>
                    <p className="font-display font-bold text-foreground">{t(`guide.${s.id}.title` as MessageKey)}</p>
                  </div>
                  {current ? (
                    <span className="rounded-md bg-secondary px-2 py-0.5 text-[11px] font-bold text-white">{t("guide.youAreHere")}</span>
                  ) : (
                    <Link to={s.to} onClick={onClose} className="btn-outline px-2.5 py-1 text-xs">
                      {t("guide.open")} <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </div>
                <div className="mt-3 text-muted-foreground">{body(s.id)}</div>
              </li>
            );
          })}
        </ol>

        <p className="rounded-xl bg-emerald-50 px-4 py-3 font-semibold text-emerald-800">{t("guide.result")}</p>

        <div>
          <h3 className="mb-2 font-display font-bold text-foreground">{t("guide.changes.title")}</h3>
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th w-2/5">{t("guide.changes.action")}</th>
                  <th className="th">{t("guide.changes.effect")}</th>
                </tr>
              </thead>
              <tbody>
                {CHANGES.map((c) => (
                  <tr key={c} className="border-t border-border/60 align-top">
                    <td className="px-4 py-2.5 font-semibold text-foreground">{t(`guide.changes.${c}`)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{t(`guide.changes.${c}Effect`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h3 className="mb-2 font-display font-bold text-foreground">{t("guide.rules.title")}</h3>
          <ul className="space-y-2 text-muted-foreground">
            {(["moveTill", "severalTills", "browserTills"] as const).map((r) => (
              <li key={r} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
                {t(`guide.rules.${r}`)}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Modal>
  );
}
