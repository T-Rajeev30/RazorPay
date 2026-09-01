import { useEffect, useState } from "react";
import { getAuditLog } from "../api/apiClient";

const EVENT_TYPES = [
  "PURCHASE_PROPOSED",
  "POLICY_EVALUATED",
  "AUTHORIZATION_CREATED",
  "AUTHORIZATION_CONSUMED",
  "PAYMENT_ALLOWED",
  "PAYMENT_BLOCKED",
  "PAYMENT_FAILED",
  "HUMAN_APPROVAL_REQUESTED",
  "REPLAY_BLOCKED",
];

const DECISION_BADGE_STYLE = {
  ALLOW: "text-status-green",
  DENY: "text-status-red",
  ESCALATE: "text-status-amber",
};

export default function AuditLog() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [decisionFilter, setDecisionFilter] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const params = { limit: 200 };
      if (actionFilter) params.action = actionFilter;
      if (decisionFilter) params.decision = decisionFilter;
      const result = await getAuditLog(params);
      if (!cancelled && result.ok) setEvents(result.data);
      if (!cancelled) setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [actionFilter, decisionFilter]);

  const visibleEvents = events.filter((e) => {
    if (!search) return true;
    const haystack =
      `${e.agentId} ${e.authorizationId || ""} ${e.merchantId || ""}`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

  return (
    <main className="ml-64 pt-16 h-screen flex flex-col overflow-hidden bg-surface">
      <div className="bg-surface-container p-4 border-b border-ui-border shrink-0 flex items-center justify-between gap-4">
        <div className="flex-1 max-w-md relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">
            search
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-surface-dim border border-ui-border rounded text-on-surface font-mono text-sm pl-10 pr-4 py-2 focus:border-active-focus focus:outline-none placeholder:text-on-surface-variant/50"
            placeholder="Search agent ID, authorization ID, merchant..."
            type="text"
          />
        </div>
        <div className="flex items-center gap-4">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="bg-surface-dim border border-ui-border rounded text-on-surface text-xs uppercase pl-4 pr-4 py-2 focus:border-active-focus focus:outline-none cursor-pointer"
          >
            <option value="">Event Type: ALL</option>
            {EVENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <select
            value={decisionFilter}
            onChange={(e) => setDecisionFilter(e.target.value)}
            className="bg-surface-dim border border-ui-border rounded text-on-surface text-xs uppercase pl-4 pr-4 py-2 focus:border-active-focus focus:outline-none cursor-pointer"
          >
            <option value="">Decision: ALL</option>
            <option value="ALLOW">ALLOWED</option>
            <option value="DENY">BLOCKED</option>
            <option value="ESCALATE">ESCALATED</option>
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-background p-6">
        <div className="border border-ui-border rounded bg-surface-container-low w-full max-w-[1440px] mx-auto overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead className="bg-surface-dim border-b border-ui-border sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-xs text-on-surface-variant uppercase tracking-wider">
                  Timestamp
                </th>
                <th className="px-4 py-3 text-xs text-on-surface-variant uppercase tracking-wider">
                  Event Type
                </th>
                <th className="px-4 py-3 text-xs text-on-surface-variant uppercase tracking-wider">
                  Agent ID
                </th>
                <th className="px-4 py-3 text-xs text-on-surface-variant uppercase tracking-wider text-right">
                  Amount
                </th>
                <th className="px-4 py-3 text-xs text-on-surface-variant uppercase tracking-wider text-center">
                  Decision
                </th>
                <th className="px-4 py-3 text-xs text-on-surface-variant uppercase tracking-wider">
                  Reason Code
                </th>
              </tr>
            </thead>
            <tbody className="font-mono text-sm divide-y divide-ui-border">
              {loading && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-on-surface-variant"
                  >
                    Loading...
                  </td>
                </tr>
              )}
              {!loading && visibleEvents.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-on-surface-variant"
                  >
                    No events match the current filters.
                  </td>
                </tr>
              )}
              {!loading &&
                visibleEvents.map((event) => (
                  <tr
                    key={event.eventId}
                    className="hover:bg-surface-container transition-colors group"
                  >
                    <td className="px-4 py-3 text-on-surface-variant group-hover:text-on-surface">
                      {new Date(event.timestamp).toLocaleString("en-IN", {
                        hour12: false,
                      })}
                    </td>
                    <td className="px-4 py-3 text-on-surface">
                      {event.action}
                    </td>
                    <td className="px-4 py-3 text-on-surface">
                      {event.agentId}
                    </td>
                    <td className="px-4 py-3 text-right text-on-surface">
                      {event.amount
                        ? `₹${event.amount.toLocaleString("en-IN")}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {event.decision && (
                        <span
                          className={`inline-flex items-center justify-center px-2 py-1 bg-surface-container-highest border border-ui-border rounded text-[10px] uppercase min-w-[80px] ${
                            DECISION_BADGE_STYLE[event.decision] ||
                            "text-on-surface-variant"
                          }`}
                        >
                          {event.decision}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant">
                      {event.reasonCode || "-"}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          <div className="border-t border-ui-border bg-surface-dim p-3 flex justify-between items-center text-on-surface-variant text-[10px]">
            <div>
              SHOWING {visibleEvents.length} OF {events.length} EVENTS
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
