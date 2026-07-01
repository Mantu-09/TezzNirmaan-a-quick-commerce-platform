# TezzNirmaan Mobile App

## Setup

```bash
cd mobile
npm install
npx expo start
```

## Fonts
Download Inter font family from [Google Fonts](https://fonts.google.com/specimen/Inter) and place the `.ttf` files in `assets/fonts/`:
- `Inter-Regular.ttf`
- `Inter-Medium.ttf`
- `Inter-SemiBold.ttf`
- `Inter-Bold.ttf`

## Environment

```bash
cp .env.example .env
# Fill in your values
```

## Build (EAS)

```bash
npm install -g eas-cli
eas login
eas build --platform android --profile preview
```

## Design System

| Token | Value |
|-------|-------|
| Primary (amber) | `#E8740C` |
| Secondary (navy) | `#0D3B6E` |
| Font | Inter + Noto Sans (Devanagari fallback) |
| Quick tier | ⚡ amber badge |
| Scheduled tier | 📅 navy badge |

## Mixed-Tier Cart UX

When a customer adds both Quick (e.g., paint) and Scheduled (e.g., cement bags) items:
1. Cart splits into two labeled sections
2. A blue info banner explains "2 separate deliveries"
3. Checkout shows an "Order Split" card
4. Confirmation shows 2 sub-order tracking cards

This is intentional design — transparency prevents confusion for high-value orders.
