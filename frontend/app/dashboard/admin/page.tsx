"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Shield, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/lib/auth-store";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

type Row = {
  id: string;
  email: string;
  role: string;
  is_active: boolean;
  max_channels: number | null;
  max_ai_tokens_per_month: number | null;
  max_scheduled_posts: number | null;
};

export default function AdminUsersPage() {
  const profile = useAuthStore((s) => s.profile);
  const role = profile?.role ?? "";
  const allowed = role === "admin" || role === "super_admin";

  const [users, setUsers] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newRole, setNewRole] = useState("viewer");

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND}/api/admin/users`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load users");
      const data = await res.json();
      setUsers(data.users ?? []);
    } catch {
      toast.error("Could not load users");
    } finally {
      setLoading(false);
    }
  }, [allowed]);

  useEffect(() => {
    load();
  }, [load]);

  const createUser = async () => {
    try {
      const res = await fetch(`${BACKEND}/api/admin/users`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          role: newRole,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? "Create failed");
      }
      toast.success("User created");
      setEmail("");
      setPassword("");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    }
  };

  if (!allowed) {
    return (
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Admin only
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            You need the <strong>admin</strong> or <strong>super_admin</strong> role to manage users.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Users &amp; roles</h1>
        <p className="text-muted-foreground text-sm mt-1">Create dashboard users and assign RBAC roles.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            New user
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 max-w-md">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pw">Password (8+ chars)</Label>
            <Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <select
              id="role"
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
            >
              <option value="viewer">viewer</option>
              <option value="admin">admin</option>
              <option value="super_admin">super_admin</option>
            </select>
          </div>
          <Button onClick={createUser} disabled={!email.trim() || password.length < 8}>
            Create user
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All users</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4">Email</th>
                    <th className="py-2 pr-4">Role</th>
                    <th className="py-2 pr-4">Active</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-border/60">
                      <td className="py-2 pr-4">{u.email}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{u.role}</td>
                      <td className="py-2 pr-4">{u.is_active ? "yes" : "no"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
