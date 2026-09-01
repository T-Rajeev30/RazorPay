import { useState } from "react";
import {
  getProducts,
  authorizePurchase,
  updateProductPrice,
  executePayment,
} from "../api/apiClient";

const AGENT_ID = "shopping-agent-01";
const MERCHANT_ID = "merchant_123";

const ATTACKS = [
  {
    id: "SIM_01",
    icon: "price_change",
    title: "Price Manipulation",
    description:
      "Merchant silently raises price after the agent already checked it.",
    implemented: true,
    run: runPriceManipulation,
  },
  {
    id: "SIM_02",
    icon: "exposure_plus_1",
    title: "Quantity Manipulation",
    description: "Agent proposes a quantity above its policy limit.",
    implemented: true,
    run: runQuantityManipulation,
  },
  {
    id: "SIM_03",
    icon: "monitoring",
    title: "Budget Escalation",
    description: "Total cost exceeds the agent per-transaction limit.",
    implemented: true,
    run: runBudgetEscalation,
  },
  {
    id: "SIM_04",
    icon: "storefront",
    title: "Merchant Substitution",
    description:
      "Proposal claims a different merchant than the authoritative product record.",
    implemented: true,
    run: runMerchantSubstitution,
  },
  {
    id: "SIM_05",
    icon: "currency_exchange",
    title: "Currency Manipulation",
    description: "Proposal uses a currency outside the agent allowlist.",
    implemented: true,
    run: runCurrencyManipulation,
  },
  {
    id: "SIM_06",
    icon: "timer",
    title: "Stale Authorization",
    description:
      "Requires waiting out the 30s TTL — run manually via curl, not wired to a button.",
    implemented: false,
  },
  {
    id: "SIM_07",
    icon: "replay",
    title: "Replay Attack",
    description:
      "Reuse an authorization that was already consumed by a real payment.",
    implemented: true,
    run: runReplayAttack,
  },
  {
    id: "SIM_08",
    icon: "content_copy",
    title: "Duplicate Payment",
    description:
      "Same mechanism as Replay — a second payment call against a consumed authorization.",
    implemented: false,
  },
];

async function getDemoProduct() {
  const result = await getProducts();
  if (!result.ok || result.data.length === 0)
    throw new Error("No product found — run the seed script first.");
  return (
    result.data.find((p) => p.merchantId === MERCHANT_ID) || result.data[0]
  );
}

async function runPriceManipulation() {
  const product = await getDemoProduct();
  const originalPrice = product.price;

  const step1 = await authorizePurchase({
    agentId: AGENT_ID,
    merchantId: MERCHANT_ID,
    productId: product._id,
    proposedPrice: originalPrice,
    quantity: 1,
    currency: "INR",
  });

  const inflatedPrice = originalPrice + 20000;
  await updateProductPrice(product._id, inflatedPrice);

  const step2 = await authorizePurchase({
    agentId: AGENT_ID,
    merchantId: MERCHANT_ID,
    productId: product._id,
    proposedPrice: originalPrice, // agent still believes the OLD price
    quantity: 1,
    currency: "INR",
  });

  await updateProductPrice(product._id, originalPrice); // reset for repeatability

  return {
    steps: [
      {
        label: "Original Auth",
        detail: `Agent checked price: ₹${originalPrice}`,
        ok: step1.data.decision === "ALLOW",
      },
      {
        label: "Attack Mutation",
        detail: `Merchant changed price to ₹${inflatedPrice}`,
        ok: null,
      },
      {
        label: "Policy Re-verification",
        detail: "Checking price_integrity against live catalog",
        ok: null,
      },
      {
        label: "Final Decision",
        detail: step2.data.decision,
        ok: step2.data.decision === "DENY",
      },
    ],
    final: step2.data,
  };
}

async function runQuantityManipulation() {
  const product = await getDemoProduct();
  const result = await authorizePurchase({
    agentId: AGENT_ID,
    merchantId: MERCHANT_ID,
    productId: product._id,
    proposedPrice: product.price,
    quantity: 5, // agent policy limit is 2
    currency: "INR",
  });
  return {
    steps: [
      {
        label: "Proposal",
        detail: "Agent requests quantity: 5 (limit: 2)",
        ok: null,
      },
      {
        label: "Policy Check",
        detail: "quantity vs agentPolicy.quantityLimit",
        ok: null,
      },
      {
        label: "Final Decision",
        detail: result.data.decision,
        ok: result.data.decision === "DENY",
      },
    ],
    final: result.data,
  };
}

