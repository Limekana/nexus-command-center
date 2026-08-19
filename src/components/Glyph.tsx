import {
  Home, UtensilsCrossed, TrainFront, Clapperboard, BookOpen, Dumbbell,
  ShoppingCart, Coffee, Plane, Lightbulb, Pill, Gift, FolderOpen,
  Wallet, PiggyBank, Banknote, CreditCard, Landmark, Receipt, Tag,
  BarChart3, TrendingUp, LineChart, Briefcase, Target, FileText, Eye,
  Package, Boxes, Layers, Bitcoin, Car, GraduationCap, Flame, Award,
  Star, Trophy, Moon, Calendar, CalendarDays, LifeBuoy, CheckCircle2,
  AlertTriangle, RotateCw, Circle, Check, X, Pencil, Sparkle, Fingerprint,
  Download, CandlestickChart, HeartPulse, PawPrint, Music, Wrench, Shirt,
  Laptop, Smartphone, Bike, Fuel, Wifi, Scissors, Ticket, type LucideIcon,
} from 'lucide-react';

/**
 * The app's icon layer.
 *
 * v1.10 removed every emoji from the interface. Emoji render in the platform's
 * own colour font, so no palette reaches them — a category list was a row of
 * saturated multicolour glyphs sitting on a seven-value monochrome palette, and
 * nothing in the design system could touch them. These are lucide strokes that
 * take `currentColor`, so an icon is whatever colour its context says it is.
 *
 * ── Why the keys are still emoji ──────────────────────────────────────────
 *
 * A budget category's icon is USER DATA. It round-trips through Supabase (it
 * rides in `budget_categories.color`, see lib/cloudSync.ts) and every NCC
 * version already installed reads that column and renders it directly as text.
 * Writing `'home'` there would show a literal "home" inside older installs on
 * F-Droid, which stay in the wild indefinitely (`P1`).
 *
 * So the stored value does not change. The emoji becomes an internal
 * identifier that this app never displays, and the picker keeps writing the
 * exact characters it always wrote. Old installs are unaffected; this one shows
 * a stroke icon. If the wire format is ever migrated, this map is the only
 * thing that has to know about it.
 */
const BY_KEY: Record<string, LucideIcon> = {
  // Budget categories — the twelve the picker offers.
  '\u{1F3E0}': Home,             // house
  '\u{1F371}': UtensilsCrossed,  // bento
  '\u{1F686}': TrainFront,       // train
  '\u{1F3AC}': Clapperboard,     // clapper
  '\u{1F4DA}': BookOpen,         // books
  '\u{1F4AA}': Dumbbell,         // flexed biceps
  '\u{1F6D2}': ShoppingCart,     // trolley
  '☕': Coffee,              // hot beverage
  '✈': Plane,               // aeroplane
  '\u{1F4A1}': Lightbulb,        // bulb
  '\u{1F48A}': Pill,             // pill
  '\u{1F381}': Gift,             // gift
  '\u{1F3E5}': HeartPulse,       // hospital
  '\u{1F43E}': PawPrint,         // paw prints
  '\u{1F3B5}': Music,            // musical note
  '\u{1F527}': Wrench,           // wrench
  '\u{1F455}': Shirt,            // t-shirt
  '\u{1F4BB}': Laptop,           // laptop
  '\u{1F4F1}': Smartphone,       // mobile phone
  '\u{1F6B2}': Bike,             // bicycle
  '\u{26FD}': Fuel,              // fuel pump
  '\u{1F4F6}': Wifi,             // antenna bars
  '\u{2702}': Scissors,          // scissors
  '\u{1F3AB}': Ticket,           // ticket
  '\u{1F5C2}': FolderOpen,       // card index dividers — the import default

  // Money and accounts.
  '\u{1F4B0}': Wallet,           // money bag
  '\u{1F4B5}': Banknote,         // banknote
  '\u{1F4B3}': CreditCard,       // credit card
  '\u{1F3E6}': Landmark,         // bank
  '\u{1F9FE}': Receipt,          // receipt
  '\u{1F3F7}': Tag,              // label
  '\u{1F4B8}': Banknote,         // money with wings — the expense quick-log
  '\u{1F4BC}': Briefcase,        // briefcase

  // Markets and reporting.
  '\u{1F4CA}': BarChart3,        // bar chart
  '\u{1F4C8}': TrendingUp,       // chart increasing
  '\u{1F5D2}': FileText,         // spiral notepad
  '\u{1F441}': Eye,              // eye — watchlist
  '\u{1F4E6}': Package,          // package
  '\u{1F9FA}': Boxes,            // basket — ETF
  '₿': Bitcoin,             // bitcoin sign
  '\u{1F697}': Car,              // car

  // Progress and streaks.
  '\u{1F3AF}': Target,           // direct hit
  '\u{1F393}': GraduationCap,    // graduation cap
  '\u{1F3CB}': Dumbbell,         // weightlifter
  '\u{1F525}': Flame,            // fire — streak
  '\u{1F4AF}': Award,            // hundred points
  '⭐': Star,                // star
  '\u{1F3C6}': Trophy,           // trophy
  '\u{1F319}': Moon,             // crescent — evening reminder
  '\u{1F4D6}': BookOpen,         // open book
  '\u{1F4C5}': Calendar,         // calendar
  '\u{1F4C6}': CalendarDays,     // tear-off calendar
  '\u{1F6DF}': LifeBuoy,         // ring buoy — savings buffer
  '✅': CheckCircle2,        // check mark button
};

