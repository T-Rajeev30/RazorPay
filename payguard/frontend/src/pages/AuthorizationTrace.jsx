import { useEffect, useState } from "react";
import { getAuthorizations } from "../api/apiClient";

const STATUS_STYLE = {
  ACTIVE: "text-status-green",
  CONSUMED: "text-on-surface-variant",
  EXPIRED: "text-status-amber",
  ESCALATED: "text-status-amber",
  DENIED: "text-status-red",
};

export default function AuthorizationTrace() {
  const [authorizations, setAuthorizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const params = { limit: 200 };
      if (statusFilter) params.status = statusFilter;
      const result = await getAuthorizations(params);
      if (!cancelled && result.ok) setAuthorizations(result.data);
      if (!cancelled) setLoading(false);
    }
    load();
    const interval = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [statusFilter]);

  return (
    <main className="ml-64 pt-20 p-6 max-w-[1440px] mx-auto min-h-screen">
      <div className="border-b border-ui-border pb-6 mb-6 flex items-end justify-between">
        <div>
          <div className="flex items-center gap-4 mb-2">
            <span className="material-symbols-outlined text-on-surface text-3xl">
              fact_check
            </span>
            <h2 className="text-3xl text-on-surface">Authorizations</h2>
          </div>
          <p className="text-sm text-on-surface-variant max-w-3xl">
            Live state of every signed authorization ever issued — not events,
            but current status. Every record here was independently signed by
            the policy engine.
          </p>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-surface-dim border border-ui-border rounded text-on-surface text-xs uppercase pl-4 pr-4 py-2 focus:border-active-focus focus:outline-none cursor-pointer"
        >
          <option value="">Status: ALL</option>
          <option value="ACTIVE">ACTIVE</option>
          <option value="CONSUMED">CONSUMED</option>
          <option value="EXPIRED">EXPIRED</option>
          <option value="ESCALATED">ESCALATED</option>
          <option value="DENIED">DENIED</option>
        </select>
      </div>

      <div className="bg-surface-container-low border border-ui-border rounded-lg overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead className="bg-surface-dim border-b border-ui-border sticky top-0">
            <tr>
              <th className="px-4 py-3 text-xs text-on-surface-variant uppercase tracking-wider">
                Authorization ID
              </th>
              <th className="px-4 py-3 text-xs text-on-surface-variant uppercase tracking-wider">
                Agent
              </th>
              <th className="px-4 py-3 text-xs text-on-surface-variant uppercase tracking-wider">
                Merchant
              </th>
              <th className="px-4 py-3 text-xs text-on-surface-variant uppercase tracking-wider text-right">
                Amount
              </th>
              <th className="px-4 py-3 text-xs text-on-surface-variant uppercase tracking-wider text-center">
                Status
              </th>
              <th className="px-4 py-3 text-xs text-on-surface-variant uppercase tracking-wider">
                Issued
              </th>
              <th className="px-4 py-3 text-xs text-on-surface-variant uppercase tracking-wider">
                Expires
              </th>
            </tr>
          </thead>
          <tbody className="font-mono text-sm divide-y divide-ui-border">
            {loading && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-6 text-center text-on-surface-variant"
                >
                  Loading...
                </td>
              </tr>
            )}
            {!loading && authorizations.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-6 text-center text-on-surface-variant"
                >
                  No authorizations yet — try the Attack Simulator or AI Buyer
                  first.
                </td>
              </tr>
            )}
            {!loading &&
              authorizations.map((auth) => (
                <tr
                  key={auth.authorizationId}
                  className="hover:bg-surface-container transition-colors"
                >
                  <td className="px-4 py-3 text-on-surface-variant text-xs">
                    {auth.authorizationId}
                  </td>
                  <td className="px-4 py-3 text-on-surface">{auth.agentId}</td>
                  <td className="px-4 py-3 text-on-surface">
                    {auth.merchantId}
                  </td>
                  <td className="px-4 py-3 text-right text-on-surface">
                    ₹{auth.amount.toLocaleString("en-IN")}
                  </td>
                  <td
                    className={`px-4 py-3 text-center ${STATUS_STYLE[auth.status] || "text-on-surface-variant"}`}
                  >
                    {auth.status}
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant text-xs">
                    {new Date(auth.createdAt).toLocaleTimeString("en-IN", {
                      hour12: false,
                    })}
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant text-xs">
                    {new Date(auth.expiresAt).toLocaleTimeString("en-IN", {
                      hour12: false,
                    })}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
