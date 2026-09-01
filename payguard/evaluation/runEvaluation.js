/**
 * runEvaluation.js
 *
 * Executes the generated scenarios against the LIVE, running PayGuard
 * backend (real HTTP calls) and computes real accuracy metrics.
 *
 * IMPORTANT: every number in the output comes from executing real
 * requests against the running backend — nothing is hardcoded. Start
 * the backend (npm start in backend/) and seed it (node src/seed.js)
 * before running this.
 *
 * Usage (from repo root): node evaluation/runEvaluation.js
 */
const fs = require("fs");
const path = require("path");
const { generateScenarios } = require("./generateScenarios");

const BASE_URL =
  process.env.PAYGUARD_BACKEND_URL || "http://localhost:4000/api";

async function fetchCatalog() {
  const res = await fetch(`${BASE_URL}/products`);
  if (!res.ok) throw new Error(`Failed to fetch catalog: ${res.status}`);
  const products = await res.json();
  if (products.length < 2) {
    throw new Error(
      "Need at least 2 seeded products (cheap + expensive). Run seed.js first.",
    );
  }
  const sorted = [...products].sort((a, b) => a.price - b.price);
  return {
    cheapProduct: sorted[0],
    expensiveProduct: sorted[sorted.length - 1],
  };
}

async function patchPrice(productId, price) {
  const res = await fetch(`${BASE_URL}/products/${productId}/price`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ price }),
  });
  if (!res.ok) throw new Error(`Failed to patch price: ${res.status}`);
  return res.json();
}

async function callAuthorize(proposal) {
  const start = Date.now();
  const res = await fetch(`${BASE_URL}/authorize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(proposal),
  });
  const latencyMs = Date.now() - start;
  const data = await res.json();
  return { data, latencyMs };
}

async function callPay(authorizationId) {
  const res = await fetch(`${BASE_URL}/pay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ authorizationId }),
  });
  return res.json();
}

async function runReplayScenarios(cheapProduct, count = 10) {
  const results = [];
  for (let i = 0; i < count; i++) {
    const proposal = {
      agentId: "shopping-agent-01",
      merchantId: "merchant_123",
      productId: cheapProduct._id,
      proposedPrice: cheapProduct.price,
      quantity: 1,
      currency: "INR",
    };
    const authRes = await callAuthorize(proposal);
    if (authRes.data.decision !== "ALLOW") {
      results.push({
        type: "REPLAY_ATTACK",
        correct: false,
        note: "setup failed to get ALLOW",
      });
      continue;
    }
    const authId = authRes.data.authorization.authorizationId;
    await callPay(authId); // consume it for real (real Razorpay test-mode call)
    const replayPay = await callPay(authId); // attempt reuse

    results.push({
      type: "REPLAY_ATTACK",
      expectedDecision: "DENY",
      actualDecision: replayPay.decision || null,
      actualReasonCode: replayPay.reason_code || null,
      correct: replayPay.reason_code === "AUTHORIZATION_ALREADY_CONSUMED",
    });
  }
  return results;
}

