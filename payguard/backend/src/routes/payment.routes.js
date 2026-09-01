/**
 * payment.routes.js
 *
 * Executes payment against an already-issued Authorization. This is
 * the ONLY route that talks to Razorpay, and it only ever does so
 * after successfully consuming (and thereby replay-protecting) the
 * authorization record.
 */
const express = require("express");
const Razorpay = require("razorpay");
const Authorization = require("../models/Authorization");
const AuditLog = require("../models/AuditLog");
const {
  consumeAuthorization,
  verifyAuthorizationSignature,
} = require("../services/authorizationService");
const { createOrderForAuthorization } = require("../services/razorpayService");
const { buildAuditEvent } = require("../services/auditService");

const router = express.Router();
const SIGNING_SECRET =
  process.env.AUTHORIZATION_SIGNING_SECRET || "dev-secret-change-me";

const razorpayClient = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// POST /api/pay
// body: { authorizationId }
router.post("/", async (req, res) => {
  const { authorizationId } = req.body;

  const authorization = await Authorization.findOne({ authorizationId });
  if (!authorization) {
    return res.status(404).json({ error: "AUTHORIZATION_NOT_FOUND" });
  }

  // Build the exact payload that was originally signed — Mongoose adds
  // its own fields (_id, __v, createdAt, updatedAt, status) which must
  // NOT be included, or the recomputed signature will never match.
  const signedFields = {
    authorizationId: authorization.authorizationId,
    agentId: authorization.agentId,
    merchantId: authorization.merchantId,
    productId: authorization.productId,
    amount: authorization.amount,
    currency: authorization.currency,
    quantity: authorization.quantity,
    policyVersion: authorization.policyVersion,
    nonce: authorization.nonce,
    expiresAt: authorization.expiresAt.toISOString(),
    signature: authorization.signature,
  };

  const isSignatureValid = verifyAuthorizationSignature(
    signedFields,
    SIGNING_SECRET,
  );
  if (!isSignatureValid) {
    await AuditLog.create(
      buildAuditEvent({
        action: "PAYMENT_BLOCKED",
        agentId: authorization.agentId,
        authorizationId,
        reasonCode: "AUTHORIZATION_SIGNATURE_INVALID",
      }),
    );
    return res.status(403).json({
      decision: "DENY",
      reason_code: "AUTHORIZATION_SIGNATURE_INVALID",
    });
  }

  // consumeAuthorization only needs status + expiresAt + the signed
  // fields — pass the same clean object plus the current status.
  const consumeResult = consumeAuthorization({
    ...signedFields,
    status: authorization.status,
    expiresAt: authorization.expiresAt,
  });

  if (!consumeResult.success) {
    const action =
      consumeResult.reason_code === "AUTHORIZATION_ALREADY_CONSUMED"
        ? "REPLAY_BLOCKED"
        : "PAYMENT_BLOCKED";
    await AuditLog.create(
      buildAuditEvent({
        action,
        agentId: authorization.agentId,
        authorizationId,
        reasonCode: consumeResult.reason_code,
      }),
    );
    return res
      .status(409)
      .json({ decision: "DENY", reason_code: consumeResult.reason_code });
  }

  // Persist the CONSUMED status BEFORE calling Razorpay — this closes
  // the replay window; a second request can never reach this point.
  authorization.status = "CONSUMED";
  await authorization.save();

  await AuditLog.create(
    buildAuditEvent({
      action: "AUTHORIZATION_CONSUMED",
      agentId: authorization.agentId,
      authorizationId,
      amount: authorization.amount,
      currency: authorization.currency,
    }),
  );

  await AuditLog.create(
    buildAuditEvent({
      action: "PAYMENT_ATTEMPTED",
      agentId: authorization.agentId,
      authorizationId,
      amount: authorization.amount,
      currency: authorization.currency,
    }),
  );

  const paymentResult = await createOrderForAuthorization(
    razorpayClient,
    consumeResult.authorization,
  );

  await AuditLog.create(
    buildAuditEvent({
      action: paymentResult.success ? "PAYMENT_ALLOWED" : "PAYMENT_FAILED",
      agentId: authorization.agentId,
      authorizationId,
      amount: authorization.amount,
      currency: authorization.currency,
      reasonCode: paymentResult.success
        ? null
        : paymentResult.error.reason_code,
    }),
  );

  if (!paymentResult.success) {
    return res.status(502).json(paymentResult);
  }

  res.json(paymentResult);
});

module.exports = router;
