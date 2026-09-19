# TezzNirmaan Android APK — Capacitor Setup Guide

## Overview (P13-9)

Capacitor wraps your Next.js PWA into a native Android APK that can be published to Google Play Store.
This creates a proper app experience with native push notifications, GPS access, and offline capability.

## Prerequisites

Before starting:
- [ ] Android Studio installed (https://developer.android.com/studio)
- [ ] Java 17+ installed (bundled with Android Studio)
- [ ] `ANDROID_HOME` environment variable set
- [ ] Next.js production build working (`npm run build`)

---

## Step 1 — Install Capacitor CLI

```bash
cd dashboard
npm install @capacitor/core @capacitor/android @capacitor/cli
npx cap init "TezzNirmaan" "in.tezznirmaan.app" --web-dir out
```

## Step 2 — Configure Next.js for Static Export

Add to `next.config.js`:

```javascript
const nextConfig = {
  // ... existing config ...
  output: 'export',           // Required for Capacitor
  trailingSlash: true,        // Required for static export
  images: {
    unoptimized: true,        // Required for static export
  },
};
```

> ⚠️ **Note:** Static export disables Server Components and API routes. 
> The app will call your Express backend directly — no Next.js API routes are used.

## Step 3 — Build and Sync

```bash
cd dashboard
npm run build          # Creates the 'out' folder
npx cap add android    # Creates android/ folder
npx cap sync android   # Copies web assets to android/app/src/main/assets/public/
```

## Step 4 — Configure Android App

### `android/app/src/main/AndroidManifest.xml`

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.VIBRATE" />
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />

<!-- In <application> tag -->
<meta-data
    android:name="com.google.android.geo.API_KEY"
    android:value="YOUR_GOOGLE_MAPS_API_KEY" />
```

### `capacitor.config.json` (create in dashboard root)

```json
{
  "appId": "in.tezznirmaan.app",
  "appName": "TezzNirmaan",
  "webDir": "out",
  "server": {
    "androidScheme": "https"
  },
  "plugins": {
    "PushNotifications": {
      "presentationOptions": ["badge", "sound", "alert"]
    },
    "Geolocation": {
      "backgroundLocation": false
    }
  }
}
```

## Step 5 — Set App Branding

Replace these files with TezzNirmaan branding:
- `android/app/src/main/res/mipmap-*/ic_launcher.png` — App icon (48x48 to 192x192)
- `android/app/src/main/res/mipmap-*/ic_launcher_round.png` — Round icon
- `android/app/src/main/res/drawable/splash.png` — Splash screen (1080x1920)

Use [AppIcon Generator](https://appicon.co) to generate all sizes.

## Step 6 — Install Capacitor Plugins

```bash
# Push Notifications (via Expo/FCM already wired in backend)
npm install @capacitor/push-notifications

# GPS for rider location
npm install @capacitor/geolocation

# Camera (for product photos by shop owners)
npm install @capacitor/camera

# Haptics for button feedback
npm install @capacitor/haptics

npx cap sync android
```

## Step 7 — Open in Android Studio

```bash
npx cap open android
```

In Android Studio:
1. Wait for Gradle sync to complete (~2 min)
2. Select `Build → Generate Signed Bundle / APK`
3. Choose `APK` → Create new keystore (save the `.jks` file securely!)
4. Build `release` variant
5. APK at: `android/app/build/outputs/apk/release/app-release.apk`

## Step 8 — Google Play Store Setup

1. Create account at [play.google.com/console](https://play.google.com/console) (Rs.2,500 one-time fee)
2. Create new app → `TezzNirmaan`
3. Fill in store listing (description, screenshots, category: Shopping)
4. Upload the signed APK
5. Set content rating (Everyone / General)
6. Set pricing to Free
7. Submit for review (2–7 days for first app)

---

## Rider App Considerations

The rider app needs:
- Background GPS location (requires special Play Store permission review)
- Alternative: Use the PWA at `/rider` in Chrome — no APK review needed

```bash
# Rider app can be a separate Capacitor project:
npx cap init "TezzNirmaan Rider" "in.tezznirmaan.rider" --web-dir out-rider
```

---

## Environment Variables for Production APK

Set API URL in `capacitor.config.json`:

```json
{
  "server": {
    "url": "https://api.tezznirmaan.in",
    "cleartext": false
  }
}
```

---

## Update Process

Every time you update the web app, sync to Android:

```bash
npm run build      # Rebuild web app
npx cap sync       # Sync to Android
npx cap open android  # Rebuild APK in Android Studio
```

Use [Live Updates](https://capacitorjs.com/docs/guides/live-updates) for minor updates without going through Play Store review.
