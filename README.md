# تكذب · Takdab

Multiplayer bluffing card game for web, Android, and iOS.

- Production: https://takdab-game.takdab-game.workers.dev
- Expo project: https://expo.dev/accounts/houdeifa515/projects/takdab-game

## Local development

```bash
npm install
npm run dev
npm run dev:party
```

## Production

```bash
npm test
npm run build
npm run deploy
```

The native app lives in `mobile/`. It loads the production game in a landscape WebView, has microphone permission for voice chat, and checks EAS Update on launch.

```bash
cd mobile
npm install
npm run typecheck
npm run build:apk
npm run build:ios
npm run update:production -- --message "Describe the update"
```

The manual **Mobile release** GitHub Action builds an Android APK and unsigned iOS Simulator app through EAS, then attaches both files to a GitHub release. Add an `EXPO_TOKEN` repository secret before running it. A standalone physical-iPhone build requires Apple signing; without it, use the Expo Go update.
