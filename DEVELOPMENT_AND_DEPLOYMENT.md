# Development and Deployment Checklist

The mobile app calls four separate areas:

- **Patient Portal API**: login, registration, profile, studies, reports, shared links, and patient push-token registration.
- **Patient Portal Web URL**: the hosted viewer displayed inside the app's WebView.
- **Viewer API**: study metadata and DICOMweb images used by the embedded viewer.
- **RIS API**: reservation booking and reservation history.

All configured hosts must be reachable from the phone. On a physical phone, do not use `localhost` because it refers to the phone itself.

## Local development with Expo Go

1. Connect the laptop and phone to the same private Wi-Fi network.

2. Find the laptop's current Wi-Fi IPv4 address:

   ```powershell
   ipconfig
   ```

3. Update the web portal runtime configuration:

   `C:\Users\DELL\Documents\GitHub\ramyro-system-backend\ConfigurationManager\ConfigFiles\PatientPortal.txt`

   Set `SERVER_HOSTNAME` to the laptop IP. Confirm that the Patient Portal API, viewer, RIS, and portal URLs in that file resolve to the same reachable host. Runtime configuration is the web portal's source of truth.

4. Update `.env.local` in this mobile project with the same host:

   ```dotenv
   EXPO_PUBLIC_PATIENT_PORTAL_API_URL=http://<LAPTOP_IP>:8014
   EXPO_PUBLIC_PATIENT_PORTAL_WEB_URL=http://<LAPTOP_IP>:9007
   EXPO_PUBLIC_SHARED_STUDY_URL=http://<LAPTOP_IP>:9007/patientPortal/shared-study
   EXPO_PUBLIC_RIS_API_URL=http://<LAPTOP_IP>:8015
   EXPO_PUBLIC_RIS_TENANT_ID=1
   EXPO_PUBLIC_RIS_BRANCH_ID=1
   EXPO_PUBLIC_IS_RESERVATION_ENABLED=true
   ```

5. Start the backend services from Visual Studio and ensure they listen on `0.0.0.0` or `[::]`, not only `127.0.0.1`:

   - Configuration Manager: `8012`
   - Patient Portal API: `8014`
   - RIS API: `8015`
   - Viewer API: `8002`

   Check the listeners with:

   ```powershell
   netstat -ano | Select-String ':8002 ',':8012 ',':8014 ',':8015 ',':9007 ',':8081 '
   ```

6. Start the web portal from `D:\RAMYRO-FRONTEND\patientPortal`:

   ```powershell
   npm run dev
   ```

7. Before starting Expo, verify from iPhone Safari:

   - `http://<LAPTOP_IP>:9007/patientPortal/`
   - `http://<LAPTOP_IP>:8012/api/configfiles/PatientPortal.txt`

8. Start the mobile project and scan its QR code with Expo Go:

   ```powershell
   npx expo start --go --clear
   ```

If Windows Firewall blocks access, open PowerShell as Administrator and allow ports `8002`, `8012`, `8014`, `8015`, `9007`, and `8081`. Restart Metro after changing `.env.local`; Expo public environment values are loaded when the JavaScript bundle starts.

## iOS preview build

Before building, update `build.preview.env` in `eas.json`. Use URLs reachable from the test phone: a LAN IP works only on the same network; teammates normally need a public IP/domain. Ensure every URL points to the same intended deployment.

Build the installable preview version with:

```powershell
npx --yes eas-cli@latest build --profile preview --platform ios --clear-cache
```

Install it using the link or QR code on the Expo build page. A new build with the same bundle identifier normally replaces/updates the installed app. A new iPhone may need to be registered and included in a new ad hoc provisioning profile before it can install the preview build.

The Expo/EAS project and local Apple signing credentials are already linked and configured. They do not need to be recreated for every build unless a certificate/profile expires, the bundle identifier changes, or a new test device must be added. Keep `credentials.json` and `credentials/apple-signing` private.

## Production and TestFlight

Before a production build, configure `build.production.env` in `eas.json` with the real public HTTPS Patient Portal, web viewer, shared-study, and RIS URLs. Also set the correct tenant, branch, and reservation flag. Never use `localhost` or a private LAN address for a remotely distributed build.

Build and submit with:

```powershell
npx --yes eas-cli@latest build --profile production --platform ios --clear-cache
npx --yes eas-cli@latest submit --platform ios --latest
```

The production build is submitted to App Store Connect, where it can be distributed through TestFlight or prepared for App Store release.

## Quick check before running or building

- The host is consistent in `PatientPortal.txt`, `.env.local`, and the relevant `eas.json` profile.
- All APIs and the web portal are running and reachable from the phone.
- Services listen on the network, and Windows Firewall permits their ports.
- Reservation tenant, branch, and feature flag values are correct.
- Metro was restarted after local environment changes.
- A new EAS build was made after changing build-time URLs.
