import { useEffect, useState } from "react";

const RESULTS_URL = `${import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api"}/evaluation-results/latest.json`;

export default function Evaluation() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(RESULTS_URL)
      .then((res) => {
        if (!res.ok)
          throw new Error(
            "No evaluation results found — run node evaluation/runEvaluation.js first.",
          );
        return res.json();
      })
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <main className="ml-64 pt-20 p-6 max-w-[1440px] mx-auto min-h-screen">
        <div className="bg-status-red/10 border border-status-red/50 text-status-red p-6 rounded-lg">
          {error}
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="ml-64 pt-20 p-6 max-w-[1440px] mx-auto min-h-screen">
        <div className="text-on-surface-variant">Loading...</div>
      </main>
    );
  }

  const { summary } = data;

  return (
    <main className="ml-64 pt-20 p-6 max-w-[1440px] mx-auto min-h-screen">
      <div className="border-b border-ui-border pb-6 mb-6">
        <div className="flex items-center gap-4 mb-2">
          <span className="material-symbols-outlined text-on-surface text-3xl">
            analytics
          </span>
          <h2 className="text-3xl text-on-surface">Security Evaluation</h2>
        </div>
        <p className="text-sm text-on-surface-variant max-w-3xl">
          Results from {summary.totalScenarios} synthetic scenarios run against
          the live backend — real HTTP calls, not hardcoded numbers. Generated{" "}
          {new Date(summary.generatedAt).toLocaleString("en-IN")}.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <MetricCard
          label="False Allow Rate"
          value={`${(summary.falseAllowRate * 100).toFixed(2)}%`}
          color={
            summary.falseAllowRate > 0 ? "text-status-red" : "text-status-green"
          }
          icon="warning"
          note="Critical: a false allow can move unauthorized money"
        />
        <MetricCard
          label="False Block Rate"
          value={`${(summary.falseBlockRate * 100).toFixed(2)}%`}
          color="text-status-amber"
          icon="block"
          note="A false block is friction, not a security failure"
        />
        <MetricCard
          label="Avg Policy Latency"
          value={`${summary.avgPolicyEvaluationLatencyMs.toFixed(1)}ms`}
          color="text-on-surface"
          icon="speed"
          note="Time to evaluate one purchase proposal"
        />
      </div>

      <div className="bg-surface-container-low border border-ui-border rounded-lg overflow-hidden mb-6">
        <div className="px-6 py-3 border-b border-ui-border bg-surface-container">
          <h3 className="text-xs text-on-surface uppercase tracking-widest">
            Detection Rate by Scenario Type
          </h3>
        </div>
        <table className="w-full text-left">
          <thead className="bg-surface-dim">
            <tr>
              <th className="px-4 py-2 text-xs text-on-surface-variant uppercase">
                Type
              </th>
              <th className="px-4 py-2 text-xs text-on-surface-variant uppercase text-right">
                Correct / Total
              </th>
              <th className="px-4 py-2 text-xs text-on-surface-variant uppercase text-right">
                Rate
              </th>
            </tr>
          </thead>
          <tbody className="font-mono text-sm divide-y divide-ui-border">
            {Object.entries(summary.detectionRateByType).map(
              ([type, stats]) => (
                <tr key={type}>
                  <td className="px-4 py-3 text-on-surface">{type}</td>
                  <td className="px-4 py-3 text-right text-on-surface-variant">
                    {stats.correct}/{stats.total}
                  </td>
                  <td
                    className={`px-4 py-3 text-right ${stats.rate === 1 ? "text-status-green" : "text-status-red"}`}
                  >
                    {(stats.rate * 100).toFixed(1)}%
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>

      {summary.knownLimitations?.length > 0 && (
        <div className="bg-surface-container border border-ui-border rounded-lg p-6">
          <h3 className="text-xs text-on-surface-variant uppercase tracking-widest mb-3">
            Known Limitations
          </h3>
          <ul className="text-sm text-on-surface-variant list-disc list-inside space-y-1">
            {summary.knownLimitations.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}

function MetricCard({ label, value, color, icon, note }) {
  return (
    <div className="bg-surface-container-low border border-ui-border rounded-lg p-6">
      <div className="flex justify-between items-start mb-3">
        <span className="text-xs text-on-surface-variant uppercase tracking-wider">
          {label}
        </span>
        <span className={`material-symbols-outlined text-[20px] ${color}`}>
          {icon}
        </span>
      </div>
      <div className={`text-3xl font-mono mb-2 ${color}`}>{value}</div>
      <p className="text-[10px] text-on-surface-variant">{note}</p>
    </div>
  );
}
