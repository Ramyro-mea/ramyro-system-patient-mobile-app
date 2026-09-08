# Ramyro Patient Portal Mobile

Expo SDK 57 / React Native patient portal. The app supports invitation-code registration, login, guest and authenticated RIS reservation requests, authenticated reservation tracking, profile and study browsing, report preview and sharing, authenticated hosted viewer access, and creation of links for the existing web shared-study flow. It intentionally has no anonymous shared-study route.

## Requirements

- Node.js 22.13 or newer
- An iPhone with the current Expo Go app
- The PC and iPhone on the same Wi-Fi network
- Patient Portal API listening on `0.0.0.0:8007`
- Configuration Manager listening on `0.0.0.0:8012`
- Patient Portal web frontend listening on `0.0.0.0:9007`
- Viewer API listening on `0.0.0.0:8002`
- RIS API listening on `0.0.0.0:8014`

Allow TCP ports `8002`, `8007`, `8012`, `8014`, `9007`, and Metro's `8081` through Windows Firewall. Before starting Expo, verify the web portal and Configuration Manager runtime-config endpoint open in iPhone Safari.

## Configuration

Create `.env.local` when an override is needed. The development variables are:

```dotenv
EXPO_PUBLIC_PATIENT_PORTAL_API_URL=http://10.10.10.79:8007
EXPO_PUBLIC_PATIENT_PORTAL_WEB_URL=http://10.10.10.79:9007
EXPO_PUBLIC_SHARED_STUDY_URL=http://10.10.10.79:9007/patientPortal/shared-study
EXPO_PUBLIC_RIS_API_URL=http://10.10.10.79:8014
EXPO_PUBLIC_RIS_TENANT_ID=1
EXPO_PUBLIC_RIS_BRANCH_ID=1
```

From a phone, `localhost` means the phone, not the development PC. Update these values whenever the PC's LAN address changes, then restart Metro with a cleared cache.

## Run on iPhone

```powershell
npm install
npm start
```

Scan the QR code with the iPhone Camera app. If the phone cannot reach Metro, run `npx expo start --go --tunnel`. The tunnel only transports the JavaScript bundle; the Ramyro services must still be reachable using the LAN address.

## Install an iPhone preview build and test push notifications

The `preview` EAS profile creates a standalone app for a registered physical iPhone. It does not need Metro. It requires a paid Apple Developer membership and iOS 16.4 or newer.

From the project directory, register the iPhone first:

```powershell
npx --yes eas-cli@latest device:create
```

Sign in to Apple in the CLI when prompted. Choose website registration and open the generated link in Safari on the iPhone. Complete device registration before building:

```powershell
npx --yes eas-cli@latest build --platform ios --profile preview
```

Allow EAS to configure signing and push notifications, including an Apple Push Notifications service (APNs) key if needed. Include the registered iPhone in the provisioning profile. Open the completed build's installation link in iPhone Safari and install the app.

The preview profile explicitly uses the current local test server at `192.168.1.100`; `.env.local` is ignored by Git and is not included in EAS uploads. Update the `preview.env` values in `eas.json` and rebuild if the server address changes. Keep the phone on a network that can reach this server and allow Local Network access if iOS asks. The phone and backend also need internet access for push delivery.

To test:

1. Open the installed app, log in with a test patient, and allow notifications. Registration runs after login and sends the Expo push token to `/api/Push/register`.
2. Confirm the backend has registered that patient's iOS token. Use the [Expo push notification tool](https://expo.dev/notifications) with that token to test delivery independently of the RIS workflow.
3. Trigger the visit-admission notification for the same test patient in the backend. Verify delivery with the app open, in the background, and with the iPhone locked.
4. If delivery fails, check notification permission in iPhone Settings, APNs credentials in EAS, the backend registration request, and the push ticket/receipt errors. The app currently suppresses registration errors so login can continue.

References: [Expo internal distribution](https://docs.expo.dev/build/internal-distribution/) and [Expo push setup](https://docs.expo.dev/push-notifications/push-notifications-setup/).

## Quality checks

```powershell
npm run typecheck
npm run lint
npm test
```

The test suite covers JWT expiration, backend envelope errors, authentication and reservation validation, exact report eligibility, study filters/counts, URL encoding, guest receipt persistence, and pending-order request payload boundaries.

## Security and data handling

- Only the JWT is persisted, using Expo SecureStore.
- Profile, worklist, report, and token values are never logged.
- A `401` removes the token, React Query data, and temporary PDFs, then returns to login.
- Report PDFs are written only to the application cache. Preview files are removed when the report closes or the patient logs out. Copies explicitly saved through the system share sheet remain under the patient's control.
- Viewer authentication is provided with the existing `patient_portal_auth_token` cookie at document start. The token is never included in a URL.
- The viewer WebView is ephemeral and restricts top-level navigation to the configured portal origin.
- The local PDF renderer uses the vendored PDF.js files under `assets/pdfjs`; no report is sent to a CDN or third-party document service.
- Only the latest guest reservation receipt is persisted. It contains confirmation details, never the server status, and can be dismissed from login or registration.

Local HTTP is for development only. Customer deployments must use HTTPS and environment-specific builds. Before an Android release, repeat the complete device test suite; viewer cookie authentication on a physical Android device is a release gate.

## Route map

- `/(auth)/login` - patient login
- `/(auth)/register` - invitation-code registration and automatic login
- `/book-reservation` - guest or authenticated reservation request
- `/(app)` - protected profile and study dashboard
- `/(app)/reservations` - authenticated pending-order list
- `/(app)/viewer` - authenticated hosted DICOM viewer
- `/(app)/report/[studyId]` - native report retrieval and local PDF.js preview

Authentication and theme state live in `src/providers`, network behavior in `src/services`, and reusable UI in `src/components`.
