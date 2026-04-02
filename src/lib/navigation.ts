import {
  MapPin,
  HelpCircle,
  FolderOpen,
  Users,
  LayoutDashboard,
  Settings,
} from "lucide-react";

export const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/quiz-stops", label: "Quiz Stopy", icon: MapPin },
  { href: "/dashboard/quiz-content", label: "Kategorie i Quizy", icon: FolderOpen },
  { href: "/dashboard/users", label: "Użytkownicy", icon: Users },
] as const;

export const settingsItem = {
  href: "/dashboard/settings",
  label: "Ustawienia",
  icon: Settings,
} as const;
