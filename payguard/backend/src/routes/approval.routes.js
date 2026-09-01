/**
 * approval.routes.js
 *
 * Human-in-the-loop review for ESCALATED authorizations. Approving
 * flips status to ACTIVE (so it can then go through /api/pay normally).
 * Rejecting flips it to DENIED, permanently closing it off.
 */
const express = require("express");
const Authorization = require("../models/Authorization");
const AuditLog = require("../models/AuditLog");
const { buildAuditEvent } = require("../services/auditService");

const router = express.Router();

// GET /api/approvals — pending escalations awaiting human review
router.get("/", async (req, res) => {
  const pending = await Authorization.find({ status: "ESCALATED" }).sort({
    createdAt: -1,
  });
  res.json(pending);
});

// POST /api/approvals/:authorizationId/approve
router.post("/:authorizationId/approve", async (req, res) => {
  const authorization = await Authorization.findOne({
    authorizationId: req.params.authorizationId,
  });
  if (!authorization)
    return res.status(404).json({ error: "AUTHORIZATION_NOT_FOUND" });
  if (authorization.status !== "ESCALATED") {
    return res.status(409).json({
      error: "NOT_PENDING_APPROVAL",
      currentStatus: authorization.status,
    });
  }

  authorization.status = "ACTIVE";
  await authorization.save();

  await AuditLog.create(
    buildAuditEvent({
      action: "HUMAN_APPROVAL_GRANTED",
      agentId: authorization.agentId,
      authorizationId: authorization.authorizationId,
      amount: authorization.amount,
      currency: authorization.currency,
    }),
  );

  res.json(authorization);
});

// POST /api/approvals/:authorizationId/reject
router.post("/:authorizationId/reject", async (req, res) => {
  const authorization = await Authorization.findOne({
    authorizationId: req.params.authorizationId,
  });
  if (!authorization)
    return res.status(404).json({ error: "AUTHORIZATION_NOT_FOUND" });
  if (authorization.status !== "ESCALATED") {
    return res.status(409).json({
      error: "NOT_PENDING_APPROVAL",
      currentStatus: authorization.status,
    });
  }

  authorization.status = "DENIED";
  await authorization.save();

  await AuditLog.create(
    buildAuditEvent({
      action: "HUMAN_APPROVAL_REJECTED",
      agentId: authorization.agentId,
      authorizationId: authorization.authorizationId,
      amount: authorization.amount,
      currency: authorization.currency,
    }),
  );

  res.json(authorization);
});

module.exports = router;
