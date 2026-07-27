# ────────────────────────────────────────────────────────────
# TezzNirmaan Mobile — Sounds Directory
#
# Place notification sounds here as .wav or .mp3 files.
# Referenced in app.json under plugins → expo-notifications → sounds.
#
# Required files:
#   order-alert.wav   — played when a new order arrives (shop/rider)
#
# Expo bundling requirements for notification sounds:
#   • Format:   WAV (preferred on both iOS and Android)
#   • Duration: Keep under 5 seconds
#   • iOS:      Must be in UNNotificationSound compatible format
#   • Android:  Placed in android/app/src/main/res/raw/ by Expo prebuild
#
# Generate a sound:
#   ffmpeg -f lavfi -i "sine=frequency=880:duration=0.4" -ar 44100 order-alert.wav
#
# Or use any royalty-free notification chime.
# ────────────────────────────────────────────────────────────
PLACEHOLDER — replace this file with order-alert.wav
