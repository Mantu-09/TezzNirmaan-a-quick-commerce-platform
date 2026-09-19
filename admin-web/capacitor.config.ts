// dashboard/capacitor.config.ts — P17-5
// Capacitor configuration for TezzNirmaan Android app.
// After generating the build:
//   1. npx cap add android
//   2. npx cap sync
//   3. npx cap open android  (opens Android Studio)
//   4. Build > Generate Signed Bundle/APK

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId:   'com.tezznirmaan.app',
  appName: 'TezzNirmaan',
  webDir:  'out',   // next export output directory

  // For development: point to local Next.js dev server
  // Comment this out for production APK build
  server: {
    url:                    'http://192.168.1.100:3000', // Change to your local IP for testing
    cleartext:              true,
    androidScheme:          'http',
    allowNavigation:        ['*.tezznirmaan.com', 'api.razorpay.com', '*.supabase.co'],
  },

  // Production: use live URL (comment out `server` above and uncomment this)
  // server: {
  //   url: 'https://tezznirmaan.com',
  //   androidScheme: 'https',
  // },

  android: {
    buildOptions: {
      keystorePath:       'release/tezznirmaan.keystore',
      keystoreAlias:      'tezznirmaan',
      // keystorePassword and keystoreAliasPassword set via CI env vars
    },
    minSdkVersion:     24,  // Android 7.0+ (covers 95%+ of Bihar devices)
    targetSdkVersion:  34,  // Android 14 target
    allowMixedContent: false,
    backgroundColor:   '#FFFFFF',
  },

  plugins: {
    SplashScreen: {
      launchAutoHide:           true,
      launchShowDuration:       2000,
      backgroundColor:          '#FFFFFF',
      androidSplashResourceName:'splash',
      showSpinner:              false,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
