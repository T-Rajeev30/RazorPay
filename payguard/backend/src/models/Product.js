/**
 * Product.js
 *
 * Represents a merchant catalog item — the "authoritative" source of
 * truth the policy engine checks proposals against. The `price` field
 * is deliberately mutable (via the catalog routes) so the demo can
 * simulate a merchant changing price after the AI agent last read it.
 */
const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    merchantId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    price: { type: Number, required: true }, // current authoritative price, INR
    currency: { type: String, required: true, default: "INR" },
    quantityAvailable: { type: Number, required: true, default: 100 },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Product", productSchema);
