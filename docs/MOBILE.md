# Phone apps (Android and iPhone)

One Expo codebase (`apps/mobile`) gives the website, the Android app and the iPhone app. The phone app is mostly for **the driver** (rides, live position, back office on the go). Clients book on the website from the QR code, with no app to install.

| | |
|---|---|
| Name on the phone | Élysée Chauffeur |
| App id (Android and iPhone) | `fr.elyseechauffeur.app` (change it in `apps/mobile/app.json` **before the first store upload**; after that it is fixed forever) |
| Link scheme | `elyseechauffeur://` |
| Icon, splash | `apps/mobile/assets/` (amber É on asphalt, Nuit Blanche) |

## What the phone app adds to the website

- **Live position with the screen locked.** « Partager ma position en direct » on a ride keeps sending the car's position when the phone is locked or the driver is in Waze or on a call. Android shows a notification while it runs. On iPhone it uses the blue location bar. It stops by itself after 4 hours, and the client only sees the car from 1 h 30 before pickup until the end of the ride. If the driver does not allow location « Toujours / Always », it falls back to sharing while the screen is open.
- **Push notifications** for new bookings and answers (needs the Expo project, see below).
- Haptics, the native map, photo picker for the car.

## Try it on the Android emulator (free, no account)

Needs Android Studio's SDK and an emulator (AVD).

```bash
cd backend && ./gradlew :app:bootRun --args='--server.port=8098'        # the API (dev profile, test accounts)
cd apps/mobile
EXPO_PUBLIC_API_URL=http://10.0.2.2:8098 npx expo run:android           # builds, installs and opens the app
```

`10.0.2.2` is how the emulator reaches your computer. The first build takes 10 to 15 minutes; later ones are fast. The `android/` folder it creates is generated (not in git): change native settings in `app.json`, never in `android/`.

On a real Android phone on the same Wi-Fi, use your computer's IP instead (`http://192.168.x.y:8098`) and plug the phone in with USB debugging on.

## iPhone

There is no Xcode on this Mac, so iPhone builds go through **EAS Build** (Expo's cloud; the free plan includes a monthly number of builds).

```bash
cd apps/mobile
npx eas-cli login                  # your free Expo account
npx eas-cli init                   # links the project (writes the projectId into app.json; also enables push)
npx eas-cli build --profile preview --platform ios      # needs an Apple Developer account (99 $/year) to install on a real iPhone
```

## Before publishing

1. **The server is online** with HTTPS. Put its address in `apps/mobile/eas.json` (`preview` and `production`, `EXPO_PUBLIC_API_URL`, replacing `https://your-domain.example`). Phones refuse plain `http://` in release builds.
2. **Expo project:** `npx eas-cli init` (free). Push notifications need it.
3. **Android push:** create a free Firebase project, add an Android app `fr.elyseechauffeur.app`, download `google-services.json`, then follow https://docs.expo.dev/push-notifications/fcm-credentials/ (upload the key with `npx eas-cli credentials`).
4. **Builds:**
   ```bash
   npx eas-cli build --profile preview --platform android      # an .apk to install directly (share the link)
   npx eas-cli build --profile production --platform all        # store builds (.aab for Google Play, .ipa for the App Store)
   npx eas-cli submit --platform android                        # Google Play Console account: 25 $ once
   npx eas-cli submit --platform ios                            # Apple Developer Program: 99 $/year
   ```
5. **Store listings:** screenshots, a short description, and the privacy policy link (`https://<your-domain>/privacy`, already in the app). Both stores ask why the app uses location in the background: « Le chauffeur partage la position de sa voiture avec son client pendant une course, à sa demande ; le partage s'arrête seul. »

The store fees are the only unavoidable costs: Apple and Google charge them for any app.
