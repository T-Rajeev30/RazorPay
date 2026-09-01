/**
 * policyEngine.js
 *
 * Single responsibility: given a purchase proposal (from the AI agent)
 * and the authoritative current state (fresh catalog price, agent policy,
 * prior authorization record if any), decide ALLOW / DENY / ESCALATE.
 *
 * This module is pure and deterministic — no network calls, no LLM calls,
 * no database access. It only reasons over the data it is given. That is
 * the whole point: this is the trust boundary the AI cannot cross.
 *
 * Reason codes (see README/docs/security-model.md for the full list):
 *   PRICE_CHANGED, BUDGET_EXCEEDED, QUANTITY_EXCEEDED, MERCHANT_MISMATCH,
 *   CURRENCY_NOT_ALLOWED, AUTHORIZATION_EXPIRED,
 *   AUTHORIZATION_ALREADY_CONSUMED, AGENT_NOT_AUTHORIZED, PRODUCT_MISMATCH
 */

const HIGH_VALUE_THRESHOLD = 50000; // paise-free, plain INR rupees for MVP

/**
 * @param {Object} proposal - what the AI agent is proposing to buy
 * @param {string} proposal.agentId
 * @param {string} proposal.merchantId
 * @param {string} proposal.productId
 * @param {number} proposal.proposedPrice   - price the agent last saw
 * @param {number} proposal.quantity
 * @param {string} proposal.currency
 *
 * @param {Object} authoritative - ground-truth state fetched independently
 *   by the policy engine's caller (never trust the agent's own claims)
 * @param {number} authoritative.currentPrice   - live catalog price right now
 * @param {string} authoritative.currentMerchantId
 * @param {string} authoritative.currentProductId
 *
 * @param {Object} agentPolicy - the capability/limit config for this agent
 * @param {boolean} agentPolicy.canCreatePayment
 * @param {number} agentPolicy.perTransactionLimit
 * @param {number} agentPolicy.quantityLimit
 * @param {string[]} agentPolicy.allowedCurrencies
 * @param {string[]} agentPolicy.merchantAllowlist
 *
 * @param {Object|null} priorAuthorization - existing authorization record, if replaying
 * @param {string} priorAuthorization.status - 'ACTIVE' | 'CONSUMED' | 'EXPIRED'
 * @param {number} priorAuthorization.expiresAt - epoch ms
 *
 * @returns {Object} decision object, see shape below
 */
function evaluatePurchaseProposal(
  proposal,
  authoritative,
  agentPolicy,
  priorAuthorization = null,
) {
  const checks = {
    agent_identity: "PASS",
    merchant: "PASS",
    currency: "PASS",
    quantity: "PASS",
    budget: "PASS",
    price_integrity: "PASS",
    authorization_freshness: "PASS",
    replay: "PASS",
  };

  // 1. Agent authorization to create payments at all
  if (!agentPolicy.canCreatePayment) {
    checks.agent_identity = "FAIL";
    return deny(checks, "AGENT_NOT_AUTHORIZED");
  }

  // 2. Replay protection — has this authorization already been consumed?
  if (priorAuthorization) {
    if (priorAuthorization.status === "CONSUMED") {
      checks.replay = "FAIL";
      return deny(checks, "AUTHORIZATION_ALREADY_CONSUMED");
    }
    if (
      priorAuthorization.status === "EXPIRED" ||
      priorAuthorization.expiresAt < Date.now()
    ) {
      checks.authorization_freshness = "FAIL";
      return deny(checks, "AUTHORIZATION_EXPIRED");
    }
  }

  // 3. Merchant integrity — must match allowlist AND match what agent proposed
  const merchantAllowed = agentPolicy.merchantAllowlist.includes(
    authoritative.currentMerchantId,
  );
  const merchantMatchesProposal =
    proposal.merchantId === authoritative.currentMerchantId;
  if (!merchantAllowed || !merchantMatchesProposal) {
    checks.merchant = "FAIL";
    return deny(checks, "MERCHANT_MISMATCH");
  }

  // 4. Product integrity — proposal must refer to the product actually being charged
  if (proposal.productId !== authoritative.currentProductId) {
    checks.merchant = "FAIL"; // product mismatch is a form of identity mismatch
    return deny(checks, "PRODUCT_MISMATCH");
  }

  // 5. Currency check
  if (!agentPolicy.allowedCurrencies.includes(proposal.currency)) {
    checks.currency = "FAIL";
    return deny(checks, "CURRENCY_NOT_ALLOWED");
  }

  // 6. Quantity check
  if (proposal.quantity > agentPolicy.quantityLimit) {
    checks.quantity = "FAIL";
    return deny(checks, "QUANTITY_EXCEEDED");
  }

  // 7. THE core security check — price integrity (TOCTOU attack defense).
  // The authoritative current price must exactly match what the agent proposed.
  if (authoritative.currentPrice !== proposal.proposedPrice) {
    checks.price_integrity = "FAIL";
    return deny(checks, "PRICE_CHANGED", {
      authorizedAmount: proposal.proposedPrice,
      attemptedAmount: authoritative.currentPrice,
    });
  }

  // 8. Budget check — against the authoritative price, not the proposal
  const totalCost = authoritative.currentPrice * proposal.quantity;
  if (totalCost > agentPolicy.perTransactionLimit) {
    checks.budget = "FAIL";
    // High-value transactions escalate to a human rather than hard-deny,
    // per the bounded-autonomy model.
    if (totalCost > HIGH_VALUE_THRESHOLD) {
      return escalate(checks, "BUDGET_EXCEEDED", {
        amount: totalCost,
        limit: agentPolicy.perTransactionLimit,
      });
    }
    return deny(checks, "BUDGET_EXCEEDED", {
      amount: totalCost,
      limit: agentPolicy.perTransactionLimit,
    });
  }

  // All checks passed.
  return allow(checks, { amount: totalCost });
}

function allow(checks, extra = {}) {
  return { decision: "ALLOW", reason_code: null, checks, ...extra };
}

function deny(checks, reasonCode, extra = {}) {
  return { decision: "DENY", reason_code: reasonCode, checks, ...extra };
}

function escalate(checks, reasonCode, extra = {}) {
  return { decision: "ESCALATE", reason_code: reasonCode, checks, ...extra };
}

module.exports = { evaluatePurchaseProposal, HIGH_VALUE_THRESHOLD };