/** Named entries, for call sites that are not carrying stored user data. */
const BY_NAME: Record<string, LucideIcon> = {
  finance: Wallet,
  savings: PiggyBank,
  studies: BookOpen,
  fitness: Dumbbell,
  tasks: CheckCircle2,
  markets: LineChart,
  holdings: Layers,
  goals: Target,
  calendar: Calendar,
  streak: Flame,
  archive: Package,
  inflation: BarChart3,
  employment: Briefcase,
  growth: TrendingUp,
  warning: AlertTriangle,
  refresh: RotateCw,
  check: Check,
  close: X,
  edit: Pencil,
  sparkle: Sparkle,
  biometric: Fingerprint,
  download: Download,
  file: FileText,
  star: Star,
  watch: Eye,
  lots: Package,
  crypto: Bitcoin,
  etf: Boxes,
  stock: CandlestickChart,
  expense: Banknote,
  work: Briefcase,
  // Manual-asset types (screens/finance/NetWorth.tsx). Keyed by account type,
  // never persisted as an icon, so these get clean names.
  bank: Landmark,
  cash: Banknote,
  card: CreditCard,
  investment: TrendingUp,
  property: Home,
  vehicle: Car,
  loan: Receipt,
  other: Package,
  custom: Tag,
  buffer: LifeBuoy,
};

export interface GlyphProps {
  /**
   * A name from BY_NAME, or a stored icon identifier (which is an emoji
   * character for historical reasons — see the note above). Unknown values
   * resolve to a neutral circle rather than rendering the raw string, so a
   * value written by a future version cannot leak a stray glyph into the UI.
   */
  name?: string;
  size?: number;
  strokeWidth?: number;
  className?: string;
  /** Fill the shape with currentColor — for on/off pairs such as a star
   *  rating, where outline vs solid is the state. */
  filled?: boolean;
}

export default function Glyph({ name, size = 14, strokeWidth = 2, className, filled }: GlyphProps) {
  const Icon = (name && (BY_NAME[name] ?? BY_KEY[name])) || Circle;
  return (
    <Icon
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      fill={filled ? 'currentColor' : 'none'}
      aria-hidden
    />
  );
}

/**
 * The identifiers the budget-category picker offers, in display order.
 *
 * Twenty-five, up from twelve. The picker used to pair twelve presets with a
 * free-text field so a category the presets missed could take whatever
 * character the user typed. That escape hatch cannot survive an icon set: a
 * typed emoji has no stroke icon to map to, so it would render as a blank
 * placeholder and the choice would silently vanish. The presets absorb its job
 * instead — the field existed because twelve was too few, and this is twice
 * that.
 */
// eslint-disable-next-line react-refresh/only-export-components -- deliberate co-location: the key list has to stay next to the map that gives each key an icon, or the two drift
export const CATEGORY_ICON_KEYS = [
  '\u{1F3E0}', '\u{1F371}', '\u{1F686}', '\u{1F3AC}', '\u{1F4DA}', '\u{1F4AA}',
  '\u{1F6D2}', '☕', '✈', '\u{1F4A1}', '\u{1F48A}', '\u{1F381}',
  '\u{1F3E5}', '\u{1F43E}', '\u{1F3B5}', '\u{1F527}', '\u{1F455}', '\u{1F4BB}',
  '\u{1F4F1}', '\u{1F6B2}', '\u{26FD}', '\u{1F4F6}', '\u{2702}', '\u{1F3AB}',
  '\u{1F5C2}',
] as const;
