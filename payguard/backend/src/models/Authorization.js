/**
 * Authorization.js
 *
 * The signed, structured authorization object issued by the policy
 * engine once a proposal is ALLOWed. Payment execution must reference
 * a valid, unconsumed, unexpired Authorization — never a raw proposal.
 */
const mongoose = require("mongoose");

const authorizationSchema = new mongoose.Schema(
  {
    authorizationId: { type: String, required: true, unique: true },
    agentId: { type: String, required: true },
    merchantId: { type: String, required: true },
    productId: { type: String, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    quantity: { type: Number, required: true },
    policyVersion: { type: String, required: true, default: "v1" },
    status: {
      type: String,
      required: true,
      enum: ["ACTIVE", "CONSUMED", "EXPIRED", "DENIED", "ESCALATED"],
      default: "ACTIVE",
    },
    nonce: { type: String, required: true },
    signature: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Authorization", authorizationSchema);
