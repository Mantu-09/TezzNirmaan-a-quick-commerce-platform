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
import publicRoutes   from './public.routes.js';   // P4-1A: marketing funnel, no auth

const router = Router();

// Auth routes — NO authenticate middleware; public endpoints handle their own auth
router.use('/auth', authRoutes);

router.use('/', customerRoutes);
router.use('/', shopRoutes);
router.use('/', riderRoutes);
router.use('/', adminRoutes);
router.use('/', paymentRoutes);
router.use('/', publicRoutes);   // P4-1A: /public/* — no auth required

export default router;
