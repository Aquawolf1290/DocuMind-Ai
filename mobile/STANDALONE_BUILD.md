# DocuMind AI Standalone Mobile Builds

Use this when you want a real installable Android/iOS app instead of Expo Go.

## Important

The final app will not need Expo Go. It will still need a reachable DocuMind backend API unless you deploy the backend to the cloud.

For a real phone on the same Wi-Fi, use:

```text
http://YOUR_LAPTOP_IP:8010/api
```

Example:

```text
http://192.168.1.3:8010/api
```

## Android APK for Direct Install

From `mobile/`:

```bash
npm run build:android:apk
```

This creates an installable APK through EAS. Download the APK link from the EAS build page and install it on your Android phone.

## Android App Bundle for Play Store

```bash
npm run build:android:aab
```

Use the generated `.aab` for Google Play Console.

## iOS App

```bash
npm run build:ios
```

iOS builds require an Apple Developer account. For physical iPhones, install through TestFlight or an internal/ad hoc provisioning profile.

## Local Android Build Without Cloud EAS Build

This requires Android Studio, Android SDK, and Java configured on your machine.

```bash
npm run build:android:local
```

Output APK path after a successful local build:

```text
mobile/android/app/build/outputs/apk/release/app-release.apk
```

## If Backend Is Still Local

Before using the installed app, start the backend on the laptop:

```bash
start-dev.bat
```

Then in the mobile app API field, use the laptop IP endpoint:

```text
http://192.168.1.3:8010/api
```
