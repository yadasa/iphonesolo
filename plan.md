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
- [x] Crop/compose every replacement icon for the source crop used by the existing canvas renderer so no artwork is clipped or padded incorrectly.
- [x] Cache-bust the changed home-screen assets so iPhone/Safari clients do not keep the old icons.

## Wallpaper
- [x] Replace the home-screen wallpaper with the supplied dark geometric wallpaper while preserving the phone-screen aspect ratio and cover behavior.

## Liquid Glass UI
- [x] Port the Garden/church frosted-glass treatment as the visual reference: ~22px backdrop blur, 145% saturation, translucent white border, inset highlight, layered soft shadow.
- [x] Apply the treatment to the initial Enable Motion card without changing its layout/aspect ratio.
- [x] Apply the same visual language to Settings, fullscreen/help dialogs, QR/popover cards, alerts, and similar popup surfaces.
- [x] Preserve reduced-transparency and increased-contrast accessibility fallbacks.

## Video upload reliability
- [x] Allow the existing media picker to select images and videos.
- [x] Keep the current image upload path unchanged.
- [x] Route video selections through the renderer's dedicated video loader.
- [x] Decode video into a reusable 2D staging canvas and upload canvas frames to WebGL rather than uploading a live `<video>` element directly.
- [x] Cap working video resolution to a safe mobile/GPU budget and source dimensions / `MAX_TEXTURE_SIZE`.
- [x] Use `requestVideoFrameCallback` when available, throttle fallback uploads, and avoid redundant uploads.
- [x] Handle autoplay, race-safe tap pause/resume, visibility changes, object-URL cleanup, replacement media, and WebGL context loss without surfacing false playback errors.
- [x] Preserve the fold/perspective effect for uploaded video.

## Validation
- [x] Verify the generated JS parses successfully.
- [x] Verify all required links are present exactly once in the root renderer configuration.
- [x] Verify replacement image dimensions/formats match the renderer's expected crops.
- [x] Run the repository test/check commands through CI.
- [x] Verify the Firebase Hosting deployment completes for the implementation commit (`960298f`).
