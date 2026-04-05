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
  BrainCircuit,
} from "lucide-react";
import { toast } from "sonner";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

/** Matches backend placeholder when no bot token saved yet */
const TOKEN_HINT_PENDING = "NONE";

function getChannelBrokerName(channel: Channel): string {
  const bi = channel.broker_info;
  if (bi && typeof bi === "object" && "name" in bi && typeof (bi as { name?: unknown }).name === "string") {
    return ((bi as { name: string }).name ?? "").trim();
  }
  return "";
}

function channelHasRealBotToken(channel: Channel): boolean {
  return channel.token_hint !== TOKEN_HINT_PENDING;
}

function channelReadyToActivate(channel: Channel): boolean {
  return channelHasRealBotToken(channel) && getChannelBrokerName(channel).length > 0;
}

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

interface AIApiConfig {
  id: string;
  name: string;
  provider: string;
  base_url: string | null;
  api_key_hint: string;
  is_default: boolean;
  created_at: string | null;
  updated_at: string | null;
}

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
  ai_api_config_id?: string | null;
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
  aiApiConfigId: string;
  newBotToken: string;
  showBotToken: boolean;
  saving: boolean;
  error: string | null;
}

interface PersonaModalState {
  channelId: string;
  channelName: string;
  personaId: string | null;
  name: string;
  tone: string;
  knowledgeBase: string;
  loading: boolean;
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
  const [personaModal, setPersonaModal] = useState<PersonaModalState | null>(null);
  const [aiConfigs, setAiConfigs] = useState<AIApiConfig[]>([]);
  const [aiConfigsLoading, setAiConfigsLoading] = useState(true);
  const [aiCfgForm, setAiCfgForm] = useState({
    name: "",
    apiKey: "",
    baseUrl: "",
    isDefault: false,
  });
  const [aiCfgAdding, setAiCfgAdding] = useState(false);
  const [aiCfgTestingId, setAiCfgTestingId] = useState<string | null>(null);
  const [aiCfgDeletingId, setAiCfgDeletingId] = useState<string | null>(null);

  async function fetchChannels() {
    const res = await fetch(`${BACKEND}/api/channels`, { credentials: "include" });
    const data = await res.json();
    setChannels(Array.isArray(data) ? data : []);
  }

  async function fetchAiConfigs() {
    const res = await fetch(`${BACKEND}/api/ai-configs`, { credentials: "include" });
    const data = await res.json();
    setAiConfigs(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    Promise.all([fetchChannels(), fetchAiConfigs()]).finally(() => {
      setLoading(false);
      setAiConfigsLoading(false);
    });
  }, []);

