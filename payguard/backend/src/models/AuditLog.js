/**
 * AuditLog.js
 *
 * Immutable-by-convention event log. The application layer never
 * updates or deletes entries — only inserts. Every meaningful action
 * in the system (proposal, policy decision, payment attempt, human
 * approval, replay block, etc.) writes one of these.
 */
const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true },
    timestamp: { type: Date, required: true, default: Date.now },
    authorizationId: { type: String, default: null },
    agentId: { type: String, required: true },
    merchantId: { type: String, default: null },
    action: {
      type: String,
      required: true,
      enum: [
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
      ],
    },
    decision: {
      type: String,
      enum: ["ALLOW", "DENY", "ESCALATE", null],
      default: null,
    },
    reasonCode: { type: String, default: null },
    amount: { type: Number, default: null },
    currency: { type: String, default: null },
    policyVersion: { type: String, default: "v1" },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: false }, // we manage `timestamp` ourselves for audit precision
);

module.exports = mongoose.model("AuditLog", auditLogSchema);
