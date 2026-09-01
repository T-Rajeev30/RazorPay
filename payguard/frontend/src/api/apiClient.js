/**
 * apiClient.js
 *
 * Single responsibility: talk to the PayGuard backend. Every other
 * component imports from here rather than calling fetch() directly,
 * so the base URL and error handling live in exactly one place.
 */
const BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json();
  if (!response.ok) {
    return { ok: false, status: response.status, data };
  }
  return { ok: true, status: response.status, data };
}

export function getProducts() {
  return request("/products");
}

export function getAuditLog(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/audit-log${query ? `?${query}` : ""}`);
}

export function authorizePurchase(proposal) {
  return request("/authorize", {
    method: "POST",
    body: JSON.stringify(proposal),
  });
}

export function executePayment(authorizationId) {
  return request("/pay", {
    method: "POST",
    body: JSON.stringify({ authorizationId }),
  });
}

export function updateProductPrice(productId, price) {
  return request(`/products/${productId}/price`, {
    method: "PATCH",
    body: JSON.stringify({ price }),
  });
}

export function getPendingApprovals() {
  return request("/approvals");
}

export function approveAuthorization(authorizationId) {
  return request(`/approvals/${authorizationId}/approve`, { method: "POST" });
}

export function rejectAuthorization(authorizationId) {
  return request(`/approvals/${authorizationId}/reject`, { method: "POST" });
}
