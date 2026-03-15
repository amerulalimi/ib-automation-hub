"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Plus,
  Trash2,
  Radio,
  CheckCircle2,
  XCircle,
  Loader2,
  Send,
  KeyRound,
  Eye,
  EyeOff,
  Save,
  X,
  ShieldCheck,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

const LANGUAGE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Auto / Not set" },
  { value: "en", label: "English (en)" },
  { value: "ms", label: "Malay (ms)" },
  { value: "id", label: "Indonesian (id)" },
  { value: "zh", label: "Chinese (zh)" },
  { value: "ar", label: "Arabic (ar)" },
];

const TIMEZONE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "UTC", label: "UTC" },
  { value: "Asia/Kuala_Lumpur", label: "Asia/Kuala_Lumpur" },
  { value: "Asia/Singapore", label: "Asia/Singapore" },
  { value: "Asia/Jakarta", label: "Asia/Jakarta" },
  { value: "Asia/Bangkok", label: "Asia/Bangkok" },
  { value: "Asia/Manila", label: "Asia/Manila" },
  { value: "Europe/London", label: "Europe/London" },
  { value: "America/New_York", label: "America/New_York" },
];

interface Channel {
  id: string;
  name: string;
  platform: string;
  token_hint: string;
  chat_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  target_language?: string | null;
  timezone?: string | null;
  broker_info?: Record<string, unknown> | null;
  ai_auto_reply?: boolean;
}

interface AddFormState {
  name: string;
  botToken: string;
  chatId: string;
  targetLanguage: string;
  timezone: string;
  brokerName: string;
  aiAutoReply: boolean;
}

interface TokenEditState {
  channelId: string;
  newToken: string;
  showToken: boolean;
  saving: boolean;
  error: string | null;
}

interface EditModalState {
  channelId: string;
  name: string;
  chatIdDigits: string;
  targetLanguage: string;
  timezone: string;
  brokerName: string;
  aiAutoReply: boolean;
  newBotToken: string;
  showBotToken: boolean;
  saving: boolean;
  error: string | null;
}

