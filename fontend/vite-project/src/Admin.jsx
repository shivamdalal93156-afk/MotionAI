import { useState, useEffect, useCallback } from "react";

const TOKEN = "changethis123"; // move to env in production
const API   = "http://localhost:3001";

const STATUS_COLOR = {
  pending:         "#f59e0b",
  lock:            "#3b82f6",
  done:            "#10b981",
  error:           "#ef4444",
  retry_scheduled: "#8b5cf6",
};

function StatCard({ label, value, color }) {
  return (
    <div style={{
      background: "#111114", border: "1px solid #1e1e24",
      borderRadius: "10px", padding: "20px 24px",
      borderTop: `3px solid ${color}`,
    }}>
      <div style={{ fontSize: "11px", color: "#52525b", letterSpacing: "0.1em", marginBottom: "8px" }}>
        {label}
      </div>
      <div style={{ fontSize: "32px", color: "#fff", fontWeight: "600" }}>{value}</div>
    </div>
  );
}

function ActionButton({ label, action, onAction, color = "#3b82f6" }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState(null);

  async function handle() {
    setLoading(true);
    setResult(null);
    const msg = await onAction(action);
    setResult(msg);
    setLoading(false);
    setTimeout(() => setResult(null), 3000);
  }

  return (
    <button onClick={handle} disabled={loading} style={{
      background: loading ? "#27272a" : color + "22",
      border: `1px solid ${color}55`,
      borderRadius: "8px", color: loading ? "#52525b" : color,
      fontFamily: "inherit", fontSize: "12px",
      padding: "10px 18px", cursor: loading ? "not-allowed" : "pointer",
      transition: "all 0.15s", minWidth: "160px",
    }}>
      {result || (loading ? "..." : label)}
    </button>
  );
}

