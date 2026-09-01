/**
 * payment.routes.js
 *
 * Executes payment against an already-issued Authorization. This is
 * the ONLY route that talks to Razorpay, and it only ever does so
 * after independently re-verifying the authoritative price at
 * execution time AND atomically consuming the authorization
 * (replay-protecting it against concurrent requests).
 */
const express = require("express");
const Razorpay = require("razorpay");
const Authorization = require("../models/Authorization");
const Product = require("../models/Product");
const AuditLog = require("../models/AuditLog");
const {
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

  // 1. Signature check — proves the record wasn't tampered with since issuance.
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

  // 2. Expiry check — must hold at execution time, not just at issuance.
  if (
    authorization.status === "EXPIRED" ||
    authorization.expiresAt.getTime() < Date.now()
  ) {
    await AuditLog.create(
      buildAuditEvent({
        action: "PAYMENT_BLOCKED",
        agentId: authorization.agentId,
        authorizationId,
        reasonCode: "AUTHORIZATION_EXPIRED",
      }),
    );
    return res
      .status(409)
      .json({ decision: "DENY", reason_code: "AUTHORIZATION_EXPIRED" });
  }

  // 3. EXECUTION-TIME PRICE RE-VERIFICATION — the signature proves the
  // record is authentic, NOT that the world hasn't changed since it was
  // issued. Re-fetch the authoritative product price right now and
  // confirm it still matches what was authorized. This closes the TOCTOU
  // window between /api/authorize and /api/pay, not just within
  // /api/authorize's own re-check.
  const currentProduct = await Product.findById(authorization.productId);
  if (!currentProduct) {
    await AuditLog.create(
      buildAuditEvent({
        action: "PAYMENT_BLOCKED",
        agentId: authorization.agentId,
        authorizationId,
        reasonCode: "PRODUCT_NOT_FOUND",
      }),
    );
    return res
      .status(404)
      .json({ decision: "DENY", reason_code: "PRODUCT_NOT_FOUND" });
  }

  const expectedAmount = currentProduct.price * authorization.quantity;
  if (expectedAmount !== authorization.amount) {
    await AuditLog.create(
      buildAuditEvent({
        action: "PAYMENT_BLOCKED",
        agentId: authorization.agentId,
        authorizationId,
        reasonCode: "PRICE_CHANGED",
        amount: authorization.amount,
        currency: authorization.currency,
        metadata: {
          authorizedAmount: authorization.amount,
          currentAmount: expectedAmount,
        },
      }),
    );
    return res.status(409).json({
      decision: "DENY",
      reason_code: "PRICE_CHANGED",
      authorizedAmount: authorization.amount,
      attemptedAmount: expectedAmount,
    });
  }

  // 4. ATOMIC CONSUMPTION — a plain read-then-write here would let two
  // concurrent /api/pay requests both observe status ACTIVE before either
  // writes CONSUMED, letting both reach Razorpay (double payment). The
  // filter+update must happen as a single database operation so only one
  // concurrent request can ever win the ACTIVE → CONSUMED transition.
  const consumedAuthorization = await Authorization.findOneAndUpdate(
    { authorizationId, status: "ACTIVE" },
    { status: "CONSUMED" },
    { new: true },
  );

  if (!consumedAuthorization) {
    // Either already consumed by a prior request, or consumed by a
    // concurrent request that won the race — both are replay attempts
    // from this request's point of view.
    await AuditLog.create(
      buildAuditEvent({
        action: "REPLAY_BLOCKED",
        agentId: authorization.agentId,
        authorizationId,
        reasonCode: "AUTHORIZATION_ALREADY_CONSUMED",
      }),
    );
    return res.status(409).json({
      decision: "DENY",
      reason_code: "AUTHORIZATION_ALREADY_CONSUMED",
    });
  }

  await AuditLog.create(
    buildAuditEvent({
      action: "AUTHORIZATION_CONSUMED",
      agentId: consumedAuthorization.agentId,
      authorizationId,
      amount: consumedAuthorization.amount,
      currency: consumedAuthorization.currency,
    }),
  );

  await AuditLog.create(
    buildAuditEvent({
      action: "PAYMENT_ATTEMPTED",
      agentId: consumedAuthorization.agentId,
      authorizationId,
      amount: consumedAuthorization.amount,
      currency: consumedAuthorization.currency,
    }),
  );

  const paymentResult = await createOrderForAuthorization(
    razorpayClient,
    consumedAuthorization.toObject(),
  );

  await AuditLog.create(
    buildAuditEvent({
      action: paymentResult.success ? "PAYMENT_ALLOWED" : "PAYMENT_FAILED",
      agentId: consumedAuthorization.agentId,
      authorizationId,
      amount: consumedAuthorization.amount,
      currency: consumedAuthorization.currency,
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
