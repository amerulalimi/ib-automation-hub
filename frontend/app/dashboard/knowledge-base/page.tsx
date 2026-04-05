"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, BookOpen, Trash2, MessageSquare } from "lucide-react";
import { toast } from "sonner";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

type Channel = { id: string; name: string };

type Chunk = {
  id: string;
  preview: string;
  created_at: string | null;
};

export default function KnowledgeBasePage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelId, setChannelId] = useState("");
  const [ingestText, setIngestText] = useState("");
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [chunkCount, setChunkCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState("");
  const [testReply, setTestReply] = useState<string | null>(null);

  const loadChannels = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND}/api/channels`, { credentials: "include" });
      if (!res.ok) throw new Error("channels");
      const data = await res.json();
      setChannels(data.map((c: Channel) => ({ id: c.id, name: c.name })));
      setChannelId((prev) => prev || (data[0]?.id ?? ""));
    } catch {
      toast.error("Failed to load channels");
    }
  }, []);

  const loadChunks = useCallback(async () => {
    if (!channelId) return;
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND}/api/ai/rag/chunks/${channelId}?limit=200`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("chunks");
      const data = await res.json();
      setChunks(data.chunks ?? []);
      setChunkCount(data.chunk_count ?? 0);
    } catch {
      toast.error("Failed to load knowledge chunks");
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  useEffect(() => {
    loadChunks();
  }, [loadChunks]);

  const ingest = async () => {
    if (!channelId || !ingestText.trim()) return;
    const t = toast.loading("Ingesting…");
    try {
      const res = await fetch(`${BACKEND}/api/ai/rag/ingest`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_id: channelId, text: ingestText }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      toast.success(`Ingested ${data.ingested ?? 0} chunks`, { id: t });
      setIngestText("");
      loadChunks();
    } catch {
      toast.error("Ingest failed (is pgvector enabled?)", { id: t });
    }
  };

  const delChunk = async (id: string) => {
    if (!channelId) return;
    try {
      const res = await fetch(`${BACKEND}/api/ai/rag/chunks/${channelId}/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error();
      toast.success("Chunk deleted");
      loadChunks();
    } catch {
      toast.error("Delete failed");
    }
  };

  const ask = async () => {
    if (!channelId || !question.trim()) return;
    setAnswer(null);
    try {
      const res = await fetch(`${BACKEND}/api/ai/rag/query`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_id: channelId, question: question.trim() }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setAnswer(data.answer ?? "");
    } catch {
      toast.error("RAG query failed");
    }
  };

  const testPersona = async () => {
    if (!channelId || !testMsg.trim()) return;
    setTestReply(null);
    try {
      const res = await fetch(`${BACKEND}/api/ai/personas/test-reply`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_id: channelId, message: testMsg.trim() }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTestReply(data.reply ?? "");
    } catch {
      toast.error("Persona test failed (check OpenAI key & persona)");
    }
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BookOpen className="h-7 w-7" />
          Knowledge base (RAG)
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Upload text per channel, list/delete chunks, run a test query, or preview auto-reply tone.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Channel</CardTitle>
        </CardHeader>
        <CardContent>
          <select
            className="w-full max-w-md h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
          >
            <option value="">Select channel…</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground mt-2">
            {chunkCount} chunk(s) stored for this channel
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ingest text</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <textarea
            className="w-full min-h-[140px] rounded-md border border-input bg-background p-3 text-sm"
            placeholder="Paste policy, FAQs, or product notes…"
            value={ingestText}
            onChange={(e) => setIngestText(e.target.value)}
          />
          <Button onClick={ingest} disabled={!channelId || !ingestText.trim()}>
            Ingest into vector store
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Chunks</CardTitle>
          <Button variant="outline" size="sm" onClick={() => loadChunks()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {chunks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No chunks yet for this channel.</p>
          ) : (
            <ul className="space-y-2">
              {chunks.map((c) => (
                <li
                  key={c.id}
                  className="flex gap-2 items-start border border-border rounded-md p-3 text-sm"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground font-mono truncate">{c.id}</p>
                    <p className="mt-1 whitespace-pre-wrap break-words">{c.preview}</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => delChunk(c.id)} aria-label="Delete chunk">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Test RAG question</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <textarea
            className="w-full min-h-[80px] rounded-md border border-input bg-background p-3 text-sm"
            placeholder="Ask a question scoped to this channel's knowledge…"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <Button onClick={ask} disabled={!channelId || !question.trim()}>
            Ask
          </Button>
          {answer && (
            <div className="rounded-md bg-muted p-3 text-sm whitespace-pre-wrap">{answer}</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Test AI persona reply
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label className="text-xs text-muted-foreground">
            Uses the same path as Telegram auto-reply (persona + optional RAG context in backend).
          </Label>
          <textarea
            className="w-full min-h-[80px] rounded-md border border-input bg-background p-3 text-sm"
            placeholder="Simulate an incoming user message…"
            value={testMsg}
            onChange={(e) => setTestMsg(e.target.value)}
          />
          <Button variant="secondary" onClick={testPersona} disabled={!channelId || !testMsg.trim()}>
            Generate reply
          </Button>
          {testReply && (
            <div className="rounded-md bg-muted p-3 text-sm whitespace-pre-wrap">{testReply}</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