const EMPTY_FORM: AddFormState = {
  name: "",
  botToken: "",
  chatId: "",
  targetLanguage: "",
  timezone: "UTC",
  brokerName: "",
  aiAutoReply: false,
};

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<AddFormState>(EMPTY_FORM);
  const [showNewToken, setShowNewToken] = useState(false);
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<
    Record<string, { ok: boolean; error?: string }>
  >({});
  const [tokenEdit, setTokenEdit] = useState<TokenEditState | null>(null);
  const [editModal, setEditModal] = useState<EditModalState | null>(null);

  async function fetchChannels() {
    const res = await fetch(`${BACKEND}/api/channels`, { credentials: "include" });
    const data = await res.json();
    setChannels(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    fetchChannels().finally(() => setLoading(false));
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const chatIdDigits = form.chatId.replace(/\D/g, "").trim();
    if (!form.name.trim() || !form.botToken.trim() || !chatIdDigits) {
      setFormError("All fields are required.");
      return;
    }

    setAdding(true);
    const tId = toast.loading("Adding channel...");
    try {
      const res = await fetch(`${BACKEND}/api/channels`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          bot_token: form.botToken.trim(),
          chat_id: `-${chatIdDigits}`,
          platform: "telegram",
          target_language: form.targetLanguage.trim() || undefined,
          timezone: form.timezone.trim() || undefined,
          broker_info: form.brokerName.trim() ? { name: form.brokerName.trim() } : undefined,
          ai_auto_reply: form.aiAutoReply,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setFormError(err.detail ?? err.error ?? "Failed to add channel.");
        toast.error(err.detail ?? err.error ?? "Failed to add channel.", { id: tId });
        return;
      }

      setForm(EMPTY_FORM);
      setShowNewToken(false);
      const newChannel = await res.json();
      setChannels((prev) => [newChannel, ...prev]);
      toast.success("Channel added.", { id: tId });
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    const tId = toast.loading("Deleting channel...");
    try {
      const res = await fetch(`${BACKEND}/api/channels/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail ?? err.error ?? "Failed to delete channel.", { id: tId });
        return;
      }
      setChannels((prev) => prev.filter((c) => c.id !== id));
      setTestResults((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
      if (tokenEdit?.channelId === id) setTokenEdit(null);
      if (editModal?.channelId === id) setEditModal(null);
      toast.success("Channel deleted.", { id: tId });
    } finally {
      setDeletingId(null);
    }
  }

  async function handleToggle(channel: Channel) {
    setTogglingId(channel.id);
    const tId = toast.loading(channel.is_active ? "Pausing channel..." : "Activating channel...");
    try {
      const res = await fetch(`${BACKEND}/api/channels/${channel.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !channel.is_active }),
      });
      if (res.ok) {
        const updated = await res.json();
        setChannels((prev) =>
          prev.map((c) => (c.id === channel.id ? updated : c))
        );
        toast.success(updated.is_active ? "Channel activated." : "Channel paused.", { id: tId });
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail ?? err.error ?? "Failed to update channel.", { id: tId });
      }
    } finally {
      setTogglingId(null);
    }
  }

  async function handleTest(id: string) {
    setTestingId(id);
    setTestResults((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
    const tId = toast.loading("Sending test message...");
    try {
      const res = await fetch(`${BACKEND}/api/channels/${id}/test`, { method: "POST", credentials: "include" });
      const data = await res.json();
      setTestResults((prev) => ({ ...prev, [id]: data }));
      if (data?.ok) toast.success("Test message sent.", { id: tId });
      else toast.error(data?.error ?? "Test failed.", { id: tId });
    } finally {
      setTestingId(null);
    }
  }

  async function handleSaveEdit() {
    if (!editModal) return;
    const chatDigits = editModal.chatIdDigits.replace(/\D/g, "").trim();
    if (!editModal.name.trim() || !chatDigits) {
      setEditModal((p) => p && { ...p, error: "Name and Chat ID are required." });
      return;
    }
    setEditModal((p) => p && { ...p, saving: true, error: null });
    const tId = toast.loading("Updating channel...");
    try {
      const body: Record<string, unknown> = {
        name: editModal.name.trim(),
        chat_id: `-${chatDigits}`,
        target_language: editModal.targetLanguage.trim() || null,
        timezone: editModal.timezone.trim() || null,
        ai_auto_reply: editModal.aiAutoReply,
      };
      if (editModal.newBotToken.trim()) {
        body.bot_token = editModal.newBotToken.trim();
      }
      body.broker_info = editModal.brokerName.trim()
        ? { name: editModal.brokerName.trim() }
        : null;
      const res = await fetch(`${BACKEND}/api/channels/${editModal.channelId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        setEditModal((p) => p && { ...p, error: err.detail ?? err.error ?? "Failed to update.", saving: false });
        toast.error(err.detail ?? err.error ?? "Failed to update.", { id: tId });
        return;
      }
      const updated = await res.json();
      setChannels((prev) => prev.map((c) => (c.id === editModal.channelId ? updated : c)));
      setEditModal(null);
      toast.success("Channel updated.", { id: tId });
    } catch {
      setEditModal((p) => p && { ...p, error: "Network error.", saving: false });
      toast.error("Network error.", { id: tId });
    } finally {
      setEditModal((p) => p && { ...p, saving: false });
    }
  }

  async function handleUpdateToken() {
    if (!tokenEdit) return;
    if (!tokenEdit.newToken.trim()) {
      setTokenEdit((p) => p && { ...p, error: "Token cannot be empty." });
      return;
    }

    setTokenEdit((p) => p && { ...p, saving: true, error: null });
    const tId = toast.loading("Updating bot token...");
    try {
      const res = await fetch(`${BACKEND}/api/channels/${tokenEdit.channelId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bot_token: tokenEdit.newToken.trim() }),
      });

      if (!res.ok) {
        const err = await res.json();
        setTokenEdit((p) => p && { ...p, error: err.detail ?? err.error ?? "Failed to update token.", saving: false });
        toast.error(err.detail ?? err.error ?? "Failed to update token.", { id: tId });
        return;
      }

      const updated = await res.json();
      setChannels((prev) =>
        prev.map((c) => (c.id === tokenEdit.channelId ? updated : c))
      );
      setTokenEdit(null);
      toast.success("Bot token updated.", { id: tId });
    } catch {
      setTokenEdit((p) => p && { ...p, error: "Network error.", saving: false });
      toast.error("Network error.", { id: tId });
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Channel Management</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Bot tokens are encrypted with AES-256-GCM before storage and decrypted only at send time.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add New Channel
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAdd} className="space-y-4" autoComplete="off">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Channel Name</Label>
                <Input
                  id="name"
                  name="channelName"
                  autoComplete="off"
                  placeholder="e.g. VIP Signals Group"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="chatId">Chat ID</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-sm select-none">
                    -
                  </span>
                  <Input
                    id="chatId"
                    name="telegramChatId"
                    autoComplete="off"
                    inputMode="numeric"
                    placeholder="100123456789"
                    value={form.chatId}
                    onChange={(e) => {
                      const digitsOnly = e.target.value.replace(/\\D/g, "");
                      setForm((p) => ({ ...p, chatId: digitsOnly }));
                    }}
                    className="pl-7 font-mono text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="targetLanguage">Target language (e.g. en, Malay)</Label>
                <select
                  id="targetLanguage"
                  className="w-full mt-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={form.targetLanguage}
                  onChange={(e) => setForm((p) => ({ ...p, targetLanguage: e.target.value }))}
                >
                  {LANGUAGE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="timezone">Timezone (IANA)</Label>
                <select
                  id="timezone"
                  className="w-full mt-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={form.timezone}
                  onChange={(e) => setForm((p) => ({ ...p, timezone: e.target.value }))}
                >
                  {TIMEZONE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brokerName">Broker name (optional)</Label>
              <Input
                id="brokerName"
                placeholder="Broker X"
                value={form.brokerName}
                onChange={(e) => setForm((p) => ({ ...p, brokerName: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="aiAutoReply"
                checked={form.aiAutoReply}
                onChange={(e) => setForm((p) => ({ ...p, aiAutoReply: e.target.checked }))}
                className="rounded border-border"
              />
              <Label htmlFor="aiAutoReply">AI Auto-Reply enabled for this channel</Label>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="botToken">
                Bot Token
                <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
                  <ShieldCheck className="h-3 w-3 text-emerald-400" />
                  Encrypted with AES-256-GCM before saving
                </span>
              </Label>
              <div className="relative">
                <Input
                  id="botToken"
                  name="telegramBotToken"
                  autoComplete="new-password"
                  type={showNewToken ? "text" : "password"}
                  placeholder="123456:ABCDefGhIJKlmNoPQRstuVwxyz"
                  value={form.botToken}
                  onChange={(e) => setForm((p) => ({ ...p, botToken: e.target.value }))}
                  className="pr-10 font-mono text-sm"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowNewToken((v) => !v)}
                  tabIndex={-1}
                >
                  {showNewToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {formError && (
              <p className="text-sm text-destructive flex items-center gap-1.5">
                <XCircle className="h-4 w-4 shrink-0" />
                {formError}
              </p>
            )}

            <Button type="submit" disabled={adding} className="gap-2">
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add Channel
            </Button>
          </form>

          <Separator className="my-5" />

          <div className="space-y-1 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">How to get your credentials:</p>
            <p>1. Message <span className="font-mono bg-muted px-1 rounded">@BotFather</span> on Telegram to create a bot and get the token.</p>
            <p>2. Add the bot to your group/channel as an admin.</p>
            <p>3. Use <span className="font-mono bg-muted px-1 rounded">@userinfobot</span> or the Telegram API to find the Chat ID.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Radio className="h-4 w-4" />
            Target Channels
            <Badge variant="secondary" className="ml-auto">
              {channels.filter((c) => c.is_active).length} active / {channels.length} total
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : channels.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No channels configured yet. Add one above.
            </div>
          ) : (
            <div className="space-y-3">
              {channels.map((channel) => {
                const testResult = testResults[channel.id];
                const isEditingToken = tokenEdit?.channelId === channel.id;

                return (
                  <div key={channel.id} className="rounded-lg border border-border bg-muted/20 overflow-hidden">
                    <div className="p-4">
                      <div className="flex items-start gap-3 flex-wrap">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <span className={`h-2.5 w-2.5 rounded-full shrink-0 mt-0.5 transition-colors ${channel.is_active ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" : "bg-muted-foreground"}`} />
                          <div className="min-w-0">
                            <p className="font-semibold text-sm truncate">{channel.name}</p>
                            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                              <span className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                                <KeyRound className="h-3 w-3" />
                                <span>{"••••••••••••••••"}<span className="text-foreground font-medium">{channel.token_hint}</span></span>
                              </span>
                              <span className="text-xs text-muted-foreground font-mono">ID: {channel.chat_id}</span>
                              {channel.target_language && <span className="text-xs text-muted-foreground">Lang: {channel.target_language}</span>}
                              {channel.ai_auto_reply && <Badge variant="outline" className="text-xs">AI Reply</Badge>}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap shrink-0">
                          <Badge variant={channel.is_active ? "default" : "secondary"} className="text-xs">
                            {channel.is_active ? "Active" : "Paused"}
                          </Badge>

                          {testResult && (
                            <span className={`text-xs flex items-center gap-1 ${testResult.ok ? "text-emerald-400" : "text-destructive"}`}>
                              {testResult.ok ? <><CheckCircle2 className="h-3.5 w-3.5" />OK</> : <><XCircle className="h-3.5 w-3.5" />{testResult.error ?? "Failed"}</>}
                            </span>
                          )}

                          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => handleTest(channel.id)} disabled={testingId === channel.id || !channel.is_active}>
                            {testingId === channel.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                            Test
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => {
                              const brokerName =
                                channel.broker_info &&
                                typeof channel.broker_info === "object" &&
                                "name" in channel.broker_info &&
                                typeof (channel.broker_info as { name?: unknown }).name === "string"
                                  ? ((channel.broker_info as { name: string }).name ?? "")
                                  : "";
                              setEditModal({
                                channelId: channel.id,
                                name: channel.name ?? "",
                                chatIdDigits: (channel.chat_id ?? "").replace(/\D/g, ""),
                                targetLanguage: channel.target_language ?? "",
                                timezone: channel.timezone ?? "UTC",
                                brokerName,
                                aiAutoReply: channel.ai_auto_reply ?? false,
                                newBotToken: "",
                                showBotToken: false,
                                saving: false,
                                error: null,
                              });
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </Button>

                          <Button variant="ghost" size="sm" className={`h-8 gap-1.5 text-xs ${isEditingToken ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                            onClick={() => setTokenEdit(isEditingToken ? null : { channelId: channel.id, newToken: "", showToken: false, saving: false, error: null })}>
                            <KeyRound className="h-3.5 w-3.5" />
                            {isEditingToken ? "Cancel" : "Token"}
                          </Button>

                          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground" onClick={() => handleToggle(channel)} disabled={togglingId === channel.id}>
                            {togglingId === channel.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : channel.is_active ? <span className="text-emerald-400 font-medium">ON</span> : <span className="text-muted-foreground font-medium">OFF</span>}
                          </Button>

                          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive" onClick={() => handleDelete(channel.id)} disabled={deletingId === channel.id}>
                            {deletingId === channel.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </div>
                    </div>

                    {isEditingToken && tokenEdit && (
                      <div className="border-t border-border bg-muted/30 px-4 py-3">
                        <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                          Update Bot Token — will be re-encrypted with AES-256-GCM
                        </p>
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <Input type={tokenEdit.showToken ? "text" : "password"} placeholder="Paste new bot token..." value={tokenEdit.newToken}
                              onChange={(e) => setTokenEdit((p) => p ? { ...p, newToken: e.target.value, error: null } : p)}
                              className="pr-9 font-mono text-xs h-9" autoFocus />
                            <button type="button" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              onClick={() => setTokenEdit((p) => p ? { ...p, showToken: !p.showToken } : p)}>
                              {tokenEdit.showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                          <Button size="sm" className="h-9 gap-1.5 text-xs" onClick={handleUpdateToken} disabled={tokenEdit.saving || !tokenEdit.newToken.trim()}>
                            {tokenEdit.saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                            Save
                          </Button>
                          <Button variant="ghost" size="sm" className="h-9 px-2" onClick={() => setTokenEdit(null)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        {tokenEdit.error && (
                          <p className="mt-2 text-xs text-destructive flex items-center gap-1">
                            <XCircle className="h-3.5 w-3.5" />
                            {tokenEdit.error}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {editModal && (
        <div
          className="fixed inset-0 z-60 bg-black/60 flex items-center justify-center p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setEditModal(null);
          }}
        >
          <div className="w-full max-w-lg rounded-xl border border-border bg-card text-foreground shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <p className="text-sm font-semibold">Edit channel</p>
                <p className="text-xs text-muted-foreground">Update destination details and settings.</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setEditModal(null)} disabled={editModal.saving}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Channel name</Label>
                  <Input
                    value={editModal.name}
                    onChange={(e) => setEditModal((p) => (p ? { ...p, name: e.target.value, error: null } : p))}
                    placeholder="VIP Signals Group"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Chat ID</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-sm select-none">-</span>
                    <Input
                      value={editModal.chatIdDigits}
                      onChange={(e) => {
                        const digitsOnly = e.target.value.replace(/\D/g, "");
                        setEditModal((p) => (p ? { ...p, chatIdDigits: digitsOnly, error: null } : p));
                      }}
                      inputMode="numeric"
                      placeholder="1003840556608"
                      className="pl-7 font-mono text-sm"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Bot Token (optional)</Label>
                <div className="relative">
                  <Input
                    type={editModal.showBotToken ? "text" : "password"}
                    value={editModal.newBotToken}
                    onChange={(e) =>
                      setEditModal((p) =>
                        p ? { ...p, newBotToken: e.target.value, error: null } : p,
                      )
                    }
                    placeholder="Paste new bot token to rotate, or leave empty"
                    className="pr-9 font-mono text-xs"
                  />
                  <button
                    type="button"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() =>
                      setEditModal((p) =>
                        p ? { ...p, showBotToken: !p.showBotToken } : p,
                      )
                    }
                  >
                    {editModal.showBotToken ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Leave this blank to keep the current token.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Target language</Label>
                  <select
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={editModal.targetLanguage}
                    onChange={(e) => setEditModal((p) => (p ? { ...p, targetLanguage: e.target.value, error: null } : p))}
                  >
                    {LANGUAGE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Timezone</Label>
                  <select
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={editModal.timezone}
                    onChange={(e) => setEditModal((p) => (p ? { ...p, timezone: e.target.value, error: null } : p))}
                  >
                    {TIMEZONE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Broker name</Label>
                <Input
                  value={editModal.brokerName}
                  onChange={(e) => setEditModal((p) => (p ? { ...p, brokerName: e.target.value, error: null } : p))}
                  placeholder="Broker X"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="editAiReply"
                  checked={editModal.aiAutoReply}
                  onChange={(e) => setEditModal((p) => (p ? { ...p, aiAutoReply: e.target.checked, error: null } : p))}
                  className="rounded border-border"
                />
                <Label htmlFor="editAiReply" className="text-sm">AI Auto-Reply</Label>
              </div>

              {editModal.error && <p className="text-sm text-destructive">{editModal.error}</p>}

              <div className="flex gap-2 justify-end pt-1">
                <Button variant="ghost" onClick={() => setEditModal(null)} disabled={editModal.saving}>
                  Cancel
                </Button>
                <Button onClick={handleSaveEdit} disabled={editModal.saving}>
                  {editModal.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  <span className="ml-2">Save</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
