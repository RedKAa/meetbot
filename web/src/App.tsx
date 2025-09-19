import { useCallback, useEffect, useMemo, useState } from "react";

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ?? "http://localhost:3000";

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}` , {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) {
    const message = (data as any)?.error ?? `HTTP ${res.status}`;
    throw new Error(message as string);
  }
  return data;
}

interface SessionListItem {
  id: string;
  type: "live" | "completed";
  meetingUrl?: string | null;
  startedAt?: string | null;
  archivedAt?: string | null;
}

interface SessionDetailsResponse {
  id: string;
  kind: "live" | "completed";
  files?: {
    mixedAudio?: string | null;
    mixedTranscript?: string | null;
    meetingSummary?: string | null;
  };
  participants?: Array<{
    label: string;
    audio?: string | null;
    transcript?: string | null;
    summary?: string | null;
  }>;
}

interface StartCardProps {
  onStarted?: () => void;
}

function StartCard({ onStarted }: StartCardProps) {
  const [meetingUrl, setMeetingUrl] = useState("");
  const [botName, setBotName] = useState("HopFast");
  const [durationSec, setDurationSec] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      const payload: Record<string, unknown> = {
        meetingUrl: meetingUrl.trim(),
        botName: botName.trim()
      };
      if (durationSec.trim().length) {
        payload.durationSec = Number(durationSec);
      }
      const response = await apiPost<{ pid?: number; status?: string }>("/api/recordings", payload);
      setStatus(response.pid ? `Started PID ${response.pid}` : "Recording request sent");
      if (onStarted) onStarted();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h2>Start Recording</h2>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 12 }}>
          <label className="small" htmlFor="meetingUrl">Meeting URL</label>
          <input
            id="meetingUrl"
            value={meetingUrl}
            onChange={(event) => setMeetingUrl(event.target.value)}
            placeholder="https://meet.google.com/..."
            required
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label className="small" htmlFor="botName">Bot Name</label>
          <input
            id="botName"
            value={botName}
            onChange={(event) => setBotName(event.target.value)}
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label className="small" htmlFor="duration">Duration (sec, optional)</label>
          <input
            id="duration"
            value={durationSec}
            onChange={(event) => setDurationSec(event.target.value)}
            type="number"
            min={0}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? "Starting..." : "Start"}
          </button>
          {status && <span style={{ fontSize: 12, color: status.startsWith("Started") ? "#198754" : "#dc3545" }}>{status}</span>}
        </div>
      </form>
    </div>
  );
}

interface SessionsPaneProps {
  live: SessionListItem[];
  completed: SessionListItem[];
  onSelect: (id: string) => void;
  selectedId: string | null;
  onRefresh: () => void;
}

function SessionsPane({ live, completed, onSelect, selectedId, onRefresh }: SessionsPaneProps) {
  const renderItem = (item: SessionListItem) => {
    const isSelected = item.id === selectedId;
    return (
      <button
        key={item.id}
        onClick={() => onSelect(item.id)}
        style={{
          display: "block",
          width: "100%",
          textAlign: "left",
          padding: "8px 10px",
          borderRadius: 6,
          border: isSelected ? "2px solid #0d6efd" : "1px solid #ced4da",
          background: isSelected ? "#e7f1ff" : "#fff",
          marginBottom: 8
        }}
      >
        <div style={{ fontWeight: 600 }}>{item.id}</div>
        {item.startedAt && <div style={{ fontSize: 12, color: "#6c757d" }}>Started: {new Date(item.startedAt).toLocaleString()}</div>}
      </button>
    );
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Sessions</h2>
        <button className="secondary" onClick={onRefresh}>Refresh</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Live</h3>
          {live.length === 0 && <div style={{ fontSize: 12, color: "#6c757d" }}>No live sessions</div>}
          {live.map(renderItem)}
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Completed</h3>
          {completed.length === 0 && <div style={{ fontSize: 12, color: "#6c757d" }}>No completed sessions</div>}
          {completed.map(renderItem)}
        </div>
      </div>
    </div>
  );
}

interface TextFileProps {
  sessionId: string;
  file: string;
  label: string;
}

function TextFile({ sessionId, file, label }: TextFileProps) {
  const [content, setContent] = useState<string>("Loading...");

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/files/${file}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((text) => setContent(text || "(empty)"))
      .catch((err) => {
        if (err.name === "AbortError") return;
        setContent(`Failed to load: ${err.message}`);
      });
    return () => controller.abort();
  }, [sessionId, file]);

  return (
    <div>
      <label className="small">{label}</label>
      <pre>{content}</pre>
    </div>
  );
}

interface SessionDetailsProps {
  sessionId: string | null;
}

function SessionDetails({ sessionId }: SessionDetailsProps) {
  const [details, setDetails] = useState<SessionDetailsResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      setDetails(null);
      return;
    }
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const data = await apiGet<SessionDetailsResponse>(`/api/sessions/${encodeURIComponent(sessionId)}`);
        if (!cancelled) {
          setDetails(data);
        }
      } catch (error) {
        if (!cancelled) {
          setDetails(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) {
      return;
    }
    if (details?.kind === "completed") {
      return;
    }
    let cancelled = false;
    const interval = setInterval(async () => {
      if (cancelled) return;
      try {
        const data = await apiGet<SessionDetailsResponse>(`/api/sessions/${encodeURIComponent(sessionId)}`);
        if (!cancelled) {
          setDetails(data);
        }
      } catch (error) {
        /* ignore transient errors */
      }
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sessionId, details?.kind]);

  if (!sessionId) {
    return <div className="card" style={{ marginTop: 16 }}><div style={{ color: "#6c757d", fontSize: 12 }}>Select a session to view details.</div></div>;
  }

  if (loading && !details) {
    return <div className="card" style={{ marginTop: 16 }}>Loading...</div>;
  }

  if (!details) {
    return <div className="card" style={{ marginTop: 16 }}>No details available.</div>;
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div style={{ fontSize: 12, color: "#6c757d" }}>Session: {details.id} ({details.kind})</div>
      <h3>Media</h3>
      {details.files?.mixedAudio ? (
        <div>
          <label className="small">Mixed Audio</label>
          <audio controls src={`${API_BASE}/api/sessions/${encodeURIComponent(details.id)}/files/${details.files.mixedAudio}`} />
        </div>
      ) : (
        <div style={{ fontSize: 12, color: "#6c757d" }}>No mixed audio available</div>
      )}

      {details.participants && details.participants.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 12 }}>
          {details.participants.map((participant) => (
            participant.audio ? (
              <div key={participant.label}>
                <label className="small">{participant.label}</label>
                <audio controls src={`${API_BASE}/api/sessions/${encodeURIComponent(details.id)}/files/${participant.audio}`} />
              </div>
            ) : null
          ))}
        </div>
      )}

      <h3>Transcripts</h3>
      {details.files?.mixedTranscript ? (
        <TextFile sessionId={details.id} file={details.files.mixedTranscript} label="Meeting Transcript" />
      ) : (
        <div style={{ fontSize: 12, color: "#6c757d" }}>No meeting transcript yet</div>
      )}
      {details.participants?.map((participant) => (
        participant.transcript ? (
          <TextFile
            key={`${participant.label}-transcript`}
            sessionId={details.id}
            file={participant.transcript}
            label={`${participant.label} Transcript`}
          />
        ) : null
      ))}

      <h3>Summaries</h3>
      {details.files?.meetingSummary ? (
        <TextFile sessionId={details.id} file={details.files.meetingSummary} label="Meeting Summary" />
      ) : (
        <div style={{ fontSize: 12, color: "#6c757d" }}>No meeting summary yet</div>
      )}
      {details.participants?.map((participant) => (
        participant.summary ? (
          <TextFile
            key={`${participant.label}-summary`}
            sessionId={details.id}
            file={participant.summary}
            label={`${participant.label} Summary`}
          />
        ) : null
      ))}
    </div>
  );
}

export default function App() {
  const [live, setLive] = useState<SessionListItem[]>([]);
  const [completed, setCompleted] = useState<SessionListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [liveRes, completedRes] = await Promise.all([
        apiGet<{ items: SessionListItem[] }>("/api/sessions/live").catch(() => ({ items: [] })),
        apiGet<{ items: SessionListItem[] }>("/api/sessions/completed").catch(() => ({ items: [] }))
      ]);
      setLive(liveRes.items ?? []);
      setCompleted(completedRes.items ?? []);
    } catch (error) {
      console.error("Failed to refresh sessions", error);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10000);
    return () => clearInterval(interval);
  }, [refresh]);

  const apiInfo = useMemo(() => API_BASE, []);

  return (
    <div style={{ padding: 24 }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>MeetBot Control Panel</h1>
        <div style={{ fontSize: 12, color: "#6c757d" }}>API: {apiInfo}</div>
      </header>
      <StartCard onStarted={refresh} />
      <SessionsPane
        live={live}
        completed={completed}
        onSelect={setSelectedId}
        selectedId={selectedId}
        onRefresh={refresh}
      />
      <SessionDetails sessionId={selectedId} />
    </div>
  );
}