async function main() {
  console.log("[evaluation] Fetching live catalog...");
  const catalog = await fetchCatalog();
  console.log(
    `[evaluation] Cheap product: ${catalog.cheapProduct.name} (₹${catalog.cheapProduct.price})`,
  );
  console.log(
    `[evaluation] Expensive product: ${catalog.expensiveProduct.name} (₹${catalog.expensiveProduct.price})`,
  );

  const originalCheapPrice = catalog.cheapProduct.price;
  const scenarios = generateScenarios(catalog);
  const results = [];

  console.log(
    `[evaluation] Running ${scenarios.length} scenarios sequentially...`,
  );

  for (const scenario of scenarios) {
    if (scenario.type === "PRICE_MANIPULATION") {
      await patchPrice(
        catalog.cheapProduct._id,
        scenario.proposal._inflatedPrice,
      );
      const { data, latencyMs } = await callAuthorize(scenario.proposal);
      await patchPrice(catalog.cheapProduct._id, originalCheapPrice); // restore immediately

      results.push({
        type: scenario.type,
        expectedDecision: scenario.expectedDecision,
        expectedReasonCode: scenario.expectedReasonCode,
        actualDecision: data.decision,
        actualReasonCode: data.reason_code,
        latencyMs,
        correct:
          data.decision === scenario.expectedDecision &&
          data.reason_code === scenario.expectedReasonCode,
      });
      continue;
    }

    const { data, latencyMs } = await callAuthorize(scenario.proposal);
    results.push({
      type: scenario.type,
      expectedDecision: scenario.expectedDecision,
      expectedReasonCode: scenario.expectedReasonCode,
      actualDecision: data.decision,
      actualReasonCode: data.reason_code,
      latencyMs,
      correct:
        data.decision === scenario.expectedDecision &&
        data.reason_code === scenario.expectedReasonCode,
    });
  }

  console.log(
    "[evaluation] Running replay attack scenarios (sequential authorize+pay+pay)...",
  );
  results.push(...(await runReplayScenarios(catalog.cheapProduct, 10)));

  // --- Compute metrics ---
  const byType = {};
  for (const r of results) {
    if (!byType[r.type]) byType[r.type] = { total: 0, correct: 0 };
    byType[r.type].total += 1;
    if (r.correct) byType[r.type].correct += 1;
  }

  const legitimate = results.filter((r) => r.type === "LEGITIMATE");
  const attacks = results.filter((r) => r.type !== "LEGITIMATE");
  const falseBlocks = legitimate.filter(
    (r) => r.actualDecision !== "ALLOW",
  ).length;
  const falseAllows = attacks.filter(
    (r) => r.actualDecision === "ALLOW",
  ).length;
  const latencies = results
    .filter((r) => typeof r.latencyMs === "number")
    .map((r) => r.latencyMs);
  const avgLatency = latencies.length
    ? latencies.reduce((a, b) => a + b, 0) / latencies.length
    : null;

  const summary = {
    generatedAt: new Date().toISOString(),
    totalScenarios: results.length,
    legitimateTransactions: legitimate.length,
    attackScenarios: attacks.length,
    falseAllowRate: attacks.length ? falseAllows / attacks.length : null,
    falseBlockRate: legitimate.length ? falseBlocks / legitimate.length : null,
    avgPolicyEvaluationLatencyMs: avgLatency,
    detectionRateByType: Object.fromEntries(
      Object.entries(byType).map(([type, { total, correct }]) => [
        type,
        { total, correct, rate: correct / total },
      ]),
    ),
    knownLimitations: [
      "Stale/expired authorization scenarios are excluded — each requires waiting out the real 30s TTL, impractical at this scale within the time budget.",
      "Price manipulation scenarios mutate and restore the live catalog price sequentially; do not run this concurrently with other traffic against the same backend.",
    ],
  };

  const outDir = path.join(__dirname, "results");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, `run-${Date.now()}.json`),
    JSON.stringify({ summary, results }, null, 2),
  );
  fs.writeFileSync(
    path.join(outDir, "latest.json"),
    JSON.stringify({ summary, results }, null, 2),
  );

  console.log("\n=== EVALUATION SUMMARY ===");
  console.log(`Total scenarios: ${summary.totalScenarios}`);
  console.log(
    `False Allow Rate: ${(summary.falseAllowRate * 100).toFixed(2)}%`,
  );
  console.log(
    `False Block Rate: ${(summary.falseBlockRate * 100).toFixed(2)}%`,
  );
  console.log(
    `Avg policy evaluation latency: ${summary.avgPolicyEvaluationLatencyMs.toFixed(1)}ms`,
  );
  console.log("\nDetection rate by type:");
  for (const [type, stats] of Object.entries(summary.detectionRateByType)) {
    console.log(
      `  ${type}: ${stats.correct}/${stats.total} (${(stats.rate * 100).toFixed(1)}%)`,
    );
  }
}

main().catch((err) => {
  console.error("[evaluation] failed:", err);
  process.exit(1);
});
