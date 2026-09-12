# Laptop Solo

A laptop subproject inside `yadasa/iphonesolo`. The hosted preview is `/laptop`; its source is `public/laptop/`. The persistent native companion is in `laptop/windows/`. This is a normal subdirectory, not a nested Git repository or submodule.

## What is implemented

| Surface | Input | Rendering | Interaction |
| --- | --- | --- | --- |
| `/laptop` browser preview | Manual 0–180° hinge slider | WebGL 2, 128 horizontal strips, bottom anchor, expansion, compression, distance blur and shadow | Local photos, neutral calibration, strength, reset |
| Windows everyday mode | Supported hardware hinge sensor or manual angle | Native transparent gradient over the selected display; no capture | Click-through; ordinary apps retain their real geometry |
| Windows live fold | Same sensor/manual input | Local live desktop capture textured onto a native WPF mesh, Gaussian blur and depth shading | Visual mode; first click is consumed and dismisses the fold |

The native app is a standalone .NET/WPF Windows executable. It does not need a browser, WebView, Firebase, an account, administrator privileges, or a network service. It uses Windows' graphics stack; it does not modify the system compositor or install a display driver. The bottom edge stays fixed, and both opening and closing away from the calibrated neutral angle increase the illusion. This is a stylized fold, not optical viewpoint correction.

## Download or build on Windows

Windows 10 build 19041 (version 2004) or later is required. Windows x64 and ARM64 builds are supported.

1. Open [Build Laptop Solo for Windows](https://github.com/yadasa/iphonesolo/actions/workflows/laptop-windows.yml).
2. Open a successful run and download `LaptopSolo-win-x64` or `LaptopSolo-win-arm64` under **Artifacts**. Private-repository downloads require repository access.
3. Extract the whole ZIP. Run `LaptopSolo.exe` directly, or run the included `install.ps1` from PowerShell to copy it to your per-user Programs directory and create a Start menu shortcut.
4. Select the laptop display in the app. External monitors are not automatically distinguishable by the app; choose explicitly.
5. Hardware angle is used when available. Otherwise disable automatic input if necessary and use the manual slider. Set your normal viewing angle as neutral, then adjust the hinge/slider.
6. Enable **Everyday shading** for persistent depth while working. Choose **Start live desktop fold** for the full image deformation.
7. Optionally enable **Launch in tray when I sign in**. Close the settings window to keep the app running; choose **Quit** in the tray to stop it.

To build from this repo, install the .NET 8 SDK, open PowerShell at the repo root, and run:

```powershell
.\laptop\windows\build.ps1 -Runtime win-x64
```

For ARM64, replace `win-x64` with `win-arm64`. The output is `laptop/windows/out/<runtime>/`. Builds are self-contained: users do not need to install .NET. These builds are unsigned; public distribution would additionally require your signing certificate and a public release/download channel. Do not bypass enterprise execution policy; distribute through your organization's approved mechanism where required.

## Controls and persistence

- **Ctrl+Alt+L:** enter/leave live desktop fold.
- **Ctrl+Alt+Esc:** immediately pause all effects.
- **Click in live fold:** dismiss the visual overlay; that click is not forwarded to another app.
- **Tray:** open controls, pause/resume, live fold, quit.
- **Launch at sign-in:** explicitly opt in. Uses only `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\LaptopSolo`. Disable it in the app to remove that entry.
- Settings are debounced and saved under `%LOCALAPPDATA%\LaptopSolo\settings.json`.
- The app suspends its overlay on lock/sleep and leaves live mode after display changes. It never saves or automatically restores live capture mode across app launches.
- Run `uninstall.ps1` after quitting to remove the app's installed files, Start menu shortcut and startup entry. Preferences are retained.

## Hardware and OS boundaries

Microsoft's [HingeAngleSensor](https://learn.microsoft.com/en-us/uwp/api/windows.devices.sensors.hingeanglesensor) API describes supported dual-panel sensors. An ordinary lid-open/lid-closed switch does **not** provide a continuous angle. Sensor access is capability-detected; missing devices and failed readings visibly fall back to manual input. No fabricated sensor readings, webcam tracking or inferred angle from pointer motion are used. Angles beyond 180° clamp to flat because this experience models a conventional laptop rather than tablet-foldback operation.

A shader or captured desktop image cannot reposition the hit targets of arbitrary Windows apps. Everyday mode deliberately preserves their geometry. Live fold is for viewing/demonstration and does not remap system input; keyboard focus stays with the underlying application. Dismiss live fold before interacting with apps. A fully warped, interactive desktop would require a separate compositor/input architecture and is not implemented here.

The overlay is excluded from capture using [SetWindowDisplayAffinity / WDA_EXCLUDEFROMCAPTURE](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowdisplayaffinity); the app refuses live mode if that request fails. Captured frames remain in memory and are never saved or transmitted. Protected video, secure desktops, some remote sessions and some GPU drivers can yield black/uncapturable content. Windows visual validation on actual hardware is still needed; successful compilation is not proof of sensor or capture compatibility.

Native geometry matches the browser. WPF's Gaussian blur is uniform across the mesh and its native gradient approximates the browser's distance-varying kernel; the two outputs are not pixel-identical. Live mode reuses GDI capture objects, caps displayed textures at 1920 pixels wide, and refreshes at a bounded rate. Everyday mode takes no screenshots. Native macOS/Linux apps are not included; the browser preview works on those platforms with WebGL 2.

## Verification

```sh
npm test
npm run check
dotnet run --project laptop/tests/HingeMath.Tests.csproj -c Release
```

The Windows workflow builds both architectures and performs an x64 startup/shutdown smoke test. Geometry checks cover identity at neutral, fixed bottom corners, opening/closing symmetry, malformed readings, bounded effect strength, monotonic mesh rows and time-based smoothing.

For physical acceptance testing: verify the chosen display at 100% and 150% scaling, missing-sensor fallback, real sensor travel and calibration, unplug/reconnect of an external display, pause shortcuts, consumed exit click, sign-in startup, sleep/lock recovery, capture feedback exclusion, and uninstall. Check task-manager CPU/GPU usage on battery before enabling live fold for long sessions.
