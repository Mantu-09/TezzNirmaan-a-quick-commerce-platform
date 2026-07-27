import * as Updates from 'expo-updates';
import { useEffect }  from 'react';
import { Alert }      from 'react-native';

// ────────────────────────────────────────────────────────────
// useOTAUpdate — P4-1B
//
// Checks for an available Expo OTA update on every foreground
// resume (called once from App.jsx on mount).
//
// Rules:
//   • Never checks in __DEV__ (would throw — Updates API is
//     unavailable in Expo Go / Metro dev server).
//   • Never crashes if the check or fetch fails — the app
//     must always open, even if OTA is unreachable.
//   • Shows a non-blocking Alert so the user can restart at a
//     convenient moment rather than being force-restarted.
//   • Uses Updates.isEmbeddedLaunch to detect the very first
//     run after a new store binary — skip the OTA prompt then
//     (user just installed the latest build).
// ────────────────────────────────────────────────────────────

export function useOTAUpdate() {
  useEffect(() => {
    // Safety: Updates module is inert in Expo Go and throws in
    // __DEV__ when checkForUpdateAsync is called.
    if (__DEV__) return;

    // Also skip if we're running the freshly installed binary —
    // there's no point checking for an OTA on top of a new build.
    if (Updates.isEmbeddedLaunch) return;

    async function checkForUpdate() {
      try {
        const update = await Updates.checkForUpdateAsync();

        if (!update.isAvailable) return;

        // Fetch in the background (won't affect current session)
        await Updates.fetchUpdateAsync();

        Alert.alert(
          '✅ App updated',
          'TezzNirmaan has been updated with improvements. Restart to apply the latest version.',
          [
            {
              text: 'Restart now',
              style: 'default',
              onPress: () => Updates.reloadAsync(),
            },
            {
              text: 'Later',
              style: 'cancel',
            },
          ],
          { cancelable: true }
        );
      } catch (err) {
        // Never propagate — OTA failures must be completely silent to the user.
        // Log to Sentry in production so we can track OTA delivery issues.
        if (!__DEV__) {
          console.warn('[OTA] Update check failed (non-fatal):', err?.message ?? err);
        }
      }
    }

    checkForUpdate();
  // Empty dependency array: run once per mount (i.e., once per app foreground session).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
