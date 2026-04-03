"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useState } from "react";
import { LogOut, User, Menu } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { navItems, settingsItem } from "@/lib/navigation";

interface TopbarProps {
  email?: string;
}

export function Topbar({ email }: TopbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  const initials = email
    ? email.substring(0, 2).toUpperCase()
    : "AD";

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const getPageTitle = (path: string) => {
    if (path === "/dashboard") return "Dashboard";
    if (path === "/dashboard/quiz-stops") return "Quiz Stopy";
    if (path === "/dashboard/quiz-content") return "Kategorie zwykłe";
    if (path.startsWith("/dashboard/quiz-content/")) {
      const catName = decodeURIComponent(path.split("/").pop() || "");
      return `Kategoria: ${catName}`;
    }
    if (path === "/dashboard/users") return "Użytkownicy";
    if (path === "/dashboard/settings") return "Ustawienia";
    return "";
  };

  const pageTitle = getPageTitle(pathname);

  return (
    <header className="h-16 border-b border-slate-200 bg-white flex items-center justify-between px-6 sticky top-0 z-30">
      <div className="flex items-center gap-4">
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger
            render={
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="w-5 h-5" />
              </Button>
            }
          />
          <SheetContent side="left" className="p-0 w-72">
            <SheetHeader className="sr-only">
              <SheetTitle>Menu nawigacyjne</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col h-full bg-slate-900">
              {/* Mobile Logo */}
              <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-700/50">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-xl flex items-center justify-center">
                  <span className="text-lg font-bold text-white">T</span>
                </div>
                <div>
                  <h1 className="text-lg font-bold text-white">Trivelia</h1>
                  <p className="text-xs text-slate-400">Content Management</p>
                </div>
              </div>

              {/* Mobile Nav */}
              <nav className="flex-1 px-3 py-4 space-y-1">
                {navItems.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/dashboard" && pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setIsOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-white",
                        isActive
                          ? "bg-blue-600/20 text-blue-400"
                          : "text-slate-400 hover:text-white hover:bg-slate-800"
                      )}
                    >
                      <item.icon className="w-5 h-5" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>

              {/* Mobile Bottom */}
              <div className="px-3 py-4 border-t border-slate-700/50 mt-auto">
                <Link
                  href={settingsItem.href}
                  onClick={() => setIsOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
                >
                  <settingsItem.icon className="w-5 h-5" />
                  {settingsItem.label}
                </Link>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {pageTitle && (
          <h1 className="text-xl font-bold text-slate-800 ml-2 md:ml-0">
            {pageTitle}
          </h1>
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer outline-none">
            <Avatar className="w-8 h-8">
              <AvatarFallback className="bg-blue-100 text-blue-700 text-xs font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm text-slate-600 hidden sm:block">{email}</span>
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem className="text-sm">
            <User className="w-4 h-4 mr-2" />
            Moje konto
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout} className="text-red-600 text-sm">
            <LogOut className="w-4 h-4 mr-2" />
            Wyloguj się
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
