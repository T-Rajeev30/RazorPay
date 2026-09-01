/**
 * generateScenarios.js
 *
 * Generates a reproducible set of synthetic test scenarios against the
 * live PayGuard backend. Each scenario specifies a proposal to send and
 * the EXPECTED outcome per the policy rules — runEvaluation.js measures
 * whether the real backend actually matches that expectation. Nothing
 * here is a hardcoded metric, only an expected outcome derived from the
 * policy logic itself.
 */

const AGENT_ID = "shopping-agent-01";
const MERCHANT_ID = "merchant_123";

/**
 * @param {Object} catalog - { cheapProduct, expensiveProduct } — real
 *   product records fetched live from the backend at runtime.
 */
function generateScenarios(catalog) {
  const { cheapProduct, expensiveProduct } = catalog;
  const scenarios = [];

  // --- Legitimate transactions (should ALLOW) ---
  for (let i = 0; i < 60; i++) {
    scenarios.push({
      type: "LEGITIMATE",
      proposal: {
        agentId: AGENT_ID,
        merchantId: MERCHANT_ID,
        productId: cheapProduct._id,
        proposedPrice: cheapProduct.price,
        quantity: 1,
        currency: "INR",
      },
      expectedDecision: "ALLOW",
      expectedReasonCode: null,
    });
  }

  // --- Price manipulation: runner mutates live price to create a real mismatch ---
  for (let i = 0; i < 15; i++) {
    scenarios.push({
      type: "PRICE_MANIPULATION",
      proposal: {
        agentId: AGENT_ID,
        merchantId: MERCHANT_ID,
        productId: cheapProduct._id,
        proposedPrice: cheapProduct.price, // agent's stale belief
        quantity: 1,
        currency: "INR",
        _inflatedPrice: cheapProduct.price + 5000 + i * 100,
      },
      expectedDecision: "DENY",
      expectedReasonCode: "PRICE_CHANGED",
    });
  }

  // --- Quantity manipulation ---
  for (let i = 0; i < 15; i++) {
    scenarios.push({
      type: "QUANTITY_MANIPULATION",
      proposal: {
        agentId: AGENT_ID,
        merchantId: MERCHANT_ID,
        productId: cheapProduct._id,
        proposedPrice: cheapProduct.price,
        quantity: 5 + i, // agent policy limit is 2
        currency: "INR",
      },
      expectedDecision: "DENY",
      expectedReasonCode: "QUANTITY_EXCEEDED",
    });
  }

  // --- Budget escalation (expensive product) ---
  for (let i = 0; i < 15; i++) {
    scenarios.push({
      type: "BUDGET_ESCALATION",
      proposal: {
        agentId: AGENT_ID,
        merchantId: MERCHANT_ID,
        productId: expensiveProduct._id,
        proposedPrice: expensiveProduct.price,
        quantity: 1,
        currency: "INR",
      },
      expectedDecision: "ESCALATE",
      expectedReasonCode: "BUDGET_EXCEEDED",
    });
  }

  // --- Merchant substitution ---
  for (let i = 0; i < 15; i++) {
    scenarios.push({
      type: "MERCHANT_SUBSTITUTION",
      proposal: {
        agentId: AGENT_ID,
        merchantId: `merchant_unverified_${i}`,
        productId: cheapProduct._id,
        proposedPrice: cheapProduct.price,
        quantity: 1,
        currency: "INR",
      },
      expectedDecision: "DENY",
      expectedReasonCode: "MERCHANT_MISMATCH",
    });
  }

  // --- Currency manipulation ---
  for (let i = 0; i < 15; i++) {
    scenarios.push({
      type: "CURRENCY_MANIPULATION",
      proposal: {
        agentId: AGENT_ID,
        merchantId: MERCHANT_ID,
        productId: cheapProduct._id,
        proposedPrice: cheapProduct.price,
        quantity: 1,
        currency: i % 2 === 0 ? "USD" : "EUR",
      },
      expectedDecision: "DENY",
      expectedReasonCode: "CURRENCY_NOT_ALLOWED",
    });
  }

  return scenarios;
}

module.exports = { generateScenarios, AGENT_ID, MERCHANT_ID };
