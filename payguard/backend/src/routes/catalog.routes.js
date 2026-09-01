/**
 * catalog.routes.js
 *
 * Merchant catalog API. GET is what the AI agent reads to form a
 * proposal. The PATCH price-mutation endpoint exists specifically to
 * power the flagship demo: simulating a merchant silently changing
 * price between the agent's read and payment execution.
 */
const express = require("express");
const Product = require("../models/Product");

const router = express.Router();

// GET /api/products — full catalog (what the AI agent "sees")
router.get("/", async (req, res) => {
  const products = await Product.find({});
  res.json(products);
});

// GET /api/products/:id — single product, authoritative current state
router.get("/:id", async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ error: "PRODUCT_NOT_FOUND" });
  res.json(product);
});

// PATCH /api/products/:id/price — DEMO ONLY: simulates a merchant
// changing price after the agent already read it. In a real system
// this would just be normal merchant-side catalog management; here
// it's exposed so the Attack Simulator can trigger it on demand.
router.patch("/:id/price", async (req, res) => {
  const { price } = req.body;
  if (typeof price !== "number" || price <= 0) {
    return res.status(400).json({ error: "INVALID_PRICE" });
  }

  const product = await Product.findByIdAndUpdate(
    req.params.id,
    { price },
    { new: true },
  );
  if (!product) return res.status(404).json({ error: "PRODUCT_NOT_FOUND" });
  res.json(product);
});

module.exports = router;
