/**
 * seed.js
 *
 * One-off script to populate the database with demo data: a merchant
 * product (the thing the AI agent will try to buy) and an AgentPolicy
 * (the limits/capabilities for the demo shopping agent).
 *
 * Run with: node src/seed.js
 * Safe to re-run — it clears and recreates the demo records each time.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const { connectToDatabase } = require("./db/mongo");
const Product = require("./models/Product");
const AgentPolicy = require("./models/AgentPolicy");

async function seed() {
  await connectToDatabase();

  // Clear any prior demo data so this script is idempotent.
  await Product.deleteMany({ merchantId: "merchant_123" });
  await AgentPolicy.deleteMany({ agentId: "shopping-agent-01" });

  const product = await Product.create({
    merchantId: "merchant_123",
    name: 'ThinkPad X1 Carbon (14", 16GB RAM)',
    price: 49999,
    currency: "INR",
    quantityAvailable: 10,
  });

  const agentPolicy = await AgentPolicy.create({
    agentId: "shopping-agent-01",
    canCreatePayment: true,
    perTransactionLimit: 60000,
    dailyLimit: 100000,
    quantityLimit: 2,
    allowedCurrencies: ["INR"],
    merchantAllowlist: ["merchant_123"],
    authorizationTtlSeconds: 30,
    humanApprovalAboveAmount: 50000,
  });

  console.log("[seed] Product created:");
  console.log(`  _id: ${product._id}`);
  console.log(`  name: ${product.name}`);
  console.log(`  price: ₹${product.price}`);
  console.log("");
  console.log("[seed] AgentPolicy created:");
  console.log(`  agentId: ${agentPolicy.agentId}`);
  console.log(`  perTransactionLimit: ₹${agentPolicy.perTransactionLimit}`);
  console.log("");
  console.log("Use this productId when testing /api/authorize:");
  console.log(`  ${product._id}`);

  await mongoose.connection.close();
}

seed().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
