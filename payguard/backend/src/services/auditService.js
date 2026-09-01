/**
 * auditService.js
 *
 * Single responsibility: construct well-formed audit log event objects.
 * This module does NOT write to the database — it builds the event
 * object; the routes/controller layer is responsible for persisting it
 * via the AuditLog model. Keeping this pure makes every event shape
 * independently testable without a database.
 */

const crypto = require("crypto");

const VALID_ACTIONS = [
  "PURCHASE_PROPOSED",
  "POLICY_EVALUATED",
  "AUTHORIZATION_CREATED",
  "AUTHORIZATION_EXPIRED",
  "PAYMENT_ATTEMPTED",
  "PAYMENT_ALLOWED",
  "PAYMENT_BLOCKED",
  "PAYMENT_FAILED",
  "HUMAN_APPROVAL_REQUESTED",
  "HUMAN_APPROVAL_GRANTED",
  "HUMAN_APPROVAL_REJECTED",
  "AUTHORIZATION_CONSUMED",
  "REPLAY_BLOCKED",
];

const POLICY_VERSION = "v1";

/**
 * Builds a single audit event. Throws if given an action outside the
 * known set — audit events are not free-text, they're a closed
 * vocabulary by design so the Audit Log UI and evaluation runner can
 * rely on it.
 *
 * @param {Object} params
 * @param {string} params.action - one of VALID_ACTIONS
 * @param {string} params.agentId
 * @param {string|null} [params.authorizationId]
 * @param {string|null} [params.merchantId]
 * @param {'ALLOW'|'DENY'|'ESCALATE'|null} [params.decision]
 * @param {string|null} [params.reasonCode]
 * @param {number|null} [params.amount]
 * @param {string|null} [params.currency]
 * @param {Object} [params.metadata]
 * @param {Date} [params.timestamp] - injectable for deterministic tests
 *
 * @returns {Object} a fully-formed audit event ready to persist
 */
function buildAuditEvent(params) {
  const {
    action,
    agentId,
    authorizationId = null,
    merchantId = null,
    decision = null,
    reasonCode = null,
    amount = null,
    currency = null,
    metadata = {},
    timestamp = new Date(),
  } = params;

  if (!VALID_ACTIONS.includes(action)) {
    throw new Error(`Invalid audit action: "${action}"`);
  }
  if (!agentId) {
    throw new Error("buildAuditEvent requires agentId");
  }

  return {
    eventId: `evt_${crypto.randomBytes(12).toString("hex")}`,
    timestamp,
    authorizationId,
    agentId,
    merchantId,
    action,
    decision,
    reasonCode,
    amount,
    currency,
    policyVersion: POLICY_VERSION,
    metadata,
  };
}

/**
 * Convenience builder: turns a policy engine / authorizationService
 * decision object directly into the matching audit event, so callers
 * don't have to hand-map fields at every call site.
 *
 * @param {Object} policyResult - the object returned by
 *   authorizationService.authorizePurchase / evaluatePurchaseProposal
 * @param {Object} proposal - the original purchase proposal
 */
function auditEventFromPolicyResult(policyResult, proposal) {
  const actionByDecision = {
    ALLOW: "PAYMENT_ALLOWED",
    DENY: "PAYMENT_BLOCKED",
    ESCALATE: "HUMAN_APPROVAL_REQUESTED",
  };

  const action = actionByDecision[policyResult.decision];
  if (!action) {
    throw new Error(`Unrecognized policy decision: "${policyResult.decision}"`);
  }

  return buildAuditEvent({
    action,
    agentId: proposal.agentId,
    authorizationId: policyResult.authorization
      ? policyResult.authorization.authorizationId
      : null,
    merchantId: proposal.merchantId,
    decision: policyResult.decision,
    reasonCode: policyResult.reason_code,
    amount: policyResult.amount ?? policyResult.attemptedAmount ?? null,
    currency: proposal.currency,
    metadata: {
      checks: policyResult.checks,
      ...(policyResult.authorizedAmount !== undefined && {
        authorizedAmount: policyResult.authorizedAmount,
      }),
      ...(policyResult.attemptedAmount !== undefined && {
        attemptedAmount: policyResult.attemptedAmount,
      }),
    },
  });
}

module.exports = { buildAuditEvent, auditEventFromPolicyResult, VALID_ACTIONS };
