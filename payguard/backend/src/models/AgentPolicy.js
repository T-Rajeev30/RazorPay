/**
 * AgentPolicy.js
 *
 * Capability/limits configuration for a given AI agent. This is the
 * config the policy engine reads to know what the agent is allowed
 * to do — the agent itself never gets to set or change these values.
 */
const mongoose = require("mongoose");

const agentPolicySchema = new mongoose.Schema(
  {
    agentId: { type: String, required: true, unique: true },
    canCreatePayment: { type: Boolean, required: true, default: true },
    perTransactionLimit: { type: Number, required: true },
    dailyLimit: { type: Number, required: true },
    quantityLimit: { type: Number, required: true, default: 1 },
    allowedCurrencies: { type: [String], required: true, default: ["INR"] },
    merchantAllowlist: { type: [String], required: true, default: [] },
    authorizationTtlSeconds: { type: Number, required: true, default: 30 },
    humanApprovalAboveAmount: { type: Number, required: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model("AgentPolicy", agentPolicySchema);
