/**
 * razorpayService.js
 *
 * Single responsibility: talk to Razorpay's test-mode API, and nothing
 * else. This is the ONLY place in the codebase that should import or
 * reference the Razorpay SDK — every other module deals in plain
 * Authorization objects and never touches Razorpay directly.
 *
 * The Razorpay client is injected (not imported/instantiated inside
 * this module) so tests can pass a fake client and never make real
 * network calls or require live API keys.
 *
 * IMPORTANT: This module only executes payments for authorizations
 * that have already been ALLOWed and consumed by authorizationService.
 * It never makes an authorization decision itself.
 */

/**
 * Creates a Razorpay test-mode order for an already-consumed
 * authorization. Should only ever be called after
 * authorizationService.consumeAuthorization() has succeeded.
 *
 * @param {Object} razorpayClient - an instance of the `razorpay` SDK
 *   (or a fake with the same shape) — must expose `orders.create`
 * @param {Object} authorization - a CONSUMED authorization record
 * @returns {Promise<Object>} { success, order? , error? }
 */
async function createOrderForAuthorization(razorpayClient, authorization) {
  if (authorization.status !== "CONSUMED") {
    // Fail closed — this function must never be called with anything
    // other than a freshly consumed authorization. This is a coding
    // error, not a runtime/user error, so we throw rather than return.
    throw new Error(
      `createOrderForAuthorization called with non-CONSUMED authorization (status: ${authorization.status})`,
    );
  }

  try {
    const order = await razorpayClient.orders.create({
      amount: authorization.amount * 100, // Razorpay expects paise
      currency: authorization.currency,
      receipt: authorization.authorizationId,
      notes: {
        authorizationId: authorization.authorizationId,
        agentId: authorization.agentId,
        merchantId: authorization.merchantId,
      },
    });

    return { success: true, order };
  } catch (error) {
    // Graceful failure per the build directive: a provider error must
    // never be mistaken for a security block, and must never silently
    // retry. The caller is responsible for NOT re-consuming the
    // authorization on retry — a fresh authorization must be requested.
    return {
      success: false,
      error: {
        reason_code: "PAYMENT_PROVIDER_ERROR",
        message: error.message || "Unknown Razorpay error",
      },
    };
  }
}

/**
 * Verifies a Razorpay payment signature after checkout completes
 * client-side, confirming the payment genuinely came from Razorpay
 * and wasn't forged by the client.
 *
 * @param {Object} razorpayClient - must expose
 *   `utils.validatePaymentSignature` (as the real SDK does)
 * @param {Object} params
 * @param {string} params.orderId
 * @param {string} params.paymentId
 * @param {string} params.signature
 * @param {string} params.secret - Razorpay key secret
 * @returns {boolean}
 */
function verifyPaymentSignature(
  razorpayClient,
  { orderId, paymentId, signature, secret },
) {
  try {
    return razorpayClient.utils.validatePaymentSignature(
      { order_id: orderId, payment_id: paymentId },
      signature,
      secret,
    );
  } catch (error) {
    return false; // fail closed on any verification error
  }
}

module.exports = { createOrderForAuthorization, verifyPaymentSignature };
