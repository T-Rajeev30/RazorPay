/**
 * server.js
 *
 * Application entry point. Wires up middleware, routes, and the DB
 * connection, then starts listening. No business logic lives here.
 */
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { connectToDatabase } = require("./db/mongo");

const catalogRoutes = require("./routes/catalog.routes");
const authorizationRoutes = require("./routes/authorization.routes");
const paymentRoutes = require("./routes/payment.routes");
const auditRoutes = require("./routes/audit.routes");
const approvalRoutes = require("./routes/approval.routes");
const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/products", catalogRoutes);
app.use("/api/authorize", authorizationRoutes);
app.use("/api/pay", paymentRoutes);
app.use("/api/audit-log", auditRoutes);
app.use("/api/approvals", approvalRoutes);
app.get("/api/health", (req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 4000;

async function start() {
  await connectToDatabase();
  app.listen(PORT, () =>
    console.log(`[server] PayGuard backend listening on port ${PORT}`),
  );
}

start().catch((err) => {
  console.error("[server] failed to start:", err);
  process.exit(1);
});