export default function Admin() {
  const [data, setData]         = useState(null);
  const [error, setError]       = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API}/admin/stats?token=${TOKEN}`, {
        headers: { "x-admin-token": TOKEN }
      });
      if (res.status === 401) { setError("Invalid admin token"); return; }
      const d = await res.json();
      setData(d);
      setLastRefresh(new Date().toLocaleTimeString());
    } catch (e) {
      setError(`Cannot reach backend: ${e.message}`);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  async function runAction(action) {
    try {
      const res = await fetch(`${API}/admin/action?token=${TOKEN}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": TOKEN },
        body: JSON.stringify({ action }),
      });
      const d = await res.json();
      fetchStats();
      return d.message || d.error || "Done";
    } catch (e) {
      return `Error: ${e.message}`;
    }
  }

  if (error) return (
    <div style={{ minHeight: "100vh", background: "#0c0c0e", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "#ef4444", fontFamily: "monospace", fontSize: "14px" }}>{error}</div>
    </div>
  );

  if (!data) return (
    <div style={{ minHeight: "100vh", background: "#0c0c0e", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "#52525b", fontFamily: "monospace", fontSize: "14px" }}>Loading...</div>
    </div>
  );

  const { stats, jobs, diskInfo } = data;

  return (
    <div style={{
      minHeight: "100vh", background: "#0c0c0e",
      color: "#d4d4d8", fontFamily: "'DM Mono', 'Fira Mono', monospace",
      padding: "32px",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
        <div>
          <div style={{ fontSize: "10px", color: "#52525b", letterSpacing: "0.1em" }}>MOTIONAI</div>
          <h1 style={{ margin: "2px 0 0", fontSize: "22px", color: "#fff" }}>Admin Panel</h1>
        </div>
        <div style={{ fontSize: "11px", color: "#3f3f46" }}>
          Auto-refresh · Last: {lastRefresh}
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "12px", marginBottom: "28px" }}>
        <StatCard label="PENDING"   value={stats.pending}         color="#f59e0b" />
        <StatCard label="RENDERING" value={stats.processing}      color="#3b82f6" />
        <StatCard label="DONE"      value={stats.done}            color="#10b981" />
        <StatCard label="FAILED"    value={stats.error}           color="#ef4444" />
        <StatCard label="RETRYING"  value={stats.retry_scheduled} color="#8b5cf6" />
      </div>

      {/* Disk + Actions row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "28px" }}>
        
        {/* Disk */}
        <div style={{ background: "#111114", border: "1px solid #1e1e24", borderRadius: "10px", padding: "20px" }}>
          <div style={{ fontSize: "10px", color: "#52525b", letterSpacing: "0.1em", marginBottom: "14px" }}>DISK (C:)</div>
          {diskInfo ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ fontSize: "12px", color: "#71717a" }}>Used</span>
                <span style={{ fontSize: "12px", color: "#e4e4e7" }}>{diskInfo.usedGB} GB</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
                <span style={{ fontSize: "12px", color: "#71717a" }}>Free</span>
                <span style={{ fontSize: "12px", color: parseFloat(diskInfo.freeGB) < 10 ? "#ef4444" : "#10b981" }}>
                  {diskInfo.freeGB} GB
                </span>
              </div>
              <div style={{ background: "#1e1e24", borderRadius: "4px", height: "6px", overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: "4px",
                  background: parseFloat(diskInfo.freeGB) < 10 ? "#ef4444" : "#3b82f6",
                  width: `${(parseFloat(diskInfo.usedGB) / (parseFloat(diskInfo.usedGB) + parseFloat(diskInfo.freeGB)) * 100).toFixed(1)}%`,
                  transition: "width 0.3s",
                }} />
              </div>
            </>
          ) : (
            <div style={{ fontSize: "12px", color: "#52525b" }}>Disk info unavailable</div>
          )}
        </div>

        {/* Actions */}
        <div style={{ background: "#111114", border: "1px solid #1e1e24", borderRadius: "10px", padding: "20px" }}>
          <div style={{ fontSize: "10px", color: "#52525b", letterSpacing: "0.1em", marginBottom: "14px" }}>ACTIONS</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <ActionButton label="⚡ Kill AE Processes"  action="kill_ae"       onAction={runAction} color="#ef4444" />
            <ActionButton label="🔓 Release Lock"       action="release_lock"  onAction={runAction} color="#f59e0b" />
            <ActionButton label="🧹 Flush Orphan Files" action="flush_orphans" onAction={runAction} color="#3b82f6" />
            <ActionButton label="♻ Run Cleanup"        action="cleanup"       onAction={runAction} color="#10b981" />
          </div>
        </div>
      </div>

      {/* Job history */}
      <div style={{ background: "#111114", border: "1px solid #1e1e24", borderRadius: "10px", padding: "20px" }}>
        <div style={{ fontSize: "10px", color: "#52525b", letterSpacing: "0.1em", marginBottom: "16px" }}>
          RECENT JOBS (last 20)
        </div>
        {jobs.length === 0 ? (
          <div style={{ fontSize: "12px", color: "#3f3f46" }}>No jobs yet</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {jobs.map(job => (
              <div key={job.jobId} style={{
                display: "grid",
                gridTemplateColumns: "140px 120px 140px 1fr auto",
                alignItems: "center",
                gap: "12px",
                padding: "10px 14px",
                background: "#18181b",
                borderRadius: "8px",
                fontSize: "11px",
              }}>
                <span style={{ color: "#52525b", fontFamily: "monospace" }}>
                  {job.jobId?.slice(0, 12)}...
                </span>
                <span style={{
                  color: STATUS_COLOR[job.status] || "#71717a",
                  background: (STATUS_COLOR[job.status] || "#71717a") + "18",
                  border: `1px solid ${(STATUS_COLOR[job.status] || "#71717a")}44`,
                  borderRadius: "4px", padding: "2px 8px",
                  textAlign: "center",
                }}>
                  {job.status?.toUpperCase()}
                </span>
                <span style={{ color: "#71717a" }}>
                  {job.template?.replace(/_/g, " ")}
                </span>
                <span style={{ color: job.errorReason ? "#ef4444" : "#3f3f46", fontSize: "10px" }}>
                  {job.errorReason || (job.outputUrl ? "✓ " + job.outputUrl : "—")}
                </span>
                <span style={{ color: "#3f3f46", fontSize: "10px", whiteSpace: "nowrap" }}>
                  {job.updatedAt ? new Date(job.updatedAt).toLocaleTimeString() : "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}