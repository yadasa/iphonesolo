# Root Experience Implementation Plan

This checklist captures the requested migration and customization work for the current root (`/`) experience and the preserved Keiazo Tilt test build at `/testing`.

## Route migration

- [x] Move the former `/experiment` experience to `/`.
- [x] Preserve the former root experience at `/testing`.
- [x] Redirect `/experiment` back to `/`.

## Home-screen links and app icons

- [x] Threads → `https://threads.com/keiazo`.
- [x] TikTok → `https://tiktok.com/ozaiek`.
- [x] Former Colerm tile → `https://exempliph.ai` with the supplied ExempliphAI / AI Job Search artwork.
- [x] Former X tile → `https://instagram.com/keiazo` with an Instagram app icon.
- [x] Former Shell Click tile → `https://github.com/` with a GitHub app icon.
- [x] Former RedNote tile → `https://asaday.co/consultation` with a book-style `1 on 1 sessions` app icon.
- [x] Add Traid as its own tile → `https://traid.ing` using the supplied AI Trading app artwork.
- [x] Crop/compose every replacement icon for the source crop used by the existing canvas renderer so no artwork is clipped or padded incorrectly.
- [x] Version every home-screen asset URL so iPhone/Safari clients replace cached X and Xiaohongshu artwork.
- [x] Put YouTube in PinchKey's former slot and link it to the Asaday channel.
- [x] Move PinchKey beneath Traid, immediately left of TikTok.
- [x] Move GitHub beside Threads.
- [x] Move YouTube into PinchKey's previous lower slot and move PinchKey one slot left.
- [x] Move the live-audience widget up one grid row.
- [x] Rename the widget to `Users currently online` and replace its teal palette with indigo/slate and periwinkle accents.

## Wallpaper

- [x] Replace the home-screen wallpaper with the supplied dark geometric wallpaper while preserving the phone-screen aspect ratio and cover behavior.

## Liquid Glass UI

- [x] Port the Garden/church frosted-glass treatment as the visual reference: ~22px backdrop blur, 145% saturation, translucent white border, inset highlight, layered soft shadow.
- [x] Apply the treatment to the initial Enable Motion card without changing its layout/aspect ratio.
- [x] Apply the same visual language to Settings, fullscreen/help dialogs, QR/popover cards, alerts, and similar popup surfaces.
- [x] Preserve reduced-transparency and increased-contrast accessibility fallbacks.
- [x] Port the church navbar's WebGL rounded-SDF refraction, edge displacement, directional rim, and live scene capture to the motion/fullscreen/quick-menu surfaces.

## Screen interaction menu

- [x] Replace tap-to-pause with a centered action menu for images and videos.
- [x] Add Upload, Return to Home Screen, Fullscreen/Add to Home Screen, and Download Code actions.
- [x] Close the menu when its backdrop is tapped.

## Responsive viewport

- [x] Size the mobile scene to the current dynamic visual viewport.
- [x] Distribute rows from the viewing device's live aspect ratio instead of a fixed 430 x 900 reference.

## Custom domain and branding

- [x] Use dark foreground text on the light Enable Motion and fullscreen-card buttons.
- [x] Update canonical, Open Graph, Twitter image, analytics, and visible site references to `iphonesolo.com`.
- [x] Rename title, description, Open Graph/Twitter metadata, PWA name, `/code` branding, and Stripe checkout product copy to `iPhone Solo`.
- [x] Stamp every Hosting release with the deploying Git commit SHA.
- [x] Serve `/deploy-version.txt` with no-store caching.
- [x] Fail deployment verification unless `https://iphonesolo.com` serves the exact Git SHA plus the current root and `/code` titles.

## Languages

- [x] Keep English and Spanish as the first two language choices.
- [x] Add German, Russian, and Indonesian.
- [x] Add Hindi, Bengali, Telugu, Marathi, Tamil, Urdu, Gujarati, Kannada, Malayalam, and Punjabi with English UI fallback.
- [x] Replace the native language select with a bounded-height, scrollable custom picker while keeping English and Spanish first.

## Live presence

