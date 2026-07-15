// ────────────────────────────────────────────────────────────
// Route Index — mounts all sub-routers under /api/v1
// ────────────────────────────────────────────────────────────
import { Router } from 'express';
import authRoutes     from './auth.routes.js';
import customerRoutes from './customer.routes.js';
import shopRoutes     from './shop.routes.js';
import riderRoutes    from './rider.routes.js';
import adminRoutes    from './admin.routes.js';
import paymentRoutes  from './payment.routes.js';

const router = Router();

// Auth routes — NO authenticate middleware; public endpoints handle their own auth
router.use('/auth', authRoutes);

router.use('/', customerRoutes);
router.use('/', shopRoutes);
router.use('/', riderRoutes);
router.use('/', adminRoutes);
router.use('/', paymentRoutes);

export default router;
