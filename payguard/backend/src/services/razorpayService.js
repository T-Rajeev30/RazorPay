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
 *
 * IDEMPOTENCY NOTE: Razorpay's Orders API treats `receipt` as an
 * idempotency key — a second orders.create() call with a receipt that
 * already exists is rejected, not duplicated. We set receipt to the
 * authorizationId specifically so a network-retry of this exact call
 * can never create a second real order. But a naive implementation
 * would then report that retry as a hard failure even though the
 * payment actually succeeded the first time — this module reconciles
 * that by checking for an existing order under the same receipt before
 * concluding a creation error is a genuine failure.
 */

/**
 * Creates a Razorpay test-mode order for an already-consumed
 * authorization. Should only ever be called after the authorization
 * has been atomically consumed by the caller.
 *
 * @param {Object} razorpayClient - an instance of the `razorpay` SDK
 *   (or a fake with the same shape) — must expose `orders.create`
 *   and `orders.all`
 * @param {Object} authorization - a CONSUMED authorization record
 * @returns {Promise<Object>} { success, order?, error?, reconciled? }
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
    // Before concluding this is a genuine failure, check whether an
    // order already exists under this exact receipt — that would mean
    // a prior attempt actually succeeded (e.g. the response was lost
    // to a network blip) and this is a safe retry, not a new failure.
    const reconciled = await reconcileByReceipt(
      razorpayClient,
      authorization.authorizationId,
    );
    if (reconciled) {
      return { success: true, order: reconciled, reconciled: true };
    }

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
 * Looks up an existing order by its receipt value. Used to distinguish
 * "this create call genuinely failed" from "this create call is a
 * retry of one that already succeeded." Razorpay treats `receipt` as
 * an idempotency key on the Orders API.
 *
 * @returns the existing order object, or null if none is found (or the
 *   lookup itself fails — in which case we fall through to reporting
 *   the original error rather than masking it).
 */
async function reconcileByReceipt(razorpayClient, receipt) {
  try {
    const existing = await razorpayClient.orders.all({ receipt });
    if (existing && existing.items && existing.items.length > 0) {
      return existing.items[0];
    }
    return null;
  } catch (lookupError) {
    return null; // fail closed to the original error, don't mask it with a lookup failure
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

module.exports = {
  createOrderForAuthorization,
  verifyPaymentSignature,
  reconcileByReceipt,
};
