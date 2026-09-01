const {
  buildAuditEvent,
  auditEventFromPolicyResult,
  VALID_ACTIONS,
} = require("./auditService");

describe("auditService.buildAuditEvent", () => {
  test("builds a well-formed event with required fields", () => {
    const event = buildAuditEvent({
      action: "PAYMENT_ALLOWED",
      agentId: "shopping-agent-01",
      merchantId: "merchant_123",
      decision: "ALLOW",
      amount: 49999,
      currency: "INR",
    });

    expect(event.eventId).toMatch(/^evt_/);
    expect(event.action).toBe("PAYMENT_ALLOWED");
    expect(event.agentId).toBe("shopping-agent-01");
    expect(event.decision).toBe("ALLOW");
    expect(event.amount).toBe(49999);
    expect(event.timestamp).toBeInstanceOf(Date);
    expect(event.policyVersion).toBe("v1");
  });

  test("defaults optional fields to null/empty", () => {
    const event = buildAuditEvent({
      action: "PURCHASE_PROPOSED",
      agentId: "agent-01",
    });
    expect(event.authorizationId).toBeNull();
    expect(event.merchantId).toBeNull();
    expect(event.decision).toBeNull();
    expect(event.reasonCode).toBeNull();
    expect(event.amount).toBeNull();
    expect(event.metadata).toEqual({});
  });

  test("rejects an unrecognized action", () => {
    expect(() =>
      buildAuditEvent({ action: "MADE_UP_ACTION", agentId: "agent-01" }),
    ).toThrow(/Invalid audit action/);
  });

  test("rejects a missing agentId", () => {
    expect(() => buildAuditEvent({ action: "PURCHASE_PROPOSED" })).toThrow(
      /requires agentId/,
    );
  });

  test("every action in VALID_ACTIONS is accepted", () => {
    VALID_ACTIONS.forEach((action) => {
      expect(() =>
        buildAuditEvent({ action, agentId: "agent-01" }),
      ).not.toThrow();
    });
  });

  test("generated eventIds are unique across calls", () => {
    const e1 = buildAuditEvent({
      action: "PURCHASE_PROPOSED",
      agentId: "agent-01",
    });
    const e2 = buildAuditEvent({
      action: "PURCHASE_PROPOSED",
      agentId: "agent-01",
    });
    expect(e1.eventId).not.toBe(e2.eventId);
  });
});

describe("auditService.auditEventFromPolicyResult", () => {
  const proposal = {
    agentId: "shopping-agent-01",
    merchantId: "merchant_123",
    currency: "INR",
  };

  test("maps an ALLOW decision to PAYMENT_ALLOWED", () => {
    const policyResult = {
      decision: "ALLOW",
      reason_code: null,
      checks: { budget: "PASS" },
      amount: 49999,
      authorization: { authorizationId: "auth_abc" },
    };
    const event = auditEventFromPolicyResult(policyResult, proposal);
    expect(event.action).toBe("PAYMENT_ALLOWED");
    expect(event.authorizationId).toBe("auth_abc");
    expect(event.amount).toBe(49999);
  });

  test("maps a DENY decision (price-change attack) to PAYMENT_BLOCKED with attack details in metadata", () => {
    const policyResult = {
      decision: "DENY",
      reason_code: "PRICE_CHANGED",
      checks: { price_integrity: "FAIL" },
      authorizedAmount: 49999,
      attemptedAmount: 69999,
    };
    const event = auditEventFromPolicyResult(policyResult, proposal);
    expect(event.action).toBe("PAYMENT_BLOCKED");
    expect(event.reasonCode).toBe("PRICE_CHANGED");
    expect(event.metadata.authorizedAmount).toBe(49999);
    expect(event.metadata.attemptedAmount).toBe(69999);
  });

  test("maps an ESCALATE decision to HUMAN_APPROVAL_REQUESTED", () => {
    const policyResult = {
      decision: "ESCALATE",
      reason_code: "BUDGET_EXCEEDED",
      checks: { budget: "FAIL" },
      amount: 72000,
    };
    const event = auditEventFromPolicyResult(policyResult, proposal);
    expect(event.action).toBe("HUMAN_APPROVAL_REQUESTED");
    expect(event.reasonCode).toBe("BUDGET_EXCEEDED");
  });
});
