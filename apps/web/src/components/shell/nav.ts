import {
  House,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  ReceiptText,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; hint: string };

/** The app's surfaces, grouped the way the sidebar shows them. */
export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Overview",
    items: [
      { href: "/home", label: "Home", icon: House, hint: "Today, approvals and recent receipts" },
      { href: "/ledger", label: "Ledger", icon: LayoutDashboard, hint: "Ask where your money went" },
    ],
  },
  {
    label: "Work",
    items: [
      { href: "/tasks", label: "Tasks", icon: ListChecks, hint: "Post work, pay on proof" },
      { href: "/hire", label: "Hire", icon: UsersRound, hint: "People and AI agents for hire" },
    ],
  },
  {
    label: "Money",
    items: [
      { href: "/receipts", label: "Receipts", icon: ReceiptText, hint: "Every dollar, why it moved" },
    ],
  },
  {
    label: "Build",
    items: [{ href: "/developers", label: "Agents & API", icon: KeyRound, hint: "Keys, MCP and the agent API" }],
  },
];

export const NAV: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

export function navFor(pathname: string) {
  return NAV.find((n) => pathname === n.href || pathname.startsWith(n.href + "/"));
}
