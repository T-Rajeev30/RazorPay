import { useEffect, useState } from "react";
import {
  getPendingApprovals,
  approveAuthorization,
  rejectAuthorization,
} from "../api/apiClient";

export default function HumanApprovals() {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState(null);

  async function load() {
    setLoading(true);
    const result = await getPendingApprovals();
    if (result.ok) setPending(result.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  async function handleApprove(authorizationId) {
    setActioning(authorizationId);
    await approveAuthorization(authorizationId);
    await load();
    setActioning(null);
  }

  async function handleReject(authorizationId) {
    setActioning(authorizationId);
    await rejectAuthorization(authorizationId);
    await load();
    setActioning(null);
  }

  return (
    <main className="ml-64 pt-20 p-6 max-w-[1440px] mx-auto min-h-screen">
      <div className="border-b border-ui-border pb-6 mb-6">
        <div className="flex items-center gap-4 mb-2">
          <span className="material-symbols-outlined text-on-surface text-3xl">
            verified_user
          </span>
          <h2 className="text-3xl text-on-surface">Human Approvals</h2>
        </div>
        <p className="text-sm text-on-surface-variant max-w-3xl">
          High-value or over-limit purchases wait here for human review before
          payment can proceed.
        </p>
      </div>

      {loading && <div className="text-on-surface-variant">Loading...</div>}

      {!loading && pending.length === 0 && (
        <div className="bg-surface-container-low border border-ui-border rounded-lg p-12 text-center text-on-surface-variant">
          No pending approvals.
        </div>
      )}

      <div className="flex flex-col gap-4">
        {pending.map((auth) => (
          <div
            key={auth.authorizationId}
            className="bg-surface-container border border-ui-border rounded-lg p-6 flex items-center justify-between"
          >
            <div className="grid grid-cols-4 gap-8 flex-1">
              <div>
                <p className="text-[10px] text-on-surface-variant uppercase tracking-wider mb-1">
                  Agent
                </p>
                <p className="text-on-surface font-mono text-sm">
                  {auth.agentId}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-on-surface-variant uppercase tracking-wider mb-1">
                  Merchant
                </p>
                <p className="text-on-surface font-mono text-sm">
                  {auth.merchantId}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-on-surface-variant uppercase tracking-wider mb-1">
                  Amount
                </p>
                <p className="text-status-amber font-mono text-sm">
                  ₹{auth.amount.toLocaleString("en-IN")} {auth.currency}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-on-surface-variant uppercase tracking-wider mb-1">
                  Authorization ID
                </p>
                <p className="text-on-surface-variant font-mono text-xs">
                  {auth.authorizationId}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                disabled={actioning === auth.authorizationId}
                onClick={() => handleReject(auth.authorizationId)}
                className="px-4 py-2 border border-status-red text-status-red rounded-lg text-xs uppercase tracking-widest hover:bg-status-red/10 transition-colors"
              >
                Reject
              </button>
              <button
                disabled={actioning === auth.authorizationId}
                onClick={() => handleApprove(auth.authorizationId)}
                className="px-4 py-2 border border-status-green text-status-green rounded-lg text-xs uppercase tracking-widest hover:bg-status-green/10 transition-colors"
              >
                Approve
              </button>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