  async function handleAddAiConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!aiCfgForm.name.trim() || !aiCfgForm.apiKey.trim()) {
      toast.error("Name and API key are required.");
      return;
    }
    setAiCfgAdding(true);
    const tId = toast.loading("Saving AI configuration...");
    try {
      const res = await fetch(`${BACKEND}/api/ai-configs`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: aiCfgForm.name.trim(),
          api_key: aiCfgForm.apiKey.trim(),
          provider: "openai",
          base_url: aiCfgForm.baseUrl.trim() || undefined,
          is_default: aiCfgForm.isDefault,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail ?? "Failed to save.", { id: tId });
        return;
      }
      setAiCfgForm({ name: "", apiKey: "", baseUrl: "", isDefault: false });
      await fetchAiConfigs();
      toast.success("AI configuration saved (encrypted).", { id: tId });
    } finally {
      setAiCfgAdding(false);
    }
  }

  async function handleTestAiConfig(id: string) {
    setAiCfgTestingId(id);
    const tId = toast.loading("Testing OpenAI connection...");
    try {
      const res = await fetch(`${BACKEND}/api/ai-configs/${id}/test`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (data?.ok) {
        toast.success(data.model_sample ? `OK — sample model: ${data.model_sample}` : "Connection OK.", { id: tId });
      } else {
        toast.error(data?.error ?? "Test failed.", { id: tId });
      }
    } finally {
      setAiCfgTestingId(null);
    }
  }

  async function handleDeleteAiConfig(id: string) {
    setAiCfgDeletingId(id);
    const tId = toast.loading("Deleting...");
    try {
      const res = await fetch(`${BACKEND}/api/ai-configs/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail ?? "Delete failed.", { id: tId });
        return;
      }
      await fetchAiConfigs();
      await fetchChannels();
      toast.success("AI configuration removed.", { id: tId });
    } finally {
      setAiCfgDeletingId(null);
    }
  }

  async function handleSetDefaultAiConfig(id: string) {
    const tId = toast.loading("Updating default...");
    try {
      const res = await fetch(`${BACKEND}/api/ai-configs/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_default: true }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail ?? "Failed.", { id: tId });
        return;
      }
      await fetchAiConfigs();
      toast.success("Default profile updated.", { id: tId });
    } catch {
      toast.error("Network error.", { id: tId });
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const chatIdDigits = form.chatId.replace(/\D/g, "").trim();
    if (!form.name.trim() || !chatIdDigits) {
      setFormError("Channel name and Chat ID are required.");
      return;
    }

    setAdding(true);
    const tId = toast.loading("Adding channel...");
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        chat_id: `-${chatIdDigits}`,
        platform: "telegram",
        target_language: form.targetLanguage.trim() || undefined,
        timezone: form.timezone.trim() || undefined,
        broker_info: form.brokerName.trim() ? { name: form.brokerName.trim() } : undefined,
        ai_auto_reply: form.aiAutoReply,
      };
      if (form.botToken.trim()) {
        payload.bot_token = form.botToken.trim();
      }
      const res = await fetch(`${BACKEND}/api/channels`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
      const needSetup = !channelReadyToActivate(newChannel);
      toast.success(needSetup ? "Channel added (paused)." : "Channel added.", {
        id: tId,
        description: needSetup
          ? "Broker name and bot token are required before you can activate. Use Edit and Token on the row below."
          : undefined,
        duration: needSetup ? 6000 : 4000,
      });
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
    if (!channel.is_active && !channelReadyToActivate(channel)) {
      const missing: string[] = [];
      if (!channelHasRealBotToken(channel)) missing.push("bot token");
      if (!getChannelBrokerName(channel)) missing.push("broker name");
      const label =
        missing.length === 2
          ? "Bot token and broker name are not set yet"
          : missing[0] === "bot token"
            ? "Bot token is not set yet"
            : "Broker name is not set yet";
      toast.error(
        `${label}. Complete setup in Edit (broker name) or Token (bot token), then activate.`,
        { duration: 6500 }
      );
      return;
    }

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
      body.ai_api_config_id = editModal.aiApiConfigId.trim() || "";
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
      setEditModal((p: EditModalState | null) => p && { ...p, error: "Network error.", saving: false });
      toast.error("Network error.", { id: tId });
    } finally {
      setEditModal((p: EditModalState | null) => p && { ...p, saving: false });
    }
  }

  async function handleUpdateToken() {
    if (!tokenEdit) return;
    if (!tokenEdit.newToken.trim()) {
      setTokenEdit((p: TokenEditState | null) => p && { ...p, error: "Token cannot be empty." });
      return;
    }

    setTokenEdit((p: TokenEditState | null) => p && { ...p, saving: true, error: null });
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
        setTokenEdit((p: TokenEditState | null) => p && { ...p, error: err.detail ?? err.error ?? "Failed to update token.", saving: false });
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
      setTokenEdit((p: TokenEditState | null) => p && { ...p, error: "Network error.", saving: false });
      toast.error("Network error.", { id: tId });
    }
  }

  async function handleOpenPersona(channel: Channel) {
    setPersonaModal({
      channelId: channel.id,
      channelName: channel.name,
      personaId: null,
      name: "",
      tone: "helpful",
      knowledgeBase: "",
      loading: true,
      saving: false,
      error: null,
    });

    try {
      const res = await fetch(`${BACKEND}/api/ai/personas/${channel.id}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (data) {
          setPersonaModal((p: PersonaModalState | null) => p && {
            ...p,
            personaId: data.id,
            name: data.name,
            tone: data.tone,
            knowledgeBase: data.knowledge_base ?? "",
            loading: false,
          });
        } else {
          setPersonaModal((p: PersonaModalState | null) => p && { ...p, loading: false });
        }
      }
    } catch {
      setPersonaModal((p) => p && { ...p, error: "Failed to load persona.", loading: false });
    }
  }

  async function handleSavePersona() {
    if (!personaModal) return;
    setPersonaModal((p: PersonaModalState | null) => p && { ...p, saving: true, error: null });
    const tId = toast.loading("Saving AI persona...");
    try {
      const isNew = !personaModal.personaId;
      const url = isNew ? `${BACKEND}/api/ai/personas` : `${BACKEND}/api/ai/personas/${personaModal.personaId}`;
      const method = isNew ? "POST" : "PATCH";
      
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel_id: personaModal.channelId,
          name: personaModal.name.trim(),
          tone: personaModal.tone.trim(),
          knowledge_base: personaModal.knowledgeBase.trim() || null,
        }),
      });

      if (!res.ok) throw new Error("Failed to save");
      
      toast.success("AI Persona saved.", { id: tId });
      setPersonaModal(null);
    } catch {
      setPersonaModal((p: PersonaModalState | null) => p && { ...p, error: "Failed to save persona.", saving: false });
      toast.error("Failed to save persona.", { id: tId });
    } finally {
      setPersonaModal((p: PersonaModalState | null) => p && { ...p, saving: false });
    }
  }

  return (
    <div className="w-full max-w-full space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Channel Management</h1>
        <p className="text-muted-foreground text-sm sm:text-base max-w-4xl leading-relaxed">
          Bot tokens are encrypted with AES-256-GCM before storage and decrypted only at send time.
        </p>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 xl:gap-10 2xl:gap-12 items-start">
      <Card className="w-full shadow-sm border-border/80 xl:sticky xl:top-4 xl:self-start">
        <CardHeader className="pb-3 md:pb-4 px-5 sm:px-6 md:px-8 pt-5 md:pt-7">
          <CardTitle className="text-lg md:text-xl flex items-center gap-2.5">
            <Plus className="h-5 w-5 shrink-0 text-primary" />
            Add New Channel
          </CardTitle>
          <p className="text-sm text-muted-foreground font-normal mt-1.5">
            Create a destination; broker name and bot token can be added later before activating.
          </p>
        </CardHeader>
        <CardContent className="px-5 sm:px-6 md:px-8 pb-6 md:pb-8">
          <form onSubmit={handleAdd} className="space-y-5 md:space-y-6" autoComplete="off">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 md:gap-6">
              <div className="space-y-1.5">
                <Label htmlFor="name">Channel Name</Label>
                <Input
                  id="name"
                  name="channelName"
                  autoComplete="off"
                  placeholder="e.g. VIP Signals Group"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  className="h-10 md:h-11"
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
                      const digitsOnly = e.target.value.replace(/\D/g, "");
                      setForm((p) => ({ ...p, chatId: digitsOnly }));
                    }}
                    className="pl-7 font-mono text-sm h-10 md:h-11"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 md:gap-6">
              <div className="space-y-1.5">
                <Label htmlFor="targetLanguage">Target language (e.g. en, Malay)</Label>
                <select
                  id="targetLanguage"
                  className="w-full mt-1 h-10 md:h-11 rounded-md border border-input bg-background px-3 text-sm"
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
                  className="w-full mt-1 h-10 md:h-11 rounded-md border border-input bg-background px-3 text-sm"
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
                placeholder="e.g. Broker X"
                value={form.brokerName}
                onChange={(e) => setForm((p) => ({ ...p, brokerName: e.target.value }))}
                className="h-10 md:h-11 w-full max-w-3xl"
              />
              <p className="text-xs text-muted-foreground">
                Required before you can turn the channel <strong>Active</strong> (you can add it later in Edit).
              </p>
            </div>
            <div className="flex items-center gap-3 py-1">
              <input
                type="checkbox"
                id="aiAutoReply"
                checked={form.aiAutoReply}
                onChange={(e) => setForm((p) => ({ ...p, aiAutoReply: e.target.checked }))}
                className="rounded border-border h-4 w-4"
              />
              <Label htmlFor="aiAutoReply" className="text-sm md:text-[15px] font-normal cursor-pointer">
                AI Auto-Reply enabled for this channel
              </Label>
            </div>
            <div className="space-y-1.5 max-w-4xl">
              <Label htmlFor="botToken">
                Bot token (optional)
                <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
                  <ShieldCheck className="h-3 w-3 text-emerald-400" />
                  Encrypted with AES-256-GCM before saving
                </span>
              </Label>
              <p className="text-xs text-muted-foreground -mt-0.5 mb-1">
                Required before <strong>Active</strong>. You can paste it later via the <strong>Token</strong> button on the channel row.
              </p>
              <div className="relative">
                <Input
                  id="botToken"
                  name="telegramBotToken"
                  autoComplete="new-password"
                  type={showNewToken ? "text" : "password"}
                  placeholder="123456:ABCDefGhIJKlmNoPQRstuVwxyz"
                  value={form.botToken}
                  onChange={(e) => setForm((p) => ({ ...p, botToken: e.target.value }))}
                  className="pr-10 font-mono text-sm h-10 md:h-11"
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

            <Button type="submit" disabled={adding} size="lg" className="gap-2 mt-2 h-11 px-6">
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add Channel
            </Button>
          </form>

          <Separator className="my-6 md:my-8" />

          <div className="space-y-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
            <p className="font-medium text-foreground">How to get your credentials:</p>
            <p>1. Message <span className="font-mono bg-muted px-1 rounded">@BotFather</span> on Telegram to create a bot and get the token.</p>
            <p>2. Add the bot to your group/channel as an admin.</p>
            <p>3. Use <span className="font-mono bg-muted px-1 rounded">@userinfobot</span> or the Telegram API to find the Chat ID.</p>
          </div>
        </CardContent>
      </Card>

      <Card className="w-full shadow-sm border-border/80 min-w-0">
        <CardHeader className="pb-3 md:pb-4 px-5 sm:px-6 md:px-8 pt-5 md:pt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <CardTitle className="text-lg md:text-xl flex items-center gap-2.5 min-w-0">
            <Radio className="h-5 w-5 shrink-0 text-primary" />
            <span className="truncate">Target Channels</span>
          </CardTitle>
          <Badge variant="secondary" className="text-xs sm:text-sm px-3 py-1 w-fit shrink-0">
            {channels.filter((c) => c.is_active).length} active / {channels.length} total
          </Badge>
        </CardHeader>
        <CardContent className="px-5 sm:px-6 md:px-8 pb-6 md:pb-8">
          {loading ? (
            <div className="flex justify-center py-14 md:py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : channels.length === 0 ? (
            <div className="py-14 md:py-16 text-center text-sm md:text-base text-muted-foreground max-w-md mx-auto leading-relaxed">
              No channels configured yet. Use <strong className="text-foreground">Add New Channel</strong> to create your first destination.
            </div>
          ) : (
            <div className="space-y-4 md:space-y-5">
              {channels.map((channel) => {
                const testResult = testResults[channel.id];
                const isEditingToken = tokenEdit?.channelId === channel.id;

                return (
                  <div key={channel.id} className="rounded-xl border border-border/80 bg-muted/15 overflow-hidden shadow-sm">
                    <div className="p-4 md:p-5 lg:p-6">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
                        <div className="flex items-start gap-3 md:gap-4 flex-1 min-w-0">
                          <span className={`h-3 w-3 rounded-full shrink-0 mt-1 transition-colors ${channel.is_active ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.55)]" : "bg-muted-foreground"}`} />
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-base md:text-lg leading-tight truncate">{channel.name}</p>
                            <div className="flex items-center gap-x-4 gap-y-1.5 mt-2 flex-wrap text-[13px] md:text-sm">
                              <span className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                                <KeyRound className="h-3 w-3" />
                                {channelHasRealBotToken(channel) ? (
                                  <span>
                                    {"••••••••••••••••"}
                                    <span className="text-foreground font-medium">{channel.token_hint}</span>
                                  </span>
                                ) : (
                                  <span className="text-amber-500/90 font-sans font-normal">Not set</span>
                                )}
                              </span>
                              <span className="text-xs text-muted-foreground font-mono">ID: {channel.chat_id}</span>
                              {channel.target_language && <span className="text-xs text-muted-foreground">Lang: {channel.target_language}</span>}
                              {channel.ai_auto_reply && <Badge variant="outline" className="text-xs">AI Reply</Badge>}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap shrink-0 lg:justify-end lg:max-w-[min(100%,42rem)]">
                          <Badge variant={channel.is_active ? "default" : "secondary"} className="text-xs md:text-sm px-2.5 py-0.5">
                            {channel.is_active ? "Active" : "Paused"}
                          </Badge>
                          {!channel.is_active && !channelReadyToActivate(channel) && (
                            <Badge variant="outline" className="text-xs md:text-sm border-amber-500/50 text-amber-600 dark:text-amber-400">
                              Setup incomplete
                            </Badge>
                          )}

                          {testResult && (
                            <span className={`text-xs flex items-center gap-1 ${testResult.ok ? "text-emerald-400" : "text-destructive"}`}>
                              {testResult.ok ? <><CheckCircle2 className="h-3.5 w-3.5" />OK</> : <><XCircle className="h-3.5 w-3.5" />{testResult.error ?? "Failed"}</>}
                            </span>
                          )}

                          <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs md:text-sm px-3" onClick={() => handleTest(channel.id)} disabled={testingId === channel.id || !channel.is_active}>
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
                                aiApiConfigId: channel.ai_api_config_id ?? "",
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

                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1.5 text-xs text-primary hover:text-primary hover:bg-primary/10"
                            onClick={() => handleOpenPersona(channel)}
                          >
                            <BrainCircuit className="h-3.5 w-3.5" />
                            Persona
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
                      <div className="border-t border-border bg-muted/30 px-4 md:px-6 py-4">
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
      </div>

      <Card className="w-full shadow-sm border-violet-200/80 dark:border-violet-900/50 bg-violet-50/20 dark:bg-violet-950/10">
        <CardHeader className="pb-3 px-5 sm:px-6 md:px-8 pt-5 md:pt-7">
          <CardTitle className="text-lg md:text-xl flex items-center gap-2.5">
            <BrainCircuit className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            AI Configuration
          </CardTitle>
          <p className="text-sm text-muted-foreground font-normal mt-1.5">
            Store OpenAI-compatible API keys encrypted (same AES-GCM as bot tokens). Use a default profile for channels that do not pick a specific profile. Test connectivity before relying on bulk generate or RAG.
          </p>
        </CardHeader>
        <CardContent className="px-5 sm:px-6 md:px-8 pb-6 md:pb-8 space-y-6">
          <form onSubmit={handleAddAiConfig} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            <div className="space-y-1.5 md:col-span-1">
              <Label className="text-xs">Display name</Label>
              <Input
                placeholder="e.g. Production OpenAI"
                value={aiCfgForm.name}
                onChange={(e) => setAiCfgForm((p) => ({ ...p, name: e.target.value }))}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5 md:col-span-1">
              <Label className="text-xs">API key</Label>
              <Input
                type="password"
                placeholder="sk-..."
                value={aiCfgForm.apiKey}
                onChange={(e) => setAiCfgForm((p) => ({ ...p, apiKey: e.target.value }))}
                autoComplete="new-password"
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5 md:col-span-1">
              <Label className="text-xs">Base URL (optional)</Label>
              <Input
                placeholder="Default: https://api.openai.com/v1"
                value={aiCfgForm.baseUrl}
                onChange={(e) => setAiCfgForm((p) => ({ ...p, baseUrl: e.target.value }))}
                className="font-mono text-xs"
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={aiCfgForm.isDefault}
                  onChange={(e) => setAiCfgForm((p) => ({ ...p, isDefault: e.target.checked }))}
                  className="rounded border-border h-4 w-4"
                />
                Set as default
              </label>
              <Button type="submit" disabled={aiCfgAdding} size="sm" className="gap-1.5">
                {aiCfgAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Add profile
              </Button>
            </div>
          </form>

          {aiConfigsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
            </div>
          ) : aiConfigs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No AI profiles yet. Add one above — the first profile becomes your default automatically.
            </p>
          ) : (
            <div className="space-y-3">
              {aiConfigs.map((cfg) => (
                <div
                  key={cfg.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-border/80 bg-background/80 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{cfg.name}</span>
                      {cfg.is_default && (
                        <Badge variant="secondary" className="text-xs">
                          Default
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs font-mono">
                        {cfg.provider}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 font-mono">
                      Key hint …{cfg.api_key_hint}
                      {cfg.base_url ? ` · ${cfg.base_url}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    {!cfg.is_default && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => handleSetDefaultAiConfig(cfg.id)}
                      >
                        Make default
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1"
                      onClick={() => handleTestAiConfig(cfg.id)}
                      disabled={aiCfgTestingId === cfg.id}
                    >
                      {aiCfgTestingId === cfg.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Radio className="h-3.5 w-3.5" />
                      )}
                      Test
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-destructive hover:text-destructive"
                      onClick={() => handleDeleteAiConfig(cfg.id)}
                      disabled={aiCfgDeletingId === cfg.id}
                    >
                      {aiCfgDeletingId === cfg.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
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
                <Label className="text-xs">Broker name (optional until activate)</Label>
                <Input
                  value={editModal.brokerName}
                  onChange={(e) => setEditModal((p) => (p ? { ...p, brokerName: e.target.value, error: null } : p))}
                  placeholder="e.g. Broker X"
                />
                <p className="text-[11px] text-muted-foreground">
                  If empty, you cannot turn the channel <strong>ON</strong> until this is filled.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">AI API profile</Label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={editModal.aiApiConfigId}
                  onChange={(e) =>
                    setEditModal((p) => (p ? { ...p, aiApiConfigId: e.target.value, error: null } : p))
                  }
                >
                  <option value="">Use account default</option>
                  {aiConfigs.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.is_default ? " (default)" : ""}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground">
                  Override which encrypted API key is used for this channel (RAG, auto-reply, translations). Empty uses your default profile.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="editAiReply"
                  checked={editModal.aiAutoReply}
                  onChange={(e) => setEditModal((p: EditModalState | null) => (p ? { ...p, aiAutoReply: e.target.checked, error: null } : p))}
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

      {personaModal && (
        <div
          className="fixed inset-0 z-60 bg-black/60 flex items-center justify-center p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPersonaModal(null);
          }}
        >
          <div className="w-full max-w-lg rounded-xl border border-border bg-card text-foreground shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <p className="text-sm font-semibold">AI Persona: {personaModal.channelName}</p>
                <p className="text-xs text-muted-foreground">Define how AI behaves when replying or generating content.</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setPersonaModal(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-5 space-y-4">
              {personaModal.loading ? (
                <div className="py-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Persona Name (e.g. Mat Rempit, Expert Trader)</Label>
                    <Input
                      value={personaModal.name}
                      onChange={(e) => setPersonaModal((p: PersonaModalState | null) => p && { ...p, name: e.target.value })}
                      placeholder="e.g. Mat Rempit"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Tone / Style</Label>
                    <Input
                      value={personaModal.tone}
                      onChange={(e) => setPersonaModal((p: PersonaModalState | null) => p && { ...p, tone: e.target.value })}
                      placeholder="e.g. santai, agresif, sopan"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Knowledge Base / Custom Instructions (RAG)</Label>
                    <textarea
                      className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={personaModal.knowledgeBase}
                      onChange={(e) => setPersonaModal((p: PersonaModalState | null) => p && { ...p, knowledgeBase: e.target.value })}
                      placeholder="Maklumat tambahan untuk AI gunakan semasa membalas mesej..."
                    />
                  </div>
                  {personaModal.error && <p className="text-sm text-destructive">{personaModal.error}</p>}
                  <div className="flex gap-2 justify-end pt-2">
                    <Button variant="ghost" onClick={() => setPersonaModal(null)} disabled={personaModal.saving}>
                      Cancel
                    </Button>
                    <Button onClick={handleSavePersona} disabled={personaModal.saving || !personaModal.name.trim()}>
                      {personaModal.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      <span className="ml-2">Save Persona</span>
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
