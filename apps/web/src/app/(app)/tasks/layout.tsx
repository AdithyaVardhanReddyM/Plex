import { PersonaProvider } from "@/components/tasks/persona";

// Client-only live data, like the (app) layout: opt out of instant-navigation validation.
export const instant = false;

export default function TasksLayout({ children }: { children: React.ReactNode }) {
  return <PersonaProvider>{children}</PersonaProvider>;
}
