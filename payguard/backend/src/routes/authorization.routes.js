/**
 * authorization.routes.js
 *
 * The core trust-boundary endpoint. The AI agent (or, for now, the
 * frontend directly) submits a purchase proposal here. This route
 * fetches the AUTHORITATIVE current product/merchant state itself —
 * it never trusts the price/merchant the agent claims — then runs it
 * through the policy engine, persists the result, and writes an
 * audit event.
 */
const express = require("express");
const Product = require("../models/Product");
const AgentPolicy = require("../models/AgentPolicy");
const Authorization = require("../models/Authorization");
const AuditLog = require("../models/AuditLog");
const { authorizePurchase } = require("../services/authorizationService");
const {
  buildAuditEvent,
  auditEventFromPolicyResult,
} = require("../services/auditService");

const router = express.Router();
const SIGNING_SECRET =
  process.env.AUTHORIZATION_SIGNING_SECRET || "dev-secret-change-me";

// POST /api/authorize
// body: { agentId, merchantId, productId, proposedPrice, quantity, currency }
router.post("/", async (req, res) => {
  const proposal = req.body;

  // Audit: the raw proposal itself, before any decision is made.
  await AuditLog.create(
    buildAuditEvent({
      action: "PURCHASE_PROPOSED",
      agentId: proposal.agentId,
      merchantId: proposal.merchantId,
      currency: proposal.currency,
      amount: proposal.proposedPrice,
    }),
  );

  const agentPolicy = await AgentPolicy.findOne({ agentId: proposal.agentId });
  if (!agentPolicy) {
    return res.status(404).json({ error: "AGENT_POLICY_NOT_FOUND" });
  }

  // Fetch AUTHORITATIVE state ourselves — this is the whole point.
  const product = await Product.findById(proposal.productId);
  if (!product) {
    return res.status(404).json({ error: "PRODUCT_NOT_FOUND" });
  }
  const authoritative = {
    currentPrice: product.price,
    currentMerchantId: product.merchantId,
    currentProductId: product._id.toString(),
  };

  const policyResult = authorizePurchase(
    proposal,
    authoritative,
    agentPolicy,
    null,
    SIGNING_SECRET,
  );

  await AuditLog.create(
    buildAuditEvent({
      action: "POLICY_EVALUATED",
      agentId: proposal.agentId,
      merchantId: proposal.merchantId,
      decision: policyResult.decision,
      reasonCode: policyResult.reason_code,
      metadata: { checks: policyResult.checks },
    }),
  );

  if (policyResult.decision === "ALLOW") {
    await Authorization.create(policyResult.authorization);
    await AuditLog.create(
      buildAuditEvent({
        action: "AUTHORIZATION_CREATED",
        agentId: proposal.agentId,
        authorizationId: policyResult.authorization.authorizationId,
        merchantId: proposal.merchantId,
        amount: policyResult.authorization.amount,
        currency: policyResult.authorization.currency,
      }),
    );
  }

  await AuditLog.create(auditEventFromPolicyResult(policyResult, proposal));

  res.json(policyResult);
});

module.exports = router;
