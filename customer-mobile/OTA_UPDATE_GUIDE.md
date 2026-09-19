# TezzNirmaan — OTA Update Guide

## What is an OTA (Over-The-Air) Update?

TezzNirmaan uses **Expo Updates** (`expo-updates`) with `checkAutomatically: "ON_LOAD"`. Every time the app launches, it checks for a new JS bundle from EAS Update. If one exists, it downloads it in the background and applies it on the next app launch.

This means **bug fixes and UI changes can be shipped without going through the Play Store review process.**

---

## When to use OTA vs Full Build

| Change type | Action needed | Review time |
|-------------|--------------|-------------|
| Bug fix in JS/React | `eas update` only | ~0 seconds |
| UI change (no native code) | `eas update` only | ~0 seconds |
| New screen / feature (pure JS) | `eas update` only | ~0 seconds |
| New `app.json` permission | Full build + store submit | 0–3 days |
| New native module (e.g. new SDK) | Full build + store submit | 0–3 days |
| Increment `versionCode` for store listing | Full build + store submit | 0–3 days |

> **Rule of thumb:** If you only changed `.jsx`, `.js`, or `.ts` files, it's OTA-safe.

---

## Pushing an OTA Update

```bash
# Navigate to the mobile directory
cd mobile/

# Push to production branch
eas update \
  --branch production \
  --message "fix: payment sheet shows wrong amount on retry"

# Push to staging branch first (recommended)
eas update \
  --branch staging \
  --message "fix: payment sheet shows wrong amount on retry"
# ... test on a staging build ...
# Then promote to production in the Expo dashboard
```

### Branch Naming Convention

| Branch | Receives updates from |
|--------|--------------------|
| `production` | Live customers |
| `staging` | Internal testing (preview builds) |
| `hotfix/YYYY-MM-DD` | Emergency fix — merge to production ASAP |

---

## Verifying an OTA Update

After pushing, verify the update is being served:

```bash
# List recent updates on the production branch
eas update:list --branch production

# View details of a specific update
eas update:view <UPDATE_ID>
```

On the device:
1. Kill the app completely (swipe it away)
2. Reopen the app
3. The new bundle downloads in the background (< 1 second on WiFi)
4. Kill and reopen **again** — the new bundle is now applied
5. The fix should be visible

> The app updates on the **second** launch after the update lands, not the first. This is by design — Expo downloads and validates the new bundle in the background during the first launch after update.

---

## Rolling Back an OTA Update

If a bad update ships:

```bash
# List recent updates
eas update:list --branch production

# Re-publish a previous good update (effectively a rollback)
eas update --branch production --republish --group <PREVIOUS_UPDATE_GROUP_ID>
```

Or in the Expo dashboard:
1. expo.dev → your project → Updates
2. Find the previous good update
3. Click "Re-publish"

Rollback takes effect on the next app launch (same 2-launch cycle).

---

## When to Bump versionCode

`android.versionCode` in `app.json` must be incremented every time you submit a new binary to the Play Store. OTA updates do **not** require a `versionCode` bump.

```
Current versionCode: 1
Next Play Store submission: versionCode: 2
```

Update it in `app.json`:
```json
"android": {
  "versionCode": 2
}
```

Then run a full build + submit (not OTA).

---

## Emergency Hotfix Checklist

1. Fix the bug in a new branch: `git checkout -b hotfix/2026-08-01`
2. Test locally with `expo start`
3. Push OTA to staging first: `eas update --branch staging --message "hotfix: ..."`
4. Verify on a preview build / physical device
5. Push to production: `eas update --branch production --message "hotfix: ..."`
6. Monitor: Sentry → new errors should drop within 10 minutes
7. Merge the branch back to main

---

## Runtime Version Policy

The app uses `"policy": "appVersion"` for `runtimeVersion`. This means:
- OTA updates are only applied to apps with the **same app version** (e.g. `1.0.0`)
- If you ship `versionCode: 2` with `version: 1.1.0`, users on v1.0.0 will **not** receive OTA updates for the v1.1.0 branch
- This prevents incompatible JS bundles from being applied to old native code
