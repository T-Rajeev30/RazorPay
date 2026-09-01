/**
 * authorizationService.js
 *
 * Single responsibility: turn a policy engine decision into a signed,
 * structured Authorization object (when ALLOWed), and manage the
 * consume/replay lifecycle of that object.
 *
 * This module does NOT talk to the database directly — it is given
 * data and returns data, so it stays pure and testable. The routes
 * layer is responsible for persisting/loading Authorization records.
 *
 * Signing uses Node's built-in crypto (HMAC-SHA256) — a standard,
 * well-tested primitive. No custom cryptography.
 */

const crypto = require("crypto");
const { evaluatePurchaseProposal } = require("./policyEngine");

const POLICY_VERSION = "v1";

/**
 * Runs the policy engine and, if ALLOWed, produces a signed Authorization
 * object ready to be persisted. If DENYed or ESCALATEd, returns the
 * decision with no authorization object.
 *
 * @param {Object} proposal - see policyEngine.js for shape
 * @param {Object} authoritative - see policyEngine.js for shape
 * @param {Object} agentPolicy - see policyEngine.js for shape (must also
 *   include `authorizationTtlSeconds`)
 * @param {Object|null} priorAuthorization - see policyEngine.js for shape
 * @param {string} signingSecret - HMAC secret, injected so tests don't
 *   depend on environment state
 *
 * @returns {Object} { decision, reason_code, checks, authorization? }
 */
function authorizePurchase(
  proposal,
  authoritative,
  agentPolicy,
  priorAuthorization,
  signingSecret,
) {
  const policyResult = evaluatePurchaseProposal(
    proposal,
    authoritative,
    agentPolicy,
    priorAuthorization,
  );

  if (policyResult.decision === "DENY") {
    return policyResult; // no authorization object issued
  }

  // Both ALLOW and ESCALATE get a signed record — ALLOW is immediately
  // usable (ACTIVE), ESCALATE sits pending until a human decides.
  const status = policyResult.decision === "ALLOW" ? "ACTIVE" : "ESCALATED";
  const authorization = buildAuthorization(
    proposal,
    policyResult,
    agentPolicy,
    signingSecret,
    status,
  );
  return { ...policyResult, authorization };
}

function buildAuthorization(
  proposal,
  policyResult,
  agentPolicy,
  signingSecret,
  status = "ACTIVE",
) {
  const nonce = crypto.randomBytes(16).toString("hex");
  const authorizationId = `auth_${crypto.randomBytes(12).toString("hex")}`;
  const now = Date.now();
  const expiresAt = new Date(now + agentPolicy.authorizationTtlSeconds * 1000);

  const payload = {
    authorizationId,
    agentId: proposal.agentId,
    merchantId: proposal.merchantId,
    productId: proposal.productId,
    amount: policyResult.amount,
    currency: proposal.currency,
    quantity: proposal.quantity,
    policyVersion: POLICY_VERSION,
    nonce,
    expiresAt: expiresAt.toISOString(),
  };

  const signature = signPayload(payload, signingSecret);

  return {
    ...payload,
    status,
    signature,
  };
}
/**
 * Deterministic HMAC-SHA256 signature over the canonical JSON of the
 * authorization payload (excluding the signature field itself).
 */
function signPayload(payload, secret) {
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  return crypto.createHmac("sha256", secret).update(canonical).digest("hex");
}

/**
 * Verifies that an authorization's signature matches its contents —
 * i.e. it was genuinely issued by the policy engine and not forged
 * or tampered with in transit/storage.
 */
function verifyAuthorizationSignature(authorization, secret) {
  const { signature, status, ...payload } = authorization;
  const expectedSignature = signPayload(payload, secret);
  return crypto.timingSafeEqual(
    Buffer.from(signature, "hex"),
    Buffer.from(expectedSignature, "hex"),
  );
}

/**
 * Attempts to consume an authorization for payment execution.
 * Enforces replay protection and expiry — the two checks that must
 * hold true at the moment of execution, not just at issuance time.
 *
 * @param {Object} authorization - the stored authorization record
 * @returns {Object} { success: boolean, reason_code?: string, authorization }
 */
function consumeAuthorization(authorization) {
  if (authorization.status === "CONSUMED") {
    return {
      success: false,
      reason_code: "AUTHORIZATION_ALREADY_CONSUMED",
      authorization,
    };
  }

  if (
    authorization.status === "EXPIRED" ||
    new Date(authorization.expiresAt).getTime() < Date.now()
  ) {
    return {
      success: false,
      reason_code: "AUTHORIZATION_EXPIRED",
      authorization: { ...authorization, status: "EXPIRED" },
    };
  }

  return {
    success: true,
    authorization: { ...authorization, status: "CONSUMED" },
  };
}

module.exports = {
  authorizePurchase,
  buildAuthorization,
  signPayload,
  verifyAuthorizationSignature,
  consumeAuthorization,
};
