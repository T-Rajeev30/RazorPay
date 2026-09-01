/**
 * audit.routes.js
 *
 * Read-only access to the audit trail, for the dashboard's Audit Log
 * screen. No writes happen here — every other route writes its own
 * audit events at the point the event actually occurs.
 */
const express = require("express");
const AuditLog = require("../models/AuditLog");

const router = express.Router();

// GET /api/audit-log?limit=100&action=PAYMENT_BLOCKED&agentId=...
router.get("/", async (req, res) => {
  const { limit = 100, action, agentId, decision } = req.query;

  const filter = {};
  if (action) filter.action = action;
  if (agentId) filter.agentId = agentId;
  if (decision) filter.decision = decision;

  const events = await AuditLog.find(filter)
    .sort({ timestamp: -1 })
    .limit(Math.min(Number(limit), 500));

  res.json(events);
});

module.exports = router;
