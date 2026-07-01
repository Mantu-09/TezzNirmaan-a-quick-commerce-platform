// ────────────────────────────────────────────────────────────
// Rider Controller
// All routes require authenticate + requireRole('rider')
// ────────────────────────────────────────────────────────────

export async function getDeliveries(req, res, next) {
  try {
    const userId = req.user.id;
    const { status, page, limit } = req.query;
    // TODO: Call deliveryService.getDeliveries(userId, { status, page, limit })
    // JOIN delivery_assignments → riders (WHERE profile_id = userId)
    // 'active' status = assignments where is_active=true and not delivered/cancelled
    // 'completed' status = delivered/cancelled assignments
    res.json({ success: true, data: { deliveries: [], pagination: { page, limit, total: 0 } } });
  } catch (err) {
    next(err);
  }
}

export async function getDeliveryDetail(req, res, next) {
  try {
    const userId = req.user.id;
    const { assignmentId } = req.params;
    // TODO: Call deliveryService.getDeliveryDetail(assignmentId, userId)
    // Return assignment + sub_order + order_items + delivery address + shop info
    // Validate assignment belongs to this rider
    res.json({ success: true, data: { delivery: null } });
  } catch (err) {
    next(err);
  }
}

export async function acceptDelivery(req, res, next) {
  try {
    const userId = req.user.id;
    const { assignmentId } = req.params;
    // TODO: Call deliveryService.acceptDelivery(assignmentId, userId)
    // Update delivery_assignments.accepted_at = now()
    res.json({ success: true, data: { message: 'Delivery accepted', assignmentId } });
  } catch (err) {
    next(err);
  }
}

export async function confirmPickup(req, res, next) {
  try {
    const userId = req.user.id;
    const { assignmentId } = req.params;
    // TODO: Call deliveryService.confirmPickup(assignmentId, userId)
    // Update delivery_assignments.picked_up_at = now()
    // Update sub_order status: rider_assigned → out_for_delivery via assertTransition
    // Update rider status to 'on_delivery'
    res.json({ success: true, data: { message: 'Pickup confirmed', assignmentId } });
  } catch (err) {
    next(err);
  }
}

export async function confirmDelivery(req, res, next) {
  try {
    const userId = req.user.id;
    const { assignmentId } = req.params;
    const { otp, proofUrl } = req.body;
    // TODO: Call deliveryService.confirmDelivery(assignmentId, userId, { otp, proofUrl })
    // Validate OTP if delivery_assignments.delivery_otp is set
    // Update delivery_assignments.delivered_at, delivery_proof_url
    // Update sub_order status: out_for_delivery → delivered
    // Update rider status back to 'available'
    res.json({ success: true, data: { message: 'Delivery confirmed', assignmentId } });
  } catch (err) {
    next(err);
  }
}

export async function cancelDelivery(req, res, next) {
  try {
    const userId = req.user.id;
    const { assignmentId } = req.params;
    const { reason } = req.body;
    // TODO: Call deliveryService.cancelDelivery(assignmentId, userId, reason)
    // Mark delivery_assignment as is_active = false
    // Revert sub_order status: out_for_delivery → ready_for_pickup (so shop can reassign)
    // Update rider status back to 'available'
    res.json({ success: true, data: { message: 'Delivery cancelled, sub-order returned to ready_for_pickup' } });
  } catch (err) {
    next(err);
  }
}

export async function updateStatus(req, res, next) {
  try {
    const userId = req.user.id;
    const { status } = req.body;
    // TODO: Update riders.status WHERE profile_id = userId
    res.json({ success: true, data: { status, message: `Rider status updated to ${status}` } });
  } catch (err) {
    next(err);
  }
}

export async function updateLocation(req, res, next) {
  try {
    const userId = req.user.id;
    const { lng, lat } = req.body;
    // TODO: Update riders.current_location = ST_MakePoint(lng, lat)::geography
    // WHERE profile_id = userId
    // Also update riders.updated_at
    res.json({ success: true, data: { message: 'Location updated' } });
  } catch (err) {
    next(err);
  }
}
