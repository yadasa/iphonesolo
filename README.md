# Keiazo Tilt

A clean-room, mobile-first reconstruction of the interaction behind Solo: choose a photo or video locally, then use device motion or pointer drag to create a folding-display illusion.

## What is included

- WebGL 2 renderer with one continuous perspective plane, direction-mirrored edge anchoring, distance-ramped stretch/skew, Gaussian blur and shadow, cover cropping, and capped device-pixel ratio
- Extended physical tilt response through 120°, with far-edge vertical expansion and a stronger depth-shadow gradient
- Frame-synchronized local video textures with inline, muted looping playback
- Render-loop optimizations: cached GPU locations, resize observation, new-frame-only video uploads, idle draw skipping, and background suspension
- Guided iOS motion-permission flow, orientation compensation, calibration, dead zone, smoothing, and angle wraparound handling
- Pointer-drag fallback for desktop testing
- Local-only image decoding through an ephemeral object URL; selected photos are never uploaded or persisted
- Fullscreen mode, safe-area-aware mobile UI, post-interaction iOS Home Screen guidance, and reduced-motion support
- Installable/offline PWA shell
- Firebase Hosting configuration targeting `keiazotilt`
- GitHub Actions tests and production deployment on every push to `main`

## Local development

```bash
npm run dev
```

Then open the printed local URL. Motion sensors generally require HTTPS and a real mobile device; pointer drag works locally on desktop.

## Verification

```bash
npm test
npm run check
```

## Firebase deployment

The repository maps the Firebase Hosting target to `keiazotilt` in `.firebaserc` and `firebase.json`. In CI, the actual Google Cloud project ID is read from the service-account JSON so the target name does not have to match the project ID.

For GitHub Actions, add this repository secret:

- `FIREBASE_SERVICE_ACCOUNT_KEIAZOTILT`: the complete JSON for a Google service account allowed to deploy Firebase Hosting in project `keiazotilt`.

The `Deploy Firebase Hosting` workflow validates the JavaScript and unit tests before deploying the `public/` directory to the existing `keiazotilt` Hosting site's live channel. It can also be run manually from the Actions tab.

## Privacy

Imported photos and videos remain inside the browser tab. The app does not contain analytics, a database, an upload endpoint, or any server-side media processing.

## Attribution

This project is an independent implementation based on observed public behavior. It does not contain Solo's source code, private assets, branding, or copied implementation code.
