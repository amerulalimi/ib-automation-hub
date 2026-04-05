"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  Save,
  X,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  ImageIcon,
  ListOrdered,
  Type,
  Upload,
} from "lucide-react";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

type PostKind = "text" | "photo" | "poll";

interface ScheduledItem {
  id: string;
  channel_id: string;
  content: string;
  post_kind: PostKind;
  post_meta: Record<string, unknown>;
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

interface AIApiConfig {
  id: string;
  name: string;
  is_default: boolean;
}

const PAGE_SIZES = [20, 50, 100] as const;

export default function ContentCalendarPage() {
  const [items, setItems] = useState<ScheduledItem[]>([]);
  const [total, setTotal] = useState(0);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(20);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [channelFilter, setChannelFilter] = useState<string>("");
  const [filterFrom, setFilterFrom] = useState<string>("");
  const [filterTo, setFilterTo] = useState<string>("");

  const [showAdd, setShowAdd] = useState(false);
  const [postKind, setPostKind] = useState<PostKind>("text");
  const [addForm, setAddForm] = useState({
    channelId: "",
    content: "",
    scheduledAt: "",
    photoUrl: "",
    pollQuestion: "",
    pollAnonymous: true,
    pollMultiple: false,
  });
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [adding, setAdding] = useState(false);

  const [showAiBulk, setShowAiBulk] = useState(false);
  const [aiConfigs, setAiConfigs] = useState<AIApiConfig[]>([]);
  const [aiForm, setAiForm] = useState({
    channelId: "",
    aiConfigId: "",
    topic: "Gold Trading tips, motivation, and market analysis",
    days: "30",
  });
  const [generating, setGenerating] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editScheduledAt, setEditScheduledAt] = useState("");
  const [editPostKind, setEditPostKind] = useState<PostKind>("text");
  const [editPhotoUrl, setEditPhotoUrl] = useState("");
  const [editPollQuestion, setEditPollQuestion] = useState("");
  const [editPollOptions, setEditPollOptions] = useState<string[]>(["", ""]);
  const [editPollAnonymous, setEditPollAnonymous] = useState(true);
  const [editPollMultiple, setEditPollMultiple] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [editPhotoUploading, setEditPhotoUploading] = useState(false);
  const addPhotoFileRef = useRef<HTMLInputElement>(null);
  const editPhotoFileRef = useRef<HTMLInputElement>(null);

  const fetchChannels = useCallback(async () => {
    const res = await fetch(`${BACKEND}/api/channels`, { credentials: "include" });
    const data = await res.json();
    setChannels(Array.isArray(data) ? data : []);
  }, []);

  const fetchAiConfigs = useCallback(async () => {
    const res = await fetch(`${BACKEND}/api/ai-configs`, { credentials: "include" });
    const data = await res.json();
    setAiConfigs(Array.isArray(data) ? data : []);
  }, []);

