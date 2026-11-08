import {
  Accessibility,
  Award,
  Baby,
  Backpack,
  Beer,
  Briefcase,
  Bus,
  Camera,
  Car,
  Coffee,
  Crown,
  Drama,
  Gem,
  Gift,
  GraduationCap,
  Heart,
  Landmark,
  Mic,
  Music,
  Palette,
  PartyPopper,
  Popcorn,
  Shirt,
  Sparkles,
  Star,
  Tent,
  Ticket,
  Trophy,
  Users,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import { translate, type MessageKey } from "../i18n";

/** An icon whose label is read at use time, in the current language. */
const iconEntry = (icon: LucideIcon, key: MessageKey) => ({
  icon,
  get label() {
    return translate(key);
  },
});

// The icon set a ticket type can be given (Billetterie → icône). Stored by
// key, so renaming a label here never breaks existing ticket types.
export const TICKET_ICONS: Record<string, { icon: LucideIcon; readonly label: string }> = {
  ticket: iconEntry(Ticket, "gate.icon.ticket"),
  crown: iconEntry(Crown, "gate.icon.crown"),
  star: iconEntry(Star, "gate.icon.star"),
  gem: iconEntry(Gem, "gate.icon.gem"),
  users: iconEntry(Users, "gate.icon.users"),
  baby: iconEntry(Baby, "gate.icon.baby"),
  student: iconEntry(GraduationCap, "gate.icon.student"),
  accessibility: iconEntry(Accessibility, "gate.icon.accessibility"),
  heart: iconEntry(Heart, "gate.icon.heart"),
  palette: iconEntry(Palette, "gate.icon.palette"),
  drama: iconEntry(Drama, "gate.icon.drama"),
  music: iconEntry(Music, "gate.icon.music"),
  mic: iconEntry(Mic, "gate.icon.mic"),
  landmark: iconEntry(Landmark, "gate.icon.landmark"),
  camera: iconEntry(Camera, "gate.icon.camera"),
  backstage: iconEntry(Sparkles, "gate.icon.backstage"),
  award: iconEntry(Award, "gate.icon.award"),
  trophy: iconEntry(Trophy, "gate.icon.trophy"),
  party: iconEntry(PartyPopper, "gate.icon.party"),
  tent: iconEntry(Tent, "gate.icon.tent"),
  utensils: iconEntry(Utensils, "gate.icon.utensils"),
  coffee: iconEntry(Coffee, "gate.icon.coffee"),
  beer: iconEntry(Beer, "gate.icon.beer"),
  popcorn: iconEntry(Popcorn, "gate.icon.popcorn"),
  shirt: iconEntry(Shirt, "gate.icon.shirt"),
  gift: iconEntry(Gift, "gate.icon.gift"),
  backpack: iconEntry(Backpack, "gate.icon.backpack"),
  car: iconEntry(Car, "gate.icon.car"),
  bus: iconEntry(Bus, "gate.icon.bus"),
  briefcase: iconEntry(Briefcase, "gate.icon.briefcase"),
};

type TicketColor = { readonly label: string; swatch: string; soft: string; solid: string; ring: string };

/** A colour whose label is read at use time, in the current language. */
const colorEntry = (key: MessageKey, classes: Omit<TicketColor, "label">): TicketColor => ({
  ...classes,
  get label() {
    return translate(key);
  },
});

// Full class strings (not built dynamically) so Tailwind keeps them.
export const TICKET_COLORS: Record<string, TicketColor> = {
  blue: colorEntry("gate.color.blue", {
    swatch: "bg-blue-600",
    soft: "bg-blue-50 text-blue-700",
    solid: "bg-blue-600 text-white",
    ring: "ring-blue-500",
  }),
  gold: colorEntry("gate.color.gold", {
    swatch: "bg-amber-400",
    soft: "bg-amber-50 text-amber-700",
    solid: "bg-amber-400 text-amber-950",
    ring: "ring-amber-400",
  }),
  green: colorEntry("gate.color.green", {
    swatch: "bg-emerald-600",
    soft: "bg-emerald-50 text-emerald-700",
    solid: "bg-emerald-600 text-white",
    ring: "ring-emerald-500",
  }),
  violet: colorEntry("gate.color.violet", {
    swatch: "bg-violet-600",
    soft: "bg-violet-50 text-violet-700",
    solid: "bg-violet-600 text-white",
    ring: "ring-violet-500",
  }),
  red: colorEntry("gate.color.red", {
    swatch: "bg-rose-600",
    soft: "bg-rose-50 text-rose-700",
    solid: "bg-rose-600 text-white",
    ring: "ring-rose-500",
  }),
  teal: colorEntry("gate.color.teal", {
    swatch: "bg-teal-600",
    soft: "bg-teal-50 text-teal-700",
    solid: "bg-teal-600 text-white",
    ring: "ring-teal-500",
  }),
  orange: colorEntry("gate.color.orange", {
    swatch: "bg-orange-500",
    soft: "bg-orange-50 text-orange-700",
    solid: "bg-orange-500 text-white",
    ring: "ring-orange-500",
  }),
  pink: colorEntry("gate.color.pink", {
    swatch: "bg-pink-500",
    soft: "bg-pink-50 text-pink-700",
    solid: "bg-pink-500 text-white",
    ring: "ring-pink-500",
  }),
  slate: colorEntry("gate.color.slate", {
    swatch: "bg-slate-700",
    soft: "bg-slate-100 text-slate-700",
    solid: "bg-slate-700 text-white",
    ring: "ring-slate-500",
  }),
};

// The same colours as hex, for charts (SVG fills can't use Tailwind classes).
export const TICKET_COLOR_HEX: Record<string, string> = {
  blue: "#2563eb",
  gold: "#f59e0b",
  green: "#059669",
  violet: "#7c3aed",
  red: "#e11d48",
  teal: "#0d9488",
  orange: "#ea580c",
  pink: "#db2777",
  slate: "#475569",
};

export function ticketIcon(key: string | null | undefined): LucideIcon {
  return TICKET_ICONS[key ?? ""]?.icon ?? Ticket;
}

export function ticketColor(key: string | null | undefined) {
  return TICKET_COLORS[key ?? ""] ?? TICKET_COLORS.blue;
}

/** The ticket type's icon in its coloured rounded square — used in admin lists and the cart. */
export function TicketTypeBadge({ icon, color, size = "md" }: { icon: string | null; color: string | null; size?: "sm" | "md" | "lg" }) {
  const Icon = ticketIcon(icon);
  const c = ticketColor(color);
  const box = size === "lg" ? "h-14 w-14 rounded-2xl" : size === "sm" ? "h-9 w-9 rounded-lg" : "h-11 w-11 rounded-xl";
  const glyph = size === "lg" ? "h-7 w-7" : size === "sm" ? "h-4 w-4" : "h-5 w-5";
  return (
    <span className={`inline-flex flex-shrink-0 items-center justify-center ${box} ${c.soft}`}>
      <Icon className={glyph} strokeWidth={1.9} />
    </span>
  );
}
