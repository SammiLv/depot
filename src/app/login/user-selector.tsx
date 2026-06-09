"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { avatarColor } from "@/lib/avatar-color";
import { Button } from "@/components/ui-kit";
import { selectLoginUser } from "@/server/auth/actions";
import { getRoleLabel, getDataScopeLabel } from "@/server/permissions/data-scope";

type RoleType = "ADMIN" | "DEPARTMENT_MANAGER" | "TEAM_LEADER" | "MEMBER";

type LoginUser = {
  id: string;
  name: string;
  roleType: RoleType;
  title: string | null;
  departmentId: string | null;
  teamId: string | null;
};

function Avatar({ name, size = "small" }: { name: string; size?: "small" | "large" }) {
  return (
    <div className={`${size === "small" ? "w-10 h-10 rounded-xl text-sm" : "w-28 h-28 rounded-2xl text-4xl"} flex shrink-0 items-center justify-center text-white font-medium shadow-sm ${avatarColor(name)}`}>
      {name.slice(0, 1)}
    </div>
  );
}

export function UserSelector({ users }: { users: LoginUser[] }) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  return (
    <div className="pt-6">
      <div className="text-center text-base font-semibold mb-1">选择身份</div>
      <div className="text-center text-xs text-muted-foreground mb-5">
        MVP 演示用，按角色自动应用数据范围
      </div>

      <form action={selectLoginUser}>
        <div className="grid gap-2 max-h-[420px] overflow-y-auto pr-1">
          {users.map((user, index) => (
            <label
              key={user.id}
              onClick={() => setSelectedIndex(index)}
              className={`flex cursor-pointer items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                index === selectedIndex
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40"
              }`}
            >
              <input
                className="sr-only"
                type="radio"
                name="userId"
                value={user.id}
                defaultChecked={index === 0}
              />
              <Avatar name={user.name} size="small" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">
                  {user.name}{" "}
                  <span className="text-xs text-muted-foreground font-normal">· {user.title}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {getRoleLabel(user.roleType)} · {getDataScopeLabel(user)}
                </div>
              </div>
              {index === selectedIndex && <Check className="w-4 h-4 text-primary" />}
            </label>
          ))}
        </div>

        <div className="mt-8">
          <Button type="submit" variant="primary" size="lg" className="w-full">
            下一步
          </Button>
        </div>
      </form>
    </div>
  );
}