  const fetchItems = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("limit", String(pageSize));
    params.set("offset", String(page * pageSize));
    if (statusFilter) params.set("status", statusFilter);
    if (channelFilter) params.set("channel_id", channelFilter);
    if (filterFrom) params.set("from", new Date(filterFrom).toISOString());
    if (filterTo) params.set("to", new Date(filterTo).toISOString());
    const res = await fetch(`${BACKEND}/api/scheduled-contents?${params}`, { credentials: "include" });
    const data = await res.json();
    if (data && Array.isArray(data.items)) {
      setItems(data.items);
      setTotal(typeof data.total === "number" ? data.total : 0);
    } else {
      setItems([]);
      setTotal(0);
    }
  }, [page, pageSize, statusFilter, channelFilter, filterFrom, filterTo]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([fetchChannels(), fetchAiConfigs()]);
      await fetchItems();
      setLoading(false);
    })();
  }, [fetchChannels, fetchAiConfigs, fetchItems]);

  useEffect(() => {
    setPage(0);
  }, [pageSize, statusFilter, channelFilter, filterFrom, filterTo]);

  async function uploadPhotoToS3(file: File): Promise<string | null> {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${BACKEND}/api/scheduled-contents/upload-photo`, {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert((data as { detail?: string }).detail ?? "Upload failed");
      return null;
    }
    const url = (data as { photo_url?: string }).photo_url;
    if (!url?.startsWith("https://")) {
      alert("Invalid response from server");
      return null;
    }
    return url;
  }

  async function handleAddPhotoFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setPhotoUploading(true);
    try {
      const url = await uploadPhotoToS3(f);
      if (url) setAddForm((p) => ({ ...p, photoUrl: url }));
    } finally {
      setPhotoUploading(false);
    }
  }

  async function handleEditPhotoFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setEditPhotoUploading(true);
    try {
      const url = await uploadPhotoToS3(f);
      if (url) setEditPhotoUrl(url);
    } finally {
      setEditPhotoUploading(false);
    }
  }

  function buildPollMeta() {
    const opts = pollOptions.map((o) => o.trim()).filter(Boolean);
    return {
      question: addForm.pollQuestion.trim(),
      options: opts,
      is_anonymous: addForm.pollAnonymous,
      allows_multiple_answers: addForm.pollMultiple,
    };
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!addForm.channelId || !addForm.scheduledAt) return;
    if (postKind === "text" && !addForm.content.trim()) return;
    if (postKind === "photo" && !addForm.photoUrl.trim().startsWith("https://")) {
      alert("Photo URL must start with https://");
      return;
    }
    if (postKind === "poll") {
      const opts = pollOptions.map((o) => o.trim()).filter(Boolean);
      if (!addForm.pollQuestion.trim() || opts.length < 2) {
        alert("Poll needs a question and at least 2 options.");
        return;
      }
    }

    setAdding(true);
    try {
      const body: Record<string, unknown> = {
        channel_id: addForm.channelId,
        content: addForm.content.trim(),
        scheduled_at: new Date(addForm.scheduledAt).toISOString(),
        post_kind: postKind,
        post_meta: {},
      };
      if (postKind === "photo") {
        body.post_meta = { photo_url: addForm.photoUrl.trim() };
      } else if (postKind === "poll") {
        body.post_meta = buildPollMeta();
      }

      const res = await fetch(`${BACKEND}/api/scheduled-contents`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert((err as { detail?: string }).detail ?? "Failed to create");
        return;
      }
      setAddForm({
        channelId: "",
        content: "",
        scheduledAt: "",
        photoUrl: "",
        pollQuestion: "",
        pollAnonymous: true,
        pollMultiple: false,
      });
      setPollOptions(["", ""]);
      setPostKind("text");
      setShowAdd(false);
      setPage(0);
      await fetchItems();
    } finally {
      setAdding(false);
    }
  }

  async function handleAiBulkGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!aiForm.channelId || !aiForm.topic.trim() || !aiForm.aiConfigId.trim()) {
      alert("Select a channel, an AI API profile, and enter a topic.");
      return;
    }
    setGenerating(true);
    try {
      const genRes = await fetch(`${BACKEND}/api/ai/bulk-generate-preview`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: aiForm.topic.trim(),
          days: parseInt(aiForm.days) || 30,
          ai_config_id: aiForm.aiConfigId.trim(),
        }),
      });
      if (!genRes.ok) {
        const err = await genRes.json();
        alert(err.detail ?? "Failed to generate");
        return;
      }
      const genData = await genRes.json();
      if (!genData.items || genData.items.length === 0) {
        alert("Failed to generate posts. AI returned empty.");
        return;
      }

      const saveRes = await fetch(`${BACKEND}/api/scheduled-contents/bulk`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel_id: aiForm.channelId,
          items: genData.items,
        }),
      });

      if (!saveRes.ok) {
        const err = await saveRes.json();
        alert(err.detail ?? "Failed to save generated posts");
        return;
      }

      setAiForm({
        channelId: "",
        aiConfigId: "",
        topic: "Gold Trading tips, motivation, and market analysis",
        days: "30",
      });
      setShowAiBulk(false);
      setPage(0);
      await fetchItems();
      alert(`Successfully generated and scheduled ${genData.items.length} posts!`);
    } catch (e) {
      alert("Error: " + String(e));
    } finally {
      setGenerating(false);
    }
  }

  function openEdit(item: ScheduledItem) {
    setEditId(item.id);
    setEditContent(item.content);
    setEditScheduledAt(item.scheduled_at.slice(0, 16));
    const k = (item.post_kind || "text") as PostKind;
    setEditPostKind(k);
    const m = item.post_meta || {};
    setEditPhotoUrl(typeof m.photo_url === "string" ? m.photo_url : "");
    setEditPollQuestion(typeof m.question === "string" ? m.question : "");
    const opts = Array.isArray(m.options) ? m.options.map(String) : [];
    setEditPollOptions(opts.length >= 2 ? opts : ["", ""]);
    setEditPollAnonymous(m.is_anonymous !== false);
    setEditPollMultiple(Boolean(m.allows_multiple_answers));
  }

  async function handleSaveEdit() {
    if (!editId) return;
    setSaving(true);
    try {
      let post_meta: Record<string, unknown> | undefined;
      if (editPostKind === "photo") {
        post_meta = { photo_url: editPhotoUrl.trim() };
      } else if (editPostKind === "poll") {
        const opts = editPollOptions.map((o) => o.trim()).filter(Boolean);
        post_meta = {
          question: editPollQuestion.trim(),
          options: opts,
          is_anonymous: editPollAnonymous,
          allows_multiple_answers: editPollMultiple,
        };
      } else {
        post_meta = {};
      }

      const res = await fetch(`${BACKEND}/api/scheduled-contents/${editId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: editContent,
          scheduled_at: editScheduledAt
            ? new Date(editScheduledAt).toISOString()
            : undefined,
          post_kind: editPostKind,
          post_meta,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert((err as { detail?: string }).detail ?? "Failed to update");
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
      setTotal((t) => Math.max(0, t - 1));
    } finally {
      setDeletingId(null);
    }
  }

  const channelName = (id: string) => channels.find((c) => c.id === id)?.name ?? id;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIdx = total === 0 ? 0 : page * pageSize + 1;
  const endIdx = page * pageSize + items.length;

  function kindBadge(k: string) {
    const label = k || "text";
    if (label === "photo")
      return (
        <Badge variant="outline" className="text-xs gap-1">
          <ImageIcon className="h-3 w-3" /> photo
        </Badge>
      );
    if (label === "poll")
      return (
        <Badge variant="outline" className="text-xs gap-1">
          <ListOrdered className="h-3 w-3" /> poll
        </Badge>
      );
    return (
      <Badge variant="outline" className="text-xs gap-1">
        <Type className="h-3 w-3" /> text
      </Badge>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calendar className="h-6 w-6" />
            Content Calendar
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Schedule text, one image (HTTPS URL), or polls. Celery sends at the scheduled time.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            className="gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-md border-none"
            onClick={() => {
              setShowAdd(false);
              setShowAiBulk(true);
            }}
          >
            <Sparkles className="h-4 w-4" />
            AI Bulk Generate
          </Button>
          <Button
            size="sm"
            className="gap-2"
            onClick={() => {
              setShowAiBulk(false);
              setShowAdd(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Schedule post
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Label className="text-xs">Status</Label>
            <select
              className="w-full mt-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="sent">Sent</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <Label className="text-xs">Channel</Label>
            <select
              className="w-full mt-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
            >
              <option value="">All channels</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">Page size</Label>
            <select
              className="w-full mt-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value) as (typeof PAGE_SIZES)[number])}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n} per page
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">Scheduled from (local)</Label>
            <Input
              type="datetime-local"
              className="mt-1"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Scheduled to (local)</Label>
            <Input
              type="datetime-local"
              className="mt-1"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                setFilterFrom("");
                setFilterTo("");
                setStatusFilter("");
                setChannelFilter("");
              }}
            >
              Clear filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {showAdd && (
        <Card className="animate-in fade-in slide-in-from-top-4 duration-300">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Schedule new post</CardTitle>
            <Button variant="ghost" size="icon" onClick={() => setShowAdd(false)}>
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {(["text", "photo", "poll"] as const).map((k) => (
                  <Button
                    key={k}
                    type="button"
                    size="sm"
                    variant={postKind === k ? "default" : "outline"}
                    onClick={() => setPostKind(k)}
                  >
                    {k}
                  </Button>
                ))}
              </div>
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
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              {postKind === "photo" && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Image from your computer (stored in S3)</Label>
                    <input
                      ref={addPhotoFileRef}
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      className="hidden"
                      onChange={handleAddPhotoFileSelected}
                    />
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="gap-2"
                        disabled={photoUploading}
                        onClick={() => addPhotoFileRef.current?.click()}
                      >
                        {photoUploading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Upload className="h-4 w-4" />
                        )}
                        {photoUploading ? "Uploading…" : "Choose image"}
                      </Button>
                      <span className="text-xs text-muted-foreground">JPEG, PNG, GIF, WebP · max 5 MB</span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Or paste image URL (HTTPS)</Label>
                    <Input
                      className="mt-1"
                      value={addForm.photoUrl}
                      onChange={(e) => setAddForm((p) => ({ ...p, photoUrl: e.target.value }))}
                      placeholder="https://…"
                    />
                  </div>
                  {addForm.photoUrl.startsWith("https://") ? (
                    <div className="rounded-md border border-border overflow-hidden max-w-xs bg-muted/30">
                      <img
                        src={addForm.photoUrl}
                        alt="Preview"
                        className="max-h-40 w-full object-contain"
                      />
                    </div>
                  ) : null}
                </div>
              )}
              {postKind === "poll" && (
                <>
                  <div>
                    <Label className="text-xs">Poll question</Label>
                    <Input
                      className="mt-1"
                      value={addForm.pollQuestion}
                      onChange={(e) => setAddForm((p) => ({ ...p, pollQuestion: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Options (2–10)</Label>
                    {pollOptions.map((opt, i) => (
                      <Input
                        key={i}
                        value={opt}
                        onChange={(e) => {
                          const next = [...pollOptions];
                          next[i] = e.target.value;
                          setPollOptions(next);
                        }}
                        placeholder={`Option ${i + 1}`}
                      />
                    ))}
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={pollOptions.length >= 10}
                        onClick={() => setPollOptions([...pollOptions, ""])}
                      >
                        Add option
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={pollOptions.length <= 2}
                        onClick={() => setPollOptions(pollOptions.slice(0, -1))}
                      >
                        Remove last
                      </Button>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={addForm.pollAnonymous}
                      onChange={(e) => setAddForm((p) => ({ ...p, pollAnonymous: e.target.checked }))}
                    />
                    Anonymous voters
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={addForm.pollMultiple}
                      onChange={(e) => setAddForm((p) => ({ ...p, pollMultiple: e.target.checked }))}
                    />
                    Allow multiple answers
                  </label>
                </>
              )}
              <div>
                <Label className="text-xs">
                  {postKind === "photo" ? "Caption (optional, max 1024 chars)" : postKind === "poll" ? "Extra note (optional, not sent)" : "Content"}
                </Label>
                <Input
                  className="mt-1"
                  value={addForm.content}
                  onChange={(e) => setAddForm((p) => ({ ...p, content: e.target.value }))}
                  placeholder={postKind === "text" ? "Post text..." : "Caption or note..."}
                  required={postKind === "text"}
                />
              </div>
              <div>
                <Label className="text-xs">Scheduled at (local)</Label>
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

      {showAiBulk && (
        <Card className="border-purple-200 dark:border-purple-900 bg-purple-50/30 dark:bg-purple-900/10 shadow-sm animate-in fade-in slide-in-from-top-4 duration-300">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2 font-semibold text-purple-700 dark:text-purple-400">
              <Sparkles className="h-5 w-5 text-purple-500" /> AI Bulk Generate Content
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={() => setShowAiBulk(false)}>
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAiBulkGenerate} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <Label className="text-xs font-medium text-purple-700 dark:text-purple-300">Channel</Label>
                  <select
                    className="w-full mt-1 h-9 rounded-md border border-purple-200 bg-background px-3 text-sm focus:ring-purple-500 focus:border-purple-500 dark:border-purple-800"
                    value={aiForm.channelId}
                    onChange={(e) => setAiForm((p) => ({ ...p, channelId: e.target.value }))}
                    required
                  >
                    <option value="">Select channel</option>
                    {channels.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs font-medium text-purple-700 dark:text-purple-300">AI API profile</Label>
                  <select
                    className="w-full mt-1 h-9 rounded-md border border-purple-200 bg-background px-3 text-sm focus:ring-purple-500 focus:border-purple-500 dark:border-purple-800"
                    value={aiForm.aiConfigId}
                    onChange={(e) => setAiForm((p) => ({ ...p, aiConfigId: e.target.value }))}
                    required
                  >
                    <option value="">Select profile (from Channels page)</option>
                    {aiConfigs.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.is_default ? " (default)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs font-medium text-purple-700 dark:text-purple-300">Total Posts (Days)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="60"
                    className="mt-1 border-purple-200 focus-visible:ring-purple-500 dark:border-purple-800"
                    value={aiForm.days}
                    onChange={(e) => setAiForm((p) => ({ ...p, days: e.target.value }))}
                    required
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs font-medium text-purple-700 dark:text-purple-300">Topic Focus</Label>
                <Input
                  className="mt-1 border-purple-200 focus-visible:ring-purple-500 dark:border-purple-800"
                  value={aiForm.topic}
                  onChange={(e) => setAiForm((p) => ({ ...p, topic: e.target.value }))}
                  placeholder="e.g. Gold Trading tips, motivation, market analysis"
                  required
                />
              </div>
              <Button
                type="submit"
                disabled={generating}
                className="gap-2 w-full sm:w-auto bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-md"
              >
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {generating ? "Generating via AI..." : "Generate & Schedule Now"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Scheduled posts</CardTitle>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>
              {total === 0 ? "0" : `${startIdx}–${endIdx}`} of {total}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page <= 0 || loading}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs tabular-nums">
              {page + 1} / {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page + 1 >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No scheduled posts match your filters.
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.id} className="rounded-lg border border-border bg-muted/20 p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="text-xs">
                          {channelName(item.channel_id)}
                        </Badge>
                        {kindBadge(item.post_kind)}
                        <Badge
                          variant={
                            item.status === "pending"
                              ? "default"
                              : item.status === "sent"
                                ? "outline"
                                : "secondary"
                          }
                          className="text-xs"
                        >
                          {item.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(item.scheduled_at).toLocaleString()}
                        </span>
                      </div>
                      {item.post_kind === "photo" && item.post_meta?.photo_url ? (
                        <a
                          href={String(item.post_meta.photo_url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 text-xs text-primary underline break-all block"
                        >
                          {String(item.post_meta.photo_url)}
                        </a>
                      ) : null}
                      {item.post_kind === "poll" && item.post_meta?.question ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Q: {String(item.post_meta.question)}
                          {Array.isArray(item.post_meta.options) ? (
                            <span className="block mt-1">
                              ({item.post_meta.options.length} options)
                            </span>
                          ) : null}
                        </p>
                      ) : null}
                      {editId === item.id ? (
                        <div className="mt-2 space-y-3">
                          <div className="flex flex-wrap gap-2">
                            {(["text", "photo", "poll"] as const).map((k) => (
                              <Button
                                key={k}
                                type="button"
                                size="sm"
                                variant={editPostKind === k ? "default" : "outline"}
                                onClick={() => setEditPostKind(k)}
                              >
                                {k}
                              </Button>
                            ))}
                          </div>
                          {editPostKind === "photo" && (
                            <div className="space-y-2">
                              <input
                                ref={editPhotoFileRef}
                                type="file"
                                accept="image/jpeg,image/png,image/gif,image/webp"
                                className="hidden"
                                onChange={handleEditPhotoFileSelected}
                              />
                              <div className="flex flex-wrap items-center gap-2">
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  className="gap-1"
                                  disabled={editPhotoUploading}
                                  onClick={() => editPhotoFileRef.current?.click()}
                                >
                                  {editPhotoUploading ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Upload className="h-3.5 w-3.5" />
                                  )}
                                  {editPhotoUploading ? "Uploading…" : "Upload to S3"}
                                </Button>
                              </div>
                              <Input
                                value={editPhotoUrl}
                                onChange={(e) => setEditPhotoUrl(e.target.value)}
                                placeholder="https://… or upload above"
                                className="text-sm"
                              />
                              {editPhotoUrl.startsWith("https://") ? (
                                <div className="rounded-md border border-border overflow-hidden max-w-xs bg-muted/30">
                                  <img
                                    src={editPhotoUrl}
                                    alt="Preview"
                                    className="max-h-32 w-full object-contain"
                                  />
                                </div>
                              ) : null}
                            </div>
                          )}
                          {editPostKind === "poll" && (
                            <>
                              <Input
                                value={editPollQuestion}
                                onChange={(e) => setEditPollQuestion(e.target.value)}
                                placeholder="Question"
                                className="text-sm"
                              />
                              {editPollOptions.map((opt, i) => (
                                <Input
                                  key={i}
                                  value={opt}
                                  onChange={(e) => {
                                    const n = [...editPollOptions];
                                    n[i] = e.target.value;
                                    setEditPollOptions(n);
                                  }}
                                  placeholder={`Option ${i + 1}`}
                                  className="text-sm"
                                />
                              ))}
                              <div className="flex gap-4 text-xs">
                                <label className="flex items-center gap-1">
                                  <input
                                    type="checkbox"
                                    checked={editPollAnonymous}
                                    onChange={(e) => setEditPollAnonymous(e.target.checked)}
                                  />
                                  Anonymous
                                </label>
                                <label className="flex items-center gap-1">
                                  <input
                                    type="checkbox"
                                    checked={editPollMultiple}
                                    onChange={(e) => setEditPollMultiple(e.target.checked)}
                                  />
                                  Multiple answers
                                </label>
                              </div>
                            </>
                          )}
                          <Input
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            className="font-mono text-sm"
                            placeholder={editPostKind === "photo" ? "Caption" : "Content"}
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
                            <Button variant="ghost" size="sm" onClick={() => setEditId(null)}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-1 text-sm whitespace-pre-wrap break-words">{item.content || "—"}</p>
                      )}
                      {item.error ? <p className="mt-1 text-xs text-destructive">{item.error}</p> : null}
                    </div>
                    {editId !== item.id && (
                      <div className="flex gap-2 shrink-0">
                        {item.status === "pending" && (
                          <Button variant="ghost" size="sm" className="text-xs" onClick={() => openEdit(item)}>
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
                            {deletingId === item.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
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
