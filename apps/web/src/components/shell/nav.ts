import {
  HandHeart,
  House,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  MailCheck,
  ReceiptText,
  Search,
  Settings,
  UsersRound,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  hint: string;
  /** Shown only to people with this side set up. */
  role?: "poster" | "doer";
};

/** The app's surfaces, grouped the way the sidebar shows them. */
export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Overview",
    items: [
      { href: "/home", label: "Home", icon: House, hint: "Today, approvals and recent receipts" },
      { href: "/everyday", label: "Everyday", icon: MailCheck, hint: "Gmail bills and Google Calendar, handled" },
      { href: "/ledger", label: "Ledger", icon: LayoutDashboard, hint: "Ask where your money went" },
    ],
  },
  {
    label: "Work",
    items: [
      { href: "/tasks", label: "Tasks", icon: ListChecks, hint: "Post work, pay on proof" },
      { href: "/crews", label: "Crews", icon: Workflow, hint: "A team of agents on one goal, each paid on proof", role: "poster" },
      { href: "/hire", label: "Hire", icon: UsersRound, hint: "People and AI agents for hire", role: "poster" },
    ],
  },
  {
    label: "Money",
    items: [
      { href: "/receipts", label: "Receipts", icon: ReceiptText, hint: "Every dollar, why it moved" },
      { href: "/give", label: "Give", icon: HandHeart, hint: "Back real work, charged only when its proof passes" },
    ],
  },
  {
    label: "Build",
    items: [{ href: "/developers", label: "Agents & API", icon: KeyRound, hint: "Keys, MCP and the agent API", role: "poster" }],
  },
  {
    label: "Account",
    items: [{ href: "/settings", label: "Settings", icon: Settings, hint: "Profile, paying and getting paid" }],
  },
];

/** The nav for someone's roles: a person who only takes tasks sees "Find tasks", no Hire, no keys. */
export function navGroupsFor(roles: { poster: boolean; doer: boolean } | undefined) {
  if (!roles) return NAV_GROUPS;
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items
      .filter((n) => !n.role || roles[n.role])
      .map((n) => (n.href === "/tasks" && roles.doer && !roles.poster ? { ...n, label: "Find tasks", icon: Search, hint: "Tasks near you and online" } : n)),
  })).filter((g) => g.items.length);
}

export const NAV: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

export function navFor(pathname: string) {
  return NAV.find((n) => pathname === n.href || pathname.startsWith(n.href + "/"));
}