async function runBudgetEscalation() {
  const product = await getDemoProduct();
  const result = await authorizePurchase({
    agentId: AGENT_ID,
    merchantId: MERCHANT_ID,
    productId: product._id,
    proposedPrice: product.price,
    quantity: 2, // pushes total over the ₹60,000 per-transaction limit
    currency: "INR",
  });
  return {
    steps: [
      {
        label: "Proposal",
        detail: `Total cost: ₹${product.price * 2} (limit: ₹60,000)`,
        ok: null,
      },
      {
        label: "Policy Check",
        detail: "totalCost vs agentPolicy.perTransactionLimit",
        ok: null,
      },
      {
        label: "Final Decision",
        detail: result.data.decision,
        ok: result.data.decision === "ESCALATE",
      },
    ],
    final: result.data,
  };
}

async function runMerchantSubstitution() {
  const product = await getDemoProduct();
  const result = await authorizePurchase({
    agentId: AGENT_ID,
    merchantId: "merchant_evil_unverified", // does not match authoritative product.merchantId
    productId: product._id,
    proposedPrice: product.price,
    quantity: 1,
    currency: "INR",
  });
  return {
    steps: [
      {
        label: "Proposal",
        detail: "Claims merchant: merchant_evil_unverified",
        ok: null,
      },
      {
        label: "Authoritative Check",
        detail: `Actual product merchant: ${product.merchantId}`,
        ok: null,
      },
      {
        label: "Final Decision",
        detail: result.data.decision,
        ok: result.data.decision === "DENY",
      },
    ],
    final: result.data,
  };
}

async function runCurrencyManipulation() {
  const product = await getDemoProduct();
  const result = await authorizePurchase({
    agentId: AGENT_ID,
    merchantId: MERCHANT_ID,
    productId: product._id,
    proposedPrice: product.price,
    quantity: 1,
    currency: "USD", // agent policy only allows INR
  });
  return {
    steps: [
      { label: "Proposal", detail: "Currency: USD (allowed: INR)", ok: null },
      {
        label: "Policy Check",
        detail: "currency vs agentPolicy.allowedCurrencies",
        ok: null,
      },
      {
        label: "Final Decision",
        detail: result.data.decision,
        ok: result.data.decision === "DENY",
      },
    ],
    final: result.data,
  };
}

async function runReplayAttack() {
  const product = await getDemoProduct();
  const authResult = await authorizePurchase({
    agentId: AGENT_ID,
    merchantId: MERCHANT_ID,
    productId: product._id,
    proposedPrice: product.price,
    quantity: 1,
    currency: "INR",
  });

  if (authResult.data.decision !== "ALLOW") {
    return {
      steps: [
        {
          label: "Setup failed",
          detail: "Could not obtain a fresh authorization to replay",
          ok: false,
        },
      ],
      final: authResult.data,
    };
  }

  const authId = authResult.data.authorization.authorizationId;
  const firstPay = await executePayment(authId);
  const replayPay = await executePayment(authId); // reuse the SAME authorizationId

  return {
    steps: [
      { label: "Authorize", detail: `Issued ${authId}`, ok: true },
      {
        label: "First Payment",
        detail: firstPay.data.success ? "Order created" : "Failed",
        ok: firstPay.data.success,
      },
      {
        label: "Replay Attempt",
        detail: "Same authorizationId reused",
        ok: null,
      },
      {
        label: "Final Decision",
        detail: replayPay.data.reason_code || "ALLOW",
        ok: replayPay.data.decision === "DENY",
      },
    ],
    final: replayPay.data,
  };
}

