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

// The icon set a ticket type can be given (Billetterie → icône). Stored by
// key, so renaming a label here never breaks existing ticket types.
export const TICKET_ICONS: Record<string, { icon: LucideIcon; label: string }> = {
  ticket: { icon: Ticket, label: "Entrée" },
  crown: { icon: Crown, label: "VIP" },
  star: { icon: Star, label: "Premium" },
  gem: { icon: Gem, label: "Prestige" },
  users: { icon: Users, label: "Groupe" },
  baby: { icon: Baby, label: "Enfant" },
  student: { icon: GraduationCap, label: "Étudiant" },
  accessibility: { icon: Accessibility, label: "PMR" },
  heart: { icon: Heart, label: "Solidaire" },
  palette: { icon: Palette, label: "Ateliers" },
  drama: { icon: Drama, label: "Spectacle" },
  music: { icon: Music, label: "Concert" },
  mic: { icon: Mic, label: "Conférence" },
  landmark: { icon: Landmark, label: "Palais / visite" },
  camera: { icon: Camera, label: "Photo" },
  backstage: { icon: Sparkles, label: "Backstage" },
  award: { icon: Award, label: "Invité" },
  trophy: { icon: Trophy, label: "Concours" },
  party: { icon: PartyPopper, label: "Soirée" },
  tent: { icon: Tent, label: "Camping" },
  utensils: { icon: Utensils, label: "Repas" },
  coffee: { icon: Coffee, label: "Boisson" },
  beer: { icon: Beer, label: "Bar" },
  popcorn: { icon: Popcorn, label: "Snack" },
  shirt: { icon: Shirt, label: "Tee-shirt" },
  gift: { icon: Gift, label: "Souvenir" },
  backpack: { icon: Backpack, label: "Kit" },
  car: { icon: Car, label: "Parking" },
  bus: { icon: Bus, label: "Navette" },
  briefcase: { icon: Briefcase, label: "Professionnel" },
};

// Full class strings (not built dynamically) so Tailwind keeps them.
export const TICKET_COLORS: Record<string, { label: string; swatch: string; soft: string; solid: string; ring: string }> = {
  blue: { label: "Bleu", swatch: "bg-blue-600", soft: "bg-blue-50 text-blue-700", solid: "bg-blue-600 text-white", ring: "ring-blue-500" },
  gold: { label: "Or", swatch: "bg-amber-400", soft: "bg-amber-50 text-amber-700", solid: "bg-amber-400 text-amber-950", ring: "ring-amber-400" },
  green: { label: "Vert", swatch: "bg-emerald-600", soft: "bg-emerald-50 text-emerald-700", solid: "bg-emerald-600 text-white", ring: "ring-emerald-500" },
  violet: { label: "Violet", swatch: "bg-violet-600", soft: "bg-violet-50 text-violet-700", solid: "bg-violet-600 text-white", ring: "ring-violet-500" },
  red: { label: "Rouge", swatch: "bg-rose-600", soft: "bg-rose-50 text-rose-700", solid: "bg-rose-600 text-white", ring: "ring-rose-500" },
  teal: { label: "Turquoise", swatch: "bg-teal-600", soft: "bg-teal-50 text-teal-700", solid: "bg-teal-600 text-white", ring: "ring-teal-500" },
  orange: { label: "Orange", swatch: "bg-orange-500", soft: "bg-orange-50 text-orange-700", solid: "bg-orange-500 text-white", ring: "ring-orange-500" },
  pink: { label: "Rose", swatch: "bg-pink-500", soft: "bg-pink-50 text-pink-700", solid: "bg-pink-500 text-white", ring: "ring-pink-500" },
  slate: { label: "Ardoise", swatch: "bg-slate-700", soft: "bg-slate-100 text-slate-700", solid: "bg-slate-700 text-white", ring: "ring-slate-500" },
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
