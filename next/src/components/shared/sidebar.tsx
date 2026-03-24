"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { exitDemoMode } from "@/actions/demo";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";

interface SidebarProps {
  userEmail: string;
  userName?: string | null;
  userRole?: string;
  isDemo?: boolean;
}

export function Sidebar({ userEmail, userName, userRole, isDemo }: SidebarProps) {
  const displayName = userName || userEmail;
  const initials = displayName
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary" />
        }
      >
        <Avatar size="sm">
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="end">
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium truncate">{displayName}</p>
            {userName && (
              <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
            )}
          </div>

          <div className="flex items-center justify-between">
            <Badge variant={userRole === "owner" ? "default" : "secondary"}>
              {userRole || "user"}
            </Badge>

            {isDemo ? (
              <form action={exitDemoMode}>
                <Button
                  type="submit"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground h-8 gap-1.5"
                >
                  <LogOut className="h-4 w-4" />
                  Exit demo
                </Button>
              </form>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground h-8 gap-1.5"
                onClick={() => signOut({ callbackUrl: "/login" })}
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </Button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
