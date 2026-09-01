import { useEffect, useState } from "react";
import { getAuditLog } from "../api/apiClient";

const DECISION_STYLES = {
  ALLOW: { color: "text-status-green", symbol: "✓" },
  DENY: { color: "text-status-red", symbol: "✗" },
  ESCALATE: { color: "text-status-amber", symbol: "!" },
};

export default function Dashboard() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let interval;
    async function load() {
      const result = await getAuditLog({ limit: 20 });
      if (result.ok) setEvents(result.data);
      setLoading(false);
    }
    load();
    interval = setInterval(load, 5000); // poll for the "live" feel
    return () => clearInterval(interval);
  }, []);

  const allowed = events.filter((e) => e.decision === "ALLOW").length;
  const blocked = events.filter((e) => e.decision === "DENY").length;
  const escalated = events.filter((e) => e.decision === "ESCALATE").length;
  const moneyProtected = events
    .filter((e) => e.decision === "DENY")
    .reduce((sum, e) => sum + (e.amount || 0), 0);

  return (
    <main className="ml-64 pt-20 p-6 max-w-[1440px] mx-auto min-h-screen">
      <div className="flex justify-between items-end mb-6">
        <div>
          <h2 className="text-2xl text-on-surface mb-1">Overview Dashboard</h2>
          <p className="text-sm text-on-surface-variant">
            Real-time monitoring of autonomous payment activities.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Total Events"
          value={events.length}
          icon="shield"
          color="text-on-surface"
        />
        <StatCard
          label="Allowed"
          value={allowed}
          icon="check_circle"
          color="text-status-green"
        />
        <StatCard
          label="Blocked"
          value={blocked}
          icon="block"
          color="text-status-red"
        />
        <StatCard
          label="Escalated"
          value={escalated}
          icon="warning"
          color="text-status-amber"
        />
      </div>

      <div className="bg-surface-container-low border border-ui-border rounded-lg p-6 mb-6">
        <div className="flex items-center gap-4 mb-2">
          <span className="material-symbols-outlined text-on-surface-variant text-[32px]">
            security
          </span>
          <span className="text-xs text-on-surface-variant uppercase tracking-wider">
            Money Protected From Attacks
          </span>
        </div>
        <div className="text-5xl text-on-surface font-mono">
          ₹{moneyProtected.toLocaleString("en-IN")}
        </div>
      </div>

      <div className="bg-surface-container-low border border-ui-border rounded-lg overflow-hidden flex flex-col">
        <div className="px-6 py-3 border-b border-ui-border bg-surface-container flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-on-surface-variant">
              terminal
            </span>
            <h3 className="text-xs text-on-surface">LIVE ACTIVITY FEED</h3>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-status-green" />
            <span className="text-[10px] text-on-surface-variant">
              STREAMING
            </span>
          </div>
        </div>
        <div className="p-4 font-mono text-sm h-64 overflow-y-auto flex flex-col gap-2 bg-surface-container-lowest">
          {loading && <div className="text-on-surface-variant">Loading...</div>}
          {!loading && events.length === 0 && (
            <div className="text-on-surface-variant">
              No events yet. Run a purchase proposal to see activity.
            </div>
          )}
          {events.map((event) => {
            const style = DECISION_STYLES[event.decision] || {
              color: "text-on-surface-variant",
              symbol: "•",
            };
            return (
              <div
                key={event.eventId}
                className={`flex items-center ${style.color}`}
              >
                <span className="text-on-surface-variant mr-4">
                  {new Date(event.timestamp).toLocaleTimeString("en-IN", {
                    hour12: false,
                  })}
                </span>
                <span className="text-on-surface-variant mr-4 w-32">
                  {event.agentId}
                </span>
                <span className="text-on-surface mr-4 w-24">
                  {event.amount
                    ? `₹${event.amount.toLocaleString("en-IN")}`
                    : "—"}
                </span>
                <span>
                  {style.symbol} {event.action}
                  {event.reasonCode ? ` (${event.reasonCode})` : ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}

function StatCard({ label, value, icon, color }) {
  return (
    <div className="bg-surface-container-low border border-ui-border rounded-lg p-6 flex flex-col">
      <div className="flex justify-between items-start mb-4">
        <span className={`text-xs uppercase tracking-wider ${color}`}>
          {label}
        </span>
        <span className={`material-symbols-outlined text-[20px] ${color}`}>
          {icon}
        </span>
      </div>
      <div className={`text-[28px] leading-tight font-mono ${color}`}>
        {value.toLocaleString("en-IN")}
      </div>
    </div>
  );
}