- [x] Replace the dead placeholder audience API/WebSocket calls with Firebase Realtime Database presence heartbeats.
- [x] Count unique active browsers rather than tabs and expire stale/background sessions after one minute.
- [x] Add narrowly scoped Firebase database rules and deploy them automatically once a database exists.
- [x] Preserve a rolling local history for the online-user graph.
- [ ] Create the default Realtime Database in Firebase project `tilt-e02fd` (blocked by the Hosting service account's Google API permissions).

## Video upload reliability

- [x] Allow the existing media picker to select images and videos.
- [x] Keep the current image upload path unchanged.
- [x] Route video selections through the renderer's dedicated video loader.
- [x] Decode video into a reusable 2D staging canvas and upload canvas frames to WebGL rather than uploading a live `<video>` element directly.
- [x] Cap working video resolution to a safe mobile/GPU budget and source dimensions / `MAX_TEXTURE_SIZE`.
- [x] Use `requestVideoFrameCallback` when available, throttle fallback uploads, and avoid redundant uploads.
- [x] Handle autoplay, race-safe tap pause/resume, visibility changes, object-URL cleanup, replacement media, and WebGL context loss without surfacing false playback errors.
- [x] Preserve the fold/perspective effect for uploaded video.

## Code / donation page

- [x] Add `/code` using the root experience's dark, Liquid Glass visual language.
- [x] Use the copy “Want the code? Make a donation and download immediately.” with a confirmation CTA.
- [x] Open a donation modal with a custom amount input and $5 / $10 / $50 / $100 presets.
- [x] Enforce the $2 minimum in both client and server validation without advertising the minimum before a too-small attempt.
- [x] Create Stripe Checkout Sessions on the server so the Stripe secret is never exposed to the browser.
- [x] Verify the Stripe Checkout Session is paid before exposing the download redirect.
- [x] Start the current `main` source archive download automatically after successful payment verification.
- [x] Route the existing in-app Download Code action through `/code` rather than directly to the public archive.
- [x] Add “1 on 1 consultation” and “Hire me” buttons beneath the donation flow; both point to `https://asaday.co/consultation`.
- [x] Add automated tests for donation copy, preset amounts, hidden minimum behavior, Stripe rewrites, server-side payment verification, and gated download routing.
- [x] Validate the `STRIPE_SECRET_KEY` Actions secret against Stripe during CI.
- [x] Avoid manual Stripe Product, Price, Payment Link, webhook, or Dashboard checkout configuration by creating each Checkout Session dynamically.
- [x] Add a Stripe health endpoint and post-deploy health verification.
- [x] Retry paid-session verification automatically and begin the download without a second click.
- [ ] Grant the Firebase CI service account Cloud Functions deployment permissions in Google Cloud IAM; the valid Stripe key is already configured, but Functions deployment currently fails with Google Cloud HTTP 403 before upload.
- [ ] Verify the Stripe Functions deployment in production after the one-time IAM grant.

## Validation

- [x] Verify the generated JS parses successfully.
- [x] Verify all required links are present exactly once in the root renderer configuration.
- [x] Verify replacement image dimensions/formats match the renderer's expected crops.
- [x] Run the repository test/check commands through CI.
- [x] Verify the Firebase Hosting deployment completes for the initial implementation commit (`960298f`).
- [x] Verify the corrective Instagram, sessions, and separate Traid tile deployment completes (`0488812`).
- [x] Confirm CI can authenticate the configured Stripe secret successfully.


## The Highest Bid home-screen advertisement

- [x] Replace the Spotify preview card with the live rank-one ad from `https://thehighest.bid/api/embed?limit=1`.
- [x] Use the feed's tracked `clickUrl`, square creative or favicon metadata, title, label, and description.
- [x] Show the dynamic permanent-number-one entry price above the card.
- [x] Link the acquisition text above the advertisement directly to `https://thehighest.bid/`, independently of the winning ad's tracked click target.
- [x] Clip metadata to the existing rounded rectangle and auto-scroll overflowing descriptions, pause at the bottom, then snap to the top.
- [x] Fall back to a branded The Highest Bid call-to-action if the feed or creative is unavailable.
- [x] Remove the Spotify audio preview and Spotify destination.


## Liquid Glass consistency

- [x] Make Enable Motion acquire the same Liquid Glass shader as Settings only when opened.
- [x] Release inactive dialog WebGL contexts so iOS cannot leave the first permission card with a blank surface.
- [x] Add a 1.5px blur and 4.5% white finish to Settings without replacing its refractive shader.

## Analytics, installed viewport, and download redemption

- [x] Remove the legacy Umami tracker instead of double-counting alongside GA4.
- [x] Load GA4 from the Measurement ID exposed by this Firebase project's reserved configuration endpoint.
- [x] Track root and /code page views without embedding another project's analytics ID in source.
- [x] Make the Add to Home Screen build use standalone display mode and the same measured visual viewport as the website.
- [x] Reserve the iOS status bar instead of changing the renderer's usable aspect ratio with an overlay.
- [x] Enforce one source archive response per paid Stripe Checkout Session with an atomic server-only Firebase Realtime Database claim.
