const {
  createOrderForAuthorization,
  verifyPaymentSignature,
} = require("./razorpayService");

function consumedAuthorization(overrides = {}) {
  return {
    authorizationId: "auth_abc123",
    agentId: "shopping-agent-01",
    merchantId: "merchant_123",
    amount: 49999,
    currency: "INR",
    status: "CONSUMED",
    ...overrides,
  };
}

describe("razorpayService.createOrderForAuthorization", () => {
  test("creates an order with correctly converted amount (rupees to paise)", async () => {
    const fakeClient = {
      orders: {
        create: jest
          .fn()
          .mockResolvedValue({ id: "order_test123", status: "created" }),
      },
    };

    const result = await createOrderForAuthorization(
      fakeClient,
      consumedAuthorization(),
    );

    expect(result.success).toBe(true);
    expect(result.order.id).toBe("order_test123");
    expect(fakeClient.orders.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 4999900, // 49999 * 100
        currency: "INR",
        receipt: "auth_abc123",
      }),
    );
  });

  test("rejects (throws) if called with a non-CONSUMED authorization", async () => {
    const fakeClient = { orders: { create: jest.fn() } };
    const activeAuth = consumedAuthorization({ status: "ACTIVE" });

    await expect(
      createOrderForAuthorization(fakeClient, activeAuth),
    ).rejects.toThrow(/non-CONSUMED/);
    expect(fakeClient.orders.create).not.toHaveBeenCalled();
  });

  test("returns a graceful PAYMENT_PROVIDER_ERROR on Razorpay API failure", async () => {
    const fakeClient = {
      orders: {
        create: jest.fn().mockRejectedValue(new Error("Network timeout")),
      },
    };

    const result = await createOrderForAuthorization(
      fakeClient,
      consumedAuthorization(),
    );

    expect(result.success).toBe(false);
    expect(result.error.reason_code).toBe("PAYMENT_PROVIDER_ERROR");
    expect(result.error.message).toBe("Network timeout");
  });

  test("includes authorization metadata in order notes for traceability", async () => {
    const fakeClient = {
      orders: { create: jest.fn().mockResolvedValue({ id: "order_xyz" }) },
    };

    await createOrderForAuthorization(fakeClient, consumedAuthorization());

    expect(fakeClient.orders.create).toHaveBeenCalledWith(
      expect.objectContaining({
        notes: {
          authorizationId: "auth_abc123",
          agentId: "shopping-agent-01",
          merchantId: "merchant_123",
        },
      }),
    );
  });
});

describe("razorpayService.verifyPaymentSignature", () => {
  test("returns true when the client validates the signature", () => {
    const fakeClient = {
      utils: { validatePaymentSignature: jest.fn().mockReturnValue(true) },
    };

    const result = verifyPaymentSignature(fakeClient, {
      orderId: "order_1",
      paymentId: "pay_1",
      signature: "sig_1",
      secret: "secret_1",
    });

    expect(result).toBe(true);
  });

  test("returns false when the client rejects the signature", () => {
    const fakeClient = {
      utils: { validatePaymentSignature: jest.fn().mockReturnValue(false) },
    };

    const result = verifyPaymentSignature(fakeClient, {
      orderId: "order_1",
      paymentId: "pay_1",
      signature: "bad_sig",
      secret: "secret_1",
    });

    expect(result).toBe(false);
  });

  test("fails closed (returns false) if the client throws", () => {
    const fakeClient = {
      utils: {
        validatePaymentSignature: jest.fn().mockImplementation(() => {
          throw new Error("malformed signature");
        }),
      },
    };

    const result = verifyPaymentSignature(fakeClient, {
      orderId: "order_1",
      paymentId: "pay_1",
      signature: "garbage",
      secret: "secret_1",
    });

    expect(result).toBe(false);
  });
});
