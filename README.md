# Keiazo Tilt

A clean-room, mobile-first reconstruction of the interaction behind Solo: choose a photo or video locally, then use device motion or pointer drag to create a folding-display illusion.

## What is included

- WebGL 2 renderer with one continuous 256-strip perspective plane, direction-mirrored edge anchoring, doubled distance-ramped stretch/skew, Gaussian blur and shadow, width-fit media with natural vertical overflow, and capped device-pixel ratio
- Continuous physical tilt response through 180°, exaggerated far-edge horizontal expansion, doubled distance-ramped vertical compression with a safe 5% floor, and a true-black depth-shadow gradient
- Direction-independent vertical displacement so left and right tilts move the transformed edge along the same Y-axis direction
- Frame-synchronized local video textures with inline, muted looping playback
- Render-loop optimizations: cached GPU locations, resize observation, new-frame-only video uploads, idle draw skipping, and background suspension
- Guided iOS motion-permission flow, orientation compensation, calibration, dead zone, smoothing, and angle wraparound handling
- Pointer-drag fallback for desktop testing
- Collapsible live effect tuner for stretch, skew, compression, vertical displacement, rotation influence, nonlinear distance curves, darkness, Gaussian blur up to 400%, and a normalized 3–65-tap WebGL blur kernel, with single-gesture undo/redo and versioned JSON presets
- Local-only image decoding through an ephemeral object URL; selected photos are never uploaded or persisted
- Fullscreen mode, safe-area-aware mobile UI, post-interaction iOS Home Screen guidance, and reduced-motion support
- Installable/offline PWA shell
- Firebase Hosting configuration targeting `keiazotilt`
- Firebase Realtime Database presence heartbeats for the unique-browser `Users currently online` count
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

- `FIREBASE_SERVICE_ACCOUNT_KEIAZOTILT`: the complete JSON for a Google service account allowed to deploy Hosting and Realtime Database rules for the Firebase project that owns the `keiazotilt` Hosting site.

The deployment workflow validates the JavaScript and unit tests, deploys the narrowly scoped presence rules when the project has a default Realtime Database, and then deploys the `public/` directory to the existing `keiazotilt` Hosting site's live channel. It can also be run manually from the Actions tab. The Firebase project's default Realtime Database must be created once in the Firebase console because the Hosting deployment service account cannot enable new Google APIs.

## Privacy

Imported photos and videos remain inside the browser tab and are never uploaded. The app sends a random browser ID, random tab ID, and server timestamp to Firebase while the page is visible so it can show an approximate unique-browser online count. Stale sessions expire from the displayed count after one minute; no personal information or media is stored, and there is no server-side media processing.

## Attribution

This project is an independent implementation based on observed public behavior. It does not contain Solo's source code, private assets, branding, or copied implementation code.
