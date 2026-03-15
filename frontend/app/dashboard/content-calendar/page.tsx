"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  Plus,
  Loader2,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Save,
  X,
} from "lucide-react";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

interface ScheduledItem {
  id: string;
  channel_id: string;
  content: string;
  scheduled_at: string;
  status: string;
  sent_at: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

interface Channel {
  id: string;
  name: string;
}

export default function ContentCalendarPage() {
  const [items, setItems] = useState<ScheduledItem[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthOffset, setMonthOffset] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ channelId: "", content: "", scheduledAt: "" });
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editScheduledAt, setEditScheduledAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const now = new Date();
  const viewStart = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const viewEnd = new Date(now.getFullYear(), now.getMonth() + monthOffset + 12, 0);
  const fromDate = viewStart.toISOString().slice(0, 10);
  const toDate = viewEnd.toISOString();

  async function fetchChannels() {
    const res = await fetch(`${BACKEND}/api/channels`, { credentials: "include" });
    const data = await res.json();
    setChannels(Array.isArray(data) ? data : []);
  }

  async function fetchItems() {
    const params = new URLSearchParams({ limit: "500" });
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    const res = await fetch(`${BACKEND}/api/scheduled-contents?${params}`, { credentials: "include" });
    const data = await res.json();
    setItems(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchChannels();
      await fetchItems();
      setLoading(false);
    })();
  }, [fromDate, toDate]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!addForm.channelId || !addForm.content.trim() || !addForm.scheduledAt) return;
    setAdding(true);
    try {
      const res = await fetch(`${BACKEND}/api/scheduled-contents`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel_id: addForm.channelId,
          content: addForm.content.trim(),
          scheduled_at: addForm.scheduledAt,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.detail ?? "Failed to create");
        return;
      }
      setAddForm({ channelId: "", content: "", scheduledAt: "" });
      setShowAdd(false);
      await fetchItems();
    } finally {
      setAdding(false);
    }
  }

  async function handleSaveEdit() {
    if (!editId) return;
    setSaving(true);
    try {
      const res = await fetch(`${BACKEND}/api/scheduled-contents/${editId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: editContent,
          scheduled_at: editScheduledAt || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.detail ?? "Failed to update");
        return;
      }
      setEditId(null);
      await fetchItems();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await fetch(`${BACKEND}/api/scheduled-contents/${id}`, { method: "DELETE", credentials: "include" });
      setItems((prev) => prev.filter((i) => i.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  const channelName = (id: string) => channels.find((c) => c.id === id)?.name ?? id;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calendar className="h-6 w-6" />
            Content Calendar
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage and preview scheduled posts for the next year. Celery sends at the exact scheduled time.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setMonthOffset((m) => m - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[140px] text-center">
            {viewStart.toLocaleDateString("en-US", { month: "long", year: "numeric" })} +
          </span>
          <Button variant="outline" size="sm" onClick={() => setMonthOffset((m) => m + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button size="sm" className="gap-2" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4" />
            Schedule post
          </Button>
        </div>
      </div>

      {showAdd && (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Schedule new post</CardTitle>
            <Button variant="ghost" size="icon" onClick={() => setShowAdd(false)}>
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAdd} className="space-y-3">
              <div>
                <Label className="text-xs">Channel</Label>
                <select
                  className="w-full mt-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={addForm.channelId}
                  onChange={(e) => setAddForm((p) => ({ ...p, channelId: e.target.value }))}
                  required
                >
                  <option value="">Select channel</option>
                  {channels.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs">Content</Label>
                <Input
                  className="mt-1"
                  value={addForm.content}
                  onChange={(e) => setAddForm((p) => ({ ...p, content: e.target.value }))}
                  placeholder="Post text..."
                  required
                />
              </div>
              <div>
                <Label className="text-xs">Scheduled at (UTC)</Label>
                <Input
                  type="datetime-local"
                  className="mt-1"
                  value={addForm.scheduledAt}
                  onChange={(e) => setAddForm((p) => ({ ...p, scheduledAt: e.target.value }))}
                  required
                />
              </div>
              <Button type="submit" disabled={adding} className="gap-2">
                {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Schedule
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scheduled posts</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No scheduled posts in this range. Add one to get started.
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-border bg-muted/20 p-4"
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="text-xs">
                          {channelName(item.channel_id)}
                        </Badge>
                        <Badge variant={item.status === "pending" ? "default" : item.status === "sent" ? "outline" : "secondary"} className="text-xs">
                          {item.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(item.scheduled_at).toLocaleString()}
                        </span>
                      </div>
                      {editId === item.id ? (
                        <div className="mt-2 space-y-2">
                          <Input
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            className="font-mono text-sm"
                          />
                          <Input
                            type="datetime-local"
                            value={editScheduledAt}
                            onChange={(e) => setEditScheduledAt(e.target.value)}
                            className="text-sm"
                          />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={handleSaveEdit} disabled={saving} className="gap-1">
                              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                              Save
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setEditId(null)}>Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-1 text-sm whitespace-pre-wrap break-words">{item.content}</p>
                      )}
                      {item.error && <p className="mt-1 text-xs text-destructive">{item.error}</p>}
                    </div>
                    {editId !== item.id && (
                      <div className="flex gap-2 shrink-0">
                        {item.status === "pending" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs"
                            onClick={() => {
                              setEditId(item.id);
                              setEditContent(item.content);
                              setEditScheduledAt(item.scheduled_at.slice(0, 16));
                            }}
                          >
                            Edit
                          </Button>
                        )}
                        {item.status === "pending" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive text-xs"
                            onClick={() => handleDelete(item.id)}
                            disabled={deletingId === item.id}
                          >
                            {deletingId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
