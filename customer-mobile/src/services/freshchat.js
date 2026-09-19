// ────────────────────────────────────────────────────────────
// freshchat.js — P7-4: In-App Support Chat
//
// Wraps @freshchat/react-native-freshchat-sdk with:
//   • Graceful fallback to WhatsApp when Freshchat is not configured
//   • User identification after login (externalId + restoreId)
//   • Order-context-aware conversation opening
//   • openNewConversation() for return dispute escalation
//
// Setup:
//   1. Create a Freshchat account at https://freshchat.com (free plan)
//   2. Settings → Mobile SDK → copy App ID and App Key
//   3. Set EXPO_PUBLIC_FRESHCHAT_APP_ID and EXPO_PUBLIC_FRESHCHAT_APP_KEY
//      in mobile/.env (and Render/EAS environment)
//   4. Set EXPO_PUBLIC_SUPPORT_WHATSAPP to founder's WhatsApp number
//      (e.g. 919876543210 — no + or dashes) as fallback
// ────────────────────────────────────────────────────────────

import { Linking, Platform } from 'react-native';

const FRESHCHAT_APP_ID  = process.env.EXPO_PUBLIC_FRESHCHAT_APP_ID;
const FRESHCHAT_APP_KEY = process.env.EXPO_PUBLIC_FRESHCHAT_APP_KEY;
const SUPPORT_WHATSAPP  = process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP || '919999999999';

// Lazily import the native SDK — this never throws even if the package
// is not installed, it just falls back to WhatsApp.
let RNFreshchat = null;
let _sdkReady   = false;

async function _getSdk() {
  if (RNFreshchat) return RNFreshchat;
  try {
    // Correct npm package: react-native-freshchat-sdk (published by Freshworks)
    const mod = await import('react-native-freshchat-sdk');
    RNFreshchat = mod.default || mod.RNFreshchat;
    return RNFreshchat;
  } catch {
    // Package not installed — WhatsApp fallback will be used
    return null;
  }
}

// ── Detect availability ───────────────────────────────────────

function isFreshchatConfigured() {
  return !!(FRESHCHAT_APP_ID && FRESHCHAT_APP_KEY);
}

// ── WhatsApp fallback ─────────────────────────────────────────

function openWhatsAppFallback(context = {}) {
  const orderText = context.order_number
    ? `Order: #${context.order_number}. `
    : '';
  const message = `Hi TezzNirmaan Support, I need help. ${orderText}`;
  const url     = `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(message)}`;
  Linking.openURL(url).catch(() => {
    // WhatsApp not installed — nothing we can do
  });
}

// ── initFreshchat ─────────────────────────────────────────────
/**
 * Initialise the Freshchat SDK. Call once on app startup.
 * Safe to call even when Freshchat env vars are not set.
 *
 * @returns {Promise<boolean>} true if SDK initialised, false if using WhatsApp fallback
 */
export async function initFreshchat() {
  if (!isFreshchatConfigured()) {
    console.warn('[Freshchat] Not configured — support chat will fall back to WhatsApp.');
    return false;
  }

  const sdk = await _getSdk();
  if (!sdk) {
    console.warn('[Freshchat] SDK not installed — support chat will fall back to WhatsApp.');
    return false;
  }

  try {
    await sdk.init({
      appId:  FRESHCHAT_APP_ID,
      appKey: FRESHCHAT_APP_KEY,
      domain: 'https://msdk.freshchat.com', // Freshchat mobile domain (do not change)
    });
    _sdkReady = true;
    console.log('[Freshchat] Initialised successfully.');
    return true;
  } catch (err) {
    console.warn('[Freshchat] init() failed:', err?.message);
    return false;
  }
}

// ── identifyUser ──────────────────────────────────────────────
/**
 * Identify the logged-in user in Freshchat so conversations are
 * linked across sessions and devices.
 *
 * Call after successful login / on auth state change.
 *
 * @param {{ id: string, full_name?: string, phone?: string, freshchat_restore_id?: string, selected_city?: string }} user
 */
export async function identifyUser(user) {
  if (!isFreshchatConfigured() || !_sdkReady) return;

  const sdk = await _getSdk();
  if (!sdk) return;

  try {
    // restoreId links the conversation if the user re-installs the app.
    // Store the restoreId returned by Freshchat in your user profile for persistence.
    await sdk.identifyUser({
      externalId: user.id,
      restoreId:  user.freshchat_restore_id || null,
    });

    await sdk.setUserProperties({
      name:  user.full_name || user.phone || 'TezzNirmaan Customer',
      phone: user.phone     || '',
      city:  user.selected_city?.name || user.selected_city || 'Patna',
      platform: Platform.OS,
    });
  } catch (err) {
    console.warn('[Freshchat] identifyUser() failed:', err?.message);
  }
}

// ── openSupportChat ───────────────────────────────────────────
/**
 * Open the support chat — either Freshchat or WhatsApp fallback.
 *
 * @param {{ order_number?: string }} [context]
 *   Pass { order_number } to pre-tag the conversation as an order issue.
 */
export function openSupportChat(context = {}) {
  if (!isFreshchatConfigured() || !_sdkReady) {
    openWhatsAppFallback(context);
    return;
  }

  _getSdk().then((sdk) => {
    if (!sdk) { openWhatsAppFallback(context); return; }

    const hasOrderContext = !!context.order_number;
    sdk.showConversations({
      tags:              hasOrderContext ? ['order-issue'] : ['general'],
      filteredViewTitle: hasOrderContext
        ? `Help with Order #${context.order_number}`
        : 'TezzNirmaan Support',
    });
  }).catch(() => openWhatsAppFallback(context));
}

// ── openNewConversation ───────────────────────────────────────
/**
 * Open a new conversation with a pre-filled subject and message.
 * Used for return dispute escalation.
 *
 * @param {string} subject
 * @param {string} message
 */
export function openNewConversation(subject, message) {
  if (!isFreshchatConfigured() || !_sdkReady) {
    // Fallback: open WhatsApp with the message pre-filled
    const url = `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(message)}`;
    Linking.openURL(url).catch(() => {});
    return;
  }

  _getSdk().then((sdk) => {
    if (!sdk) {
      const url = `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(message)}`;
      Linking.openURL(url).catch(() => {});
      return;
    }

    sdk.showNewConversation({
      tags:              ['order-issue'],
      filteredViewTitle: subject,
      initialMessage:    message,
    });
  }).catch(() => {
    const url = `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(message)}`;
    Linking.openURL(url).catch(() => {});
  });
}
