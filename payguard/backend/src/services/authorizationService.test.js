const {
  authorizePurchase,
  verifyAuthorizationSignature,
  consumeAuthorization,
} = require("./authorizationService");

const SECRET = "test-signing-secret";

function basePolicy() {
  return {
    canCreatePayment: true,
    perTransactionLimit: 60000,
    quantityLimit: 2,
    allowedCurrencies: ["INR"],
    merchantAllowlist: ["merchant_123"],
    authorizationTtlSeconds: 30,
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

describe("authorizationService.authorizePurchase", () => {
  test("issues a signed authorization when policy ALLOWs", () => {
    const result = authorizePurchase(
      baseProposal(),
      baseAuthoritative(),
      basePolicy(),
      null,
      SECRET,
    );

    expect(result.decision).toBe("ALLOW");
    expect(result.authorization).toBeDefined();
    expect(result.authorization.status).toBe("ACTIVE");
    expect(result.authorization.amount).toBe(49999);
    expect(result.authorization.signature).toHaveLength(64); // sha256 hex
  });

  test("does NOT issue an authorization when policy DENYs (price-change attack)", () => {
    const authoritative = { ...baseAuthoritative(), currentPrice: 69999 };
    const result = authorizePurchase(
      baseProposal(),
      authoritative,
      basePolicy(),
      null,
      SECRET,
    );

    expect(result.decision).toBe("DENY");
    expect(result.reason_code).toBe("PRICE_CHANGED");
    expect(result.authorization).toBeUndefined();
  });

  test("does NOT issue an authorization when policy ESCALATEs", () => {
    const proposal = { ...baseProposal(), proposedPrice: 72000 };
    const authoritative = { ...baseAuthoritative(), currentPrice: 72000 };
    const result = authorizePurchase(
      proposal,
      authoritative,
      basePolicy(),
      null,
      SECRET,
    );

    expect(result.decision).toBe("ESCALATE");
    expect(result.authorization).toBeUndefined();
  });

  test("issued authorization has a valid, verifiable signature", () => {
    const result = authorizePurchase(
      baseProposal(),
      baseAuthoritative(),
      basePolicy(),
      null,
      SECRET,
    );
    const isValid = verifyAuthorizationSignature(result.authorization, SECRET);
    expect(isValid).toBe(true);
  });

  test("tampering with the authorization amount invalidates the signature", () => {
    const result = authorizePurchase(
      baseProposal(),
      baseAuthoritative(),
      basePolicy(),
      null,
      SECRET,
    );
    const tampered = { ...result.authorization, amount: 999999 };
    const isValid = verifyAuthorizationSignature(tampered, SECRET);
    expect(isValid).toBe(false);
  });

  test("wrong signing secret fails verification", () => {
    const result = authorizePurchase(
      baseProposal(),
      baseAuthoritative(),
      basePolicy(),
      null,
      SECRET,
    );
    const isValid = verifyAuthorizationSignature(
      result.authorization,
      "wrong-secret",
    );
    expect(isValid).toBe(false);
  });
});

describe("authorizationService.consumeAuthorization", () => {
  function activeAuthorization() {
    return {
      authorizationId: "auth_test123",
      status: "ACTIVE",
      expiresAt: new Date(Date.now() + 30000).toISOString(),
      amount: 49999,
    };
  }

  test("successfully consumes an active, unexpired authorization", () => {
    const result = consumeAuthorization(activeAuthorization());
    expect(result.success).toBe(true);
    expect(result.authorization.status).toBe("CONSUMED");
  });

  test("blocks replay of an already-consumed authorization", () => {
    const consumedAuth = { ...activeAuthorization(), status: "CONSUMED" };
    const result = consumeAuthorization(consumedAuth);
    expect(result.success).toBe(false);
    expect(result.reason_code).toBe("AUTHORIZATION_ALREADY_CONSUMED");
  });

  test("blocks consumption of an expired authorization", () => {
    const expiredAuth = {
      ...activeAuthorization(),
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    };
    const result = consumeAuthorization(expiredAuth);
    expect(result.success).toBe(false);
    expect(result.reason_code).toBe("AUTHORIZATION_EXPIRED");
    expect(result.authorization.status).toBe("EXPIRED");
  });
});
