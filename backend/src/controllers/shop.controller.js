// ────────────────────────────────────────────────────────────
// Shop Dashboard Controller
//
// All routes in this controller require the `requireShopAccess`
// middleware, which resolves and attaches `req.shopId`.
// ────────────────────────────────────────────────────────────

// ── Order Management ──────────────────────────────────────

export async function getShopOrders(req, res, next) {
  try {
    const shopId = req.shopId;
    const { status, tier, page, limit } = req.query;
    // TODO: Query sub_orders joined to orders WHERE orders.shop_id = shopId
    // Filter by status and/or tier if provided
    // Include order_items count and customer info
    res.json({ success: true, data: { subOrders: [], pagination: { page, limit, total: 0 } } });
  } catch (err) {
    next(err);
  }
}

export async function getSubOrderDetail(req, res, next) {
  try {
    const shopId = req.shopId;
    const { subOrderId } = req.params;
    // TODO: Fetch sub_order with full order_items, parent order info, customer delivery address
    // Validate the sub_order belongs to this shop
    res.json({ success: true, data: { subOrder: null } });
  } catch (err) {
    next(err);
  }
}

export async function confirmSubOrder(req, res, next) {
  try {
    const shopId = req.shopId;
    const { subOrderId } = req.params;
    const userRole = req.user.role;
    // TODO: Call orderService.updateSubOrderStatus(subOrderId, 'confirmed', userRole, shopId)
    // The service should: assertTransition(current, 'confirmed', role), update DB, log history
    res.json({ success: true, data: { message: 'Sub-order confirmed', subOrderId } });
  } catch (err) {
    next(err);
  }
}

export async function rejectSubOrder(req, res, next) {
  try {
    const shopId = req.shopId;
    const { subOrderId } = req.params;
    const { reason } = req.body;
    const userRole = req.user.role;
    // TODO: Call orderService.updateSubOrderStatus(subOrderId, 'rejected', userRole, shopId, { reason })
    res.json({ success: true, data: { message: 'Sub-order rejected', subOrderId } });
  } catch (err) {
    next(err);
  }
}

export async function markPreparing(req, res, next) {
  try {
    const shopId = req.shopId;
    const { subOrderId } = req.params;
    const userRole = req.user.role;
    // TODO: Call orderService.updateSubOrderStatus(subOrderId, 'preparing', userRole, shopId)
    res.json({ success: true, data: { message: 'Sub-order marked as preparing', subOrderId } });
  } catch (err) {
    next(err);
  }
}

export async function markReady(req, res, next) {
  try {
    const shopId = req.shopId;
    const { subOrderId } = req.params;
    const userRole = req.user.role;
    // TODO: Call orderService.updateSubOrderStatus(subOrderId, 'ready_for_pickup', userRole, shopId)
    res.json({ success: true, data: { message: 'Sub-order ready for pickup', subOrderId } });
  } catch (err) {
    next(err);
  }
}

export async function assignRider(req, res, next) {
  try {
    const shopId = req.shopId;
    const { subOrderId } = req.params;
    const { riderId } = req.body;
    const assignedBy = req.user.id;
    // TODO: Call deliveryService.assignRider(subOrderId, riderId, assignedBy, shopId)
    // - Validate sub_order is in 'ready_for_pickup' state
    // - Validate rider is assigned to this shop (rider_shop_assignments)
    // - Create delivery_assignment record
    // - Update sub_order status to 'rider_assigned'
    // - Generate delivery OTP
    res.json({ success: true, data: { message: 'Rider assigned', subOrderId, riderId } });
  } catch (err) {
    next(err);
  }
}

// ── Inventory Management ──────────────────────────────────

export async function getInventory(req, res, next) {
  try {
    const shopId = req.shopId;
    const { search, inStock, page, limit } = req.query;
    // TODO: Call inventoryService.getInventory(shopId, { search, inStock, page, limit })
    // Join with products table to return full product details + inventory data
    res.json({ success: true, data: { inventory: [], pagination: { page, limit, total: 0 } } });
  } catch (err) {
    next(err);
  }
}

export async function addToInventory(req, res, next) {
  try {
    const shopId = req.shopId;
    const { productId, price, mrp, costPrice, stockQuantity, lowStockThreshold, isListed } = req.body;
    // TODO: Call inventoryService.addToInventory(shopId, { productId, price, mrp, costPrice, stockQuantity, lowStockThreshold, isListed })
    // - Validate product exists and is_active
    // - Insert shop_inventory row (UNIQUE constraint handles duplicates)
    res.status(201).json({ success: true, data: { item: null } });
  } catch (err) {
    next(err);
  }
}

export async function updateInventoryItem(req, res, next) {
  try {
    const shopId = req.shopId;
    const { inventoryId } = req.params;
    const updates = req.body;
    // TODO: Call inventoryService.updateInventoryItem(inventoryId, shopId, updates)
    // Validate inventoryId belongs to this shop before updating
    res.json({ success: true, data: { item: null } });
  } catch (err) {
    next(err);
  }
}

export async function bulkUpdateInventory(req, res, next) {
  try {
    const shopId = req.shopId;
    const { items } = req.body;
    // TODO: Call inventoryService.bulkUpdateInventory(shopId, items)
    // Validate all inventory IDs belong to this shop
    // Update in a single transaction
    res.json({ success: true, data: { updated: items.length } });
  } catch (err) {
    next(err);
  }
}

export async function removeFromInventory(req, res, next) {
  try {
    const shopId = req.shopId;
    const { inventoryId } = req.params;
    // TODO: Call inventoryService.removeFromInventory(inventoryId, shopId)
    // Soft approach: set is_listed = false rather than hard delete, to preserve order history
    res.json({ success: true, data: { message: 'Product removed from inventory' } });
  } catch (err) {
    next(err);
  }
}

// ── Shop Settings ─────────────────────────────────────────

export async function getShopSettings(req, res, next) {
  try {
    const shopId = req.shopId;
    // TODO: Fetch full shop record including delivery radii, operating hours
    res.json({ success: true, data: { shop: null } });
  } catch (err) {
    next(err);
  }
}

export async function updateShopSettings(req, res, next) {
  try {
    const shopId = req.shopId;
    const updates = req.body;
    // TODO: Update shops record — camelCase fields must be converted to snake_case for DB
    // e.g. quickDeliveryRadiusKm → quick_delivery_radius_km
    res.json({ success: true, data: { shop: null } });
  } catch (err) {
    next(err);
  }
}

export async function toggleOrders(req, res, next) {
  try {
    const shopId = req.shopId;
    // TODO: Toggle shops.is_accepting_orders for this shop
    // Return the new value so the UI can update immediately
    res.json({ success: true, data: { isAcceptingOrders: null, message: 'Order acceptance toggled' } });
  } catch (err) {
    next(err);
  }
}
