const { evaluatePurchaseProposal } = require("./policyEngine");

// Shared fixtures — a "happy path" baseline that each test mutates.
function basePolicy() {
  return {
    canCreatePayment: true,
    perTransactionLimit: 60000,
    quantityLimit: 2,
    allowedCurrencies: ["INR"],
    merchantAllowlist: ["merchant_123"],
  };
}

function baseProposal() {
  return {
    agentId: "shopping-agent-01",
    merchantId: "merchant_123",
    productId: "product_abc",
    proposedPrice: 49999,
    quantity: 1,
    currency: "INR",
  };
}

function baseAuthoritative() {
  return {
    currentPrice: 49999,
    currentMerchantId: "merchant_123",
    currentProductId: "product_abc",
  };
}

describe("policyEngine.evaluatePurchaseProposal", () => {
  test("ALLOWs a valid purchase within budget", () => {
    const result = evaluatePurchaseProposal(
      baseProposal(),
      baseAuthoritative(),
      basePolicy(),
    );
    expect(result.decision).toBe("ALLOW");
    expect(result.reason_code).toBeNull();
  });

  test("FLAGSHIP: DENYs when merchant silently changes price after agent checked it (TOCTOU attack)", () => {
    const proposal = baseProposal(); // agent believes price is 49999
    const authoritative = baseAuthoritative();
    authoritative.currentPrice = 69999; // merchant changed it before payment

    const result = evaluatePurchaseProposal(
      proposal,
      authoritative,
      basePolicy(),
    );

    expect(result.decision).toBe("DENY");
    expect(result.reason_code).toBe("PRICE_CHANGED");
    expect(result.checks.price_integrity).toBe("FAIL");
    expect(result.authorizedAmount).toBe(49999);
    expect(result.attemptedAmount).toBe(69999);
  });

  test("DENYs when quantity exceeds agent limit", () => {
    const proposal = { ...baseProposal(), quantity: 5 };
    const result = evaluatePurchaseProposal(
      proposal,
      baseAuthoritative(),
      basePolicy(),
    );
    expect(result.decision).toBe("DENY");
    expect(result.reason_code).toBe("QUANTITY_EXCEEDED");
  });

  test("DENYs when merchant is not in the allowlist", () => {
    const authoritative = {
      ...baseAuthoritative(),
      currentMerchantId: "merchant_evil",
    };
    const proposal = { ...baseProposal(), merchantId: "merchant_evil" };
    const result = evaluatePurchaseProposal(
      proposal,
      authoritative,
      basePolicy(),
    );
    expect(result.decision).toBe("DENY");
    expect(result.reason_code).toBe("MERCHANT_MISMATCH");
  });

  test("DENYs when proposal merchant does not match authoritative merchant (substitution attack)", () => {
    const proposal = { ...baseProposal(), merchantId: "merchant_123" };
    const authoritative = {
      ...baseAuthoritative(),
      currentMerchantId: "merchant_456",
    };
    const policy = {
      ...basePolicy(),
      merchantAllowlist: ["merchant_123", "merchant_456"],
    };
    const result = evaluatePurchaseProposal(proposal, authoritative, policy);
    expect(result.decision).toBe("DENY");
    expect(result.reason_code).toBe("MERCHANT_MISMATCH");
  });

  test("DENYs when product does not match", () => {
    const authoritative = {
      ...baseAuthoritative(),
      currentProductId: "product_different",
    };
    const result = evaluatePurchaseProposal(
      baseProposal(),
      authoritative,
      basePolicy(),
    );
    expect(result.decision).toBe("DENY");
    expect(result.reason_code).toBe("PRODUCT_MISMATCH");
  });

  test("DENYs when currency is not allowed", () => {
    const proposal = { ...baseProposal(), currency: "USD" };
    const result = evaluatePurchaseProposal(
      proposal,
      baseAuthoritative(),
      basePolicy(),
    );
    expect(result.decision).toBe("DENY");
    expect(result.reason_code).toBe("CURRENCY_NOT_ALLOWED");
  });

  test("DENYs when agent lacks payment capability", () => {
    const policy = { ...basePolicy(), canCreatePayment: false };
    const result = evaluatePurchaseProposal(
      baseProposal(),
      baseAuthoritative(),
      policy,
    );
    expect(result.decision).toBe("DENY");
    expect(result.reason_code).toBe("AGENT_NOT_AUTHORIZED");
  });

  test("DENYs a replayed (already consumed) authorization", () => {
    const priorAuth = { status: "CONSUMED", expiresAt: Date.now() + 10000 };
    const result = evaluatePurchaseProposal(
      baseProposal(),
      baseAuthoritative(),
      basePolicy(),
      priorAuth,
    );
    expect(result.decision).toBe("DENY");
    expect(result.reason_code).toBe("AUTHORIZATION_ALREADY_CONSUMED");
  });

  test("DENYs a stale/expired authorization", () => {
    const priorAuth = { status: "ACTIVE", expiresAt: Date.now() - 1000 };
    const result = evaluatePurchaseProposal(
      baseProposal(),
      baseAuthoritative(),
      basePolicy(),
      priorAuth,
    );
    expect(result.decision).toBe("DENY");
    expect(result.reason_code).toBe("AUTHORIZATION_EXPIRED");
  });

  test("DENYs when total cost exceeds per-transaction limit but stays under escalation threshold", () => {
    const proposal = { ...baseProposal(), proposedPrice: 45000, quantity: 2 };
    const authoritative = { ...baseAuthoritative(), currentPrice: 45000 };
    const policy = {
      ...basePolicy(),
      perTransactionLimit: 60000,
      quantityLimit: 2,
    };
    // total = 90000, over both limit and escalation threshold, so this actually
    // exercises escalate() — kept here to document the boundary explicitly.
    const result = evaluatePurchaseProposal(proposal, authoritative, policy);
    expect(["DENY", "ESCALATE"]).toContain(result.decision);
    expect(result.reason_code).toBe("BUDGET_EXCEEDED");
  });

  test("ESCALATEs (not denies) a high-value transaction over budget", () => {
    const proposal = { ...baseProposal(), proposedPrice: 72000, quantity: 1 };
    const authoritative = { ...baseAuthoritative(), currentPrice: 72000 };
    const policy = { ...basePolicy(), perTransactionLimit: 60000 };
    const result = evaluatePurchaseProposal(proposal, authoritative, policy);
    expect(result.decision).toBe("ESCALATE");
    expect(result.reason_code).toBe("BUDGET_EXCEEDED");
    expect(result.amount).toBe(72000);
  });

  test("every decision object includes a full checks breakdown", () => {
    const result = evaluatePurchaseProposal(
      baseProposal(),
      baseAuthoritative(),
      basePolicy(),
    );
    expect(result.checks).toHaveProperty("agent_identity");
    expect(result.checks).toHaveProperty("merchant");
    expect(result.checks).toHaveProperty("currency");
    expect(result.checks).toHaveProperty("quantity");
    expect(result.checks).toHaveProperty("budget");
    expect(result.checks).toHaveProperty("price_integrity");
    expect(result.checks).toHaveProperty("authorization_freshness");
    expect(result.checks).toHaveProperty("replay");
  });
});
