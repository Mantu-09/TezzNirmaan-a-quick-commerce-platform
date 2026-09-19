import client from './client';

// GET /customer/pass/plans — public, no auth needed
export async function getPassPlans() {
  return client.get('/pass/plans');
}

// GET /customer/pass — authenticated, returns current subscription or null
export async function getMyPass() {
  return client.get('/pass');
}

// POST /customer/pass/purchase — { plan_id, payment_id }
export async function purchasePass(planId, paymentId = null) {
  return client.post('/pass/purchase', { plan_id: planId, payment_id: paymentId });
}

// POST /customer/pass/cancel — cancel auto-renewal (keeps access until expiry)
export async function cancelPass() {
  return client.post('/pass/cancel');
}