export default function AttackSimulator() {
  const [running, setRunning] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [activeAttack, setActiveAttack] = useState(null);

  async function handleRun(attack) {
    setRunning(attack.id);
    setError(null);
    setActiveAttack(attack);
    try {
      const outcome = await attack.run();
      setResult(outcome);
    } catch (err) {
      setError(err.message);
      setResult(null);
    } finally {
      setRunning(null);
    }
  }

  return (
    <main className="ml-64 pt-20 p-6 max-w-[1440px] mx-auto min-h-screen">
      <div className="border-b border-ui-border pb-6 mb-6">
        <div className="flex items-center gap-4 mb-2">
          <span className="material-symbols-outlined text-on-surface text-3xl">
            bug_report
          </span>
          <h2 className="text-3xl text-on-surface">Attack Simulator</h2>
        </div>
        <p className="text-sm text-on-surface-variant max-w-3xl">
          Test policy resilience against adversarial agent mutations. Every card
          below hits the real backend — no scripted results.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {ATTACKS.map((attack) => (
          <div
            key={attack.id}
            className="bg-surface-container border border-ui-border p-6 rounded-lg hover:border-active-focus transition-colors duration-300 flex flex-col justify-between"
          >
            <div>
              <div className="flex justify-between items-start mb-4">
                <span className="material-symbols-outlined text-on-surface-variant text-2xl">
                  {attack.icon}
                </span>
                <span className="text-[10px] text-on-surface-variant bg-surface-container-high px-2 py-1 rounded">
                  {attack.id}
                </span>
              </div>
              <h3 className="text-base font-semibold text-on-surface mb-2">
                {attack.title}
              </h3>
              <p className="text-sm text-on-surface-variant">
                {attack.description}
              </p>
            </div>
            <button
              disabled={!attack.implemented || running}
              onClick={() => handleRun(attack)}
              className={`mt-6 w-full py-2 border rounded-lg text-xs tracking-widest transition-all duration-200 ${
                !attack.implemented
                  ? "border-ui-border text-on-surface-variant opacity-40 cursor-not-allowed"
                  : "border-ui-border text-on-surface hover:border-active-focus hover:text-active-focus"
              }`}
            >
              {running === attack.id
                ? "RUNNING..."
                : attack.implemented
                  ? "RUN ATTACK"
                  : "MANUAL ONLY"}
            </button>
          </div>
        ))}
      </div>

      {error && (
        <div className="mt-6 bg-status-red/10 border border-status-red/50 text-status-red p-4 rounded-lg text-sm">
          {error}
        </div>
      )}

      {result && activeAttack && (
        <div className="bg-surface-container-low border border-ui-border p-8 rounded-lg mt-6">
          <div className="flex justify-between items-end mb-8 border-b border-ui-border pb-4">
            <div>
              <h3 className="text-xs text-on-surface-variant tracking-widest mb-1">
                SIMULATION TRACE
              </h3>
              <p className="text-2xl text-on-surface">
                [{activeAttack.title.toUpperCase().replace(/ /g, "_")}]
              </p>
            </div>
            <span className="text-[10px] bg-surface-container-high px-2 py-1 rounded text-on-surface-variant">
              {new Date().toLocaleTimeString("en-IN", { hour12: false })} IST
            </span>
          </div>

          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 font-mono text-sm">
            {result.steps.map((step, i) => (
              <div key={i} className="flex items-center gap-4 flex-1">
                <div
                  className={`flex-1 bg-surface border p-4 rounded-lg ${
                    step.ok === true
                      ? "border-status-green"
                      : step.ok === false
                        ? "border-status-red"
                        : "border-ui-border"
                  }`}
                >
                  <p className="text-on-surface-variant text-[10px] mb-2">
                    STEP_{String(i + 1).padStart(2, "0")}
                  </p>
                  <p className="text-on-surface">{step.label}</p>
                  <p className="text-[10px] text-on-surface-variant mt-1">
                    {step.detail}
                  </p>
                </div>
                {i < result.steps.length - 1 && (
                  <span className="material-symbols-outlined text-outline-variant hidden md:block">
                    arrow_forward
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="mt-6 bg-surface border border-ui-border p-4 rounded-lg">
            <p className="text-[10px] text-on-surface-variant mb-1">
              FINAL RESPONSE (raw)
            </p>
            <pre className="text-xs text-on-surface-variant overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(result.final, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </main>
  );
}
