# Patient Portal Change Handoff

This file summarizes the patient portal changes made in this chat so the same behavior can be applied to the web patient portal.

## 1. Visit registration QR codes

### Backend behavior

- Guest booking now returns a persisted visit receipt after the visit is saved.
- The receipt includes:
  - `visitId`
  - `submittedAtUtc`
  - `procedureId` when a procedure was selected, otherwise `null`
  - `procedureDisplayName` when a procedure was selected, otherwise `null`
- Authenticated reservation rows already include their visit IDs and continue to use the existing reservation response shape.
- No database migration was added for this feature.

### Registration URL

- The portal should read the configured RIS registration URL from environment/config.
- Construct the QR destination with the URL API or equivalent query-string builder.
- Set the `visitId` query parameter.

Example:

```text
http://localhost:9007/registration?visitId=27
```

Do not hardcode localhost in UI code. Use the configured registration base URL.

### Guest receipt behavior

- Store only the latest guest booking receipt.
- If a guest books another reservation, overwrite the previous stored receipt.
- The guest receipt card should always remain visible while the user is unauthenticated.
- The guest receipt card should show:
  - Success/green confirmation message
  - Submitted date/time
  - Visit registration QR code
  - Procedure display name, if one exists
  - `Show prerequisites` button, if `procedureId` exists
- Remove any dismiss or "Got it" behavior.
- When authentication becomes active, delete any stored guest receipt.
- This cleanup must happen for restored authenticated sessions, successful login, and successful registration.
- Logging out must not restore an old guest receipt.

### Authenticated reservations behavior

- Every authenticated reservation card should have a `Show QR code` button.
- The button opens one reusable modal showing:
  - Registration QR code for that reservation visit ID
  - Visit ID
  - Close action
- If a reservation has a procedure ID, show a compact `Prerequisites` / `Show prerequisites` button beside the QR button.
- The prerequisite button should use that reservation row's own `procedureId`.

### QR rendering requirements

- QR codes should be dark on a white background.
- Keep a sufficient quiet zone/margin so codes scan reliably in light and dark themes.
- The QR code should contain only the constructed registration URL.

## 2. Booking form requirements

### Required fields

Only these fields are required:

- First name
- Last name
- Phone number
- Date of birth

### Optional fields

These fields are optional:

- Email
- Gender
- Reason
- Procedure

Submit empty optional values as `null`.

Email should have a placeholder like:

```text
name@example.com
```

Only validate email format when the field is not empty.

### Gender

- Gender is optional.
- Allowed values are only:
  - `Male`
  - `Female`
- Use a compact select/menu, not a full-screen picker.
- Keep an unset placeholder and a clear action.

### Date of birth

- Keep `1990-01-01` as the default date shown when the field is empty.
- If the user opens the picker and taps Done without changing the wheel/date, commit the displayed default date.
- The user should not be forced to change day/month/year just to make Done work.

## 3. Procedure selection

### Booking options endpoint

Add or reuse this backend endpoint:

```http
GET /api/patient/bookings/procedure-options?branchId={branchId}&tenantId={tenantId}
```

Requirements:

- Allow anonymous access so both guest and authenticated booking forms can load it.
- Validate tenant and branch.
- Return only active procedures from the requested active branch.
- Join procedures with modalities because the UI needs the modality display name.
- Sort by modality display name, then procedure display name.
- Do not alter the existing RIS procedure search endpoint or remove/change any of its fields.

Response DTO:

```ts
type MobileProcedureOption = {
  procedureId: number;
  modalityId: number;
  modalityDisplayName: string;
  procedureDisplayName: string;
  procedureCode: string | null;
};
```

The UI label should be:

```text
{modalityDisplayName} - {procedureDisplayName}
```

Use `procedureDisplayName`, never the internal procedure `Name`.

### Booking submission

Add nullable `procedureId` to the booking request.

```ts
type CreatePatientPortalVisitRequest = {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email: string | null;
  dateOfBirth: string;
  gender: string | null;
  reasonForReservation: string | null;
  procedureId: number | null;
};
```

Backend behavior:

- With a valid procedure ID, create exactly one RIS order attached to the visit.
- Reuse the existing order prerequisite-copying behavior.
- Without a procedure ID, preserve the existing visit-only guest/authenticated booking behavior.
- Reject missing, inactive, or cross-branch procedure IDs.
- Use procedure `DisplayName` for patient-facing labels.

### Backend naming

The shared backend contracts no longer use mobile-specific type names because the same application service is consumed by mobile and web patient portals:

- `CreateMobileVisitRequest` was renamed to `CreatePatientPortalVisitRequest`.
- `MobileProcedureOptionDto` was renamed to `PatientPortalProcedureOptionDto`.
- `MobileVisitReceiptDto` was renamed to `PatientPortalVisitReceiptDto`.
- All `IPatientPortalService`, service implementation, controller, and test references use the new names.
- Existing HTTP route URLs and serialized JSON field names were intentionally left unchanged for client compatibility.
- `RisBookingSource.Mobile` was renamed to `RisBookingSource.PatientPortal` because the source represents both mobile and web patient portals.
- `PatientPortal` preserves the existing numeric enum value `2`, so previously stored visits remain compatible and no database migration is required.
- Patient-portal-created visits now serialize `bookingSource` as `PatientPortal`.
- The backend's visit-only booking allowance now checks `RisBookingSource.PatientPortal`.
- Patient portal clients do not submit this value; the backend assigns it. A client only needs updating if it explicitly compares, displays, or filters on the former `Mobile` string.
- Existing `/mobile-request` route URLs remain unchanged for compatibility.

## 4. Prerequisites

Use the existing endpoint unchanged:

```http
GET /api/ris/procedures/{procedureId}/prerequisites?tenantId={tenantId}
```

Requirements:

- Make only this existing read-only action anonymously accessible.
- Do not add another prerequisite endpoint.
- Do not change the response fields.
- Do not request or display prerequisite status.
- Ignore `status` if it exists in the response.
- Fetch prerequisites immediately when a procedure is selected.
- Disable booking submission while prerequisites are loading.
- On prerequisite load failure, provide Retry or allow the selected procedure to be cleared.
- Show `No prerequisites listed` when the endpoint returns an empty list.

Display these prerequisite details when available:

- Display/name
- Description
- Type/subtype
- Required/optional flag
- Gender applicability

Prerequisites should be visible to both guest and authenticated users when a procedure exists.

## 5. Authenticated reservation pricing and payment filter

### Backend response

Authenticated patient reservation rows now include:

```ts
type PatientVisitPricing = {
  totalPrice: number | null;
  depositedAmount: number | null;
  currencyCode: string | null;
  currencySymbol: string | null;
  isPaid: boolean | null;
  paymentStatus: "Paid" | "PartiallyPaid" | "Unpaid" | null;
};
```

- `paymentStatus` is calculated when reservations are fetched and is not stored in the database:
  - `Unpaid` when a stored total exists and the deposited amount is zero or lower.
  - `PartiallyPaid` when the deposited amount is positive and below the stored total.
  - `Paid` when the deposited amount equals or exceeds the stored total, or the stored total is zero.
  - `null` for unpriced orders and visit-only reservation requests.
- The compatibility `isPaid` field is `true` for Paid, `false` for Unpaid, and `null` for PartiallyPaid or unclassified rows.
- The patient-facing `status` field is normalized separately from `isPaid`:
  - Internal `Admitted` and `Scheduled` orders return `Scheduled`.
  - Every other order status and every visit-only reservation return `Unscheduled`.
- Internal RIS workflow statuses are not exposed through `PatientVisitDto.Status`.
- Total, deposited amount, and currency metadata come directly from the saved RIS order snapshot. Current price lists are not consulted.
- No payment-status database column or migration was added.

### Mobile reservations UI

- Pricing is shown only on authenticated reservation cards and only when `totalPrice` is non-null.
- Format the amount to two decimal places using `currencySymbol`, falling back to `currencyCode` when the symbol is missing.
- Guest receipts and the booking form do not display pricing.
- The reservations page includes a compact payment menu:
  - `All` is the default and shows every row.
  - `Paid` shows rows where `paymentStatus === "Paid"`.
  - `Partially paid` shows rows where `paymentStatus === "PartiallyPaid"`.
  - `Unpaid` shows rows where `paymentStatus === "Unpaid"`.
- Filtering happens locally without another API request.
- Unpriced and visit-only rows appear under All and are excluded from the three classified filters.
- Present the payment filter as a compact toolbar row, not a full booking-form field.
- On iOS and Android, use a small pill trigger backed by the native Expo menu. On web, use the same trigger with a compact inline dropdown.
- The trigger displays the current selection with a filter icon and chevron; the menu marks the selected option with a checkmark.
- Reservation card timestamps follow the normalized patient-facing status:
  - `Scheduled` rows show `Scheduled at` using `scheduledAtUtc`.
  - `Unscheduled` rows, including pending orders and visit-only requests, show `Requested at` using `createdAtUtc`.

## 6. Main studies page cleanup

- Remove the report status filter from the main studies page.
- Keep the modality filter.
- Empty-state copy should only refer to clearing the modality filter.
- Do not display the internal study ID on study cards. Keep `studyID` in the data model for navigation and API operations only.

## 7. Login screen cleanup

- Remove the blue session-timeout/info modal/banner from the login screen.
- A logged-out user should simply see the normal login form.

## 8. Mobile implementation notes already applied

- Added QR rendering using `react-native-qrcode-svg` and Expo-compatible `react-native-svg`.
- Added compact native picker support through `@expo/ui`.
- Added `env.risRegistrationUrl` from `EXPO_PUBLIC_RIS_REGISTRATION_URL`.
- Added registration URL helper tests.
- Added guest receipt persistence tests.
- Added reservation service tests for guest receipt fields and procedure APIs.
- Added component tests for QR and DOB picker behavior.

## 9. Booking-form document attachments

### Booking form behavior

- Document attachments are optional and appear only after a procedure is selected.
- The form provides:
  - `Scan document`, which takes one normal camera photo without cropping, edge detection, filters, or other document processing.
  - `Choose files`, which accepts existing PDF, JPEG, and PNG files.
- Camera permission is requested only when the scan action is used.
- When camera permission can no longer be requested, the app offers an Open Settings action.
- Users can attach up to five documents, with a maximum size of 20 MB per file.
- The selected-document list shows filename, size/source, upload progress, failures, and a remove action before booking.
- Clearing the selected procedure also clears selected documents after confirmation.

### Booking and upload sequence

- The reservation is created before documents are uploaded because the upload requires the persisted visit and order IDs.
- Guest booking receipts now also return and persist nullable `orderId`.
- Authenticated booking responses already contain `orderId`.
- The guest receipt is saved immediately after the booking response is received.
- Each document is then uploaded using the returned `visitId` and `orderId`.
- Upload retry operates only on failed documents and never submits the booking a second time.
- If uploads still fail, the user can continue without them; there is no later document-upload button on receipt or reservation cards.

### Patient booking document endpoint

```http
POST /api/patient/bookings/visits/{visitId}/documents/upload?tenantId={tenantId}
Content-Type: multipart/form-data
```

Multipart fields:

- `orderId`
- `file`

Backend behavior:

- The endpoint allows anonymous requests so guest bookings can upload without a guest token.
- The submitted order must belong to the submitted visit.
- If the visit has a patient ID, the request must contain an authenticated `Patient` token whose subject matches that patient.
- If the visit has no patient ID, the upload is allowed anonymously.
- The server accepts only PDF, JPEG, and PNG and enforces 20 MB per file and five patient-portal documents per visit.
- Documents use the fixed type `PatientPortalAttachment`.
- Documents are linked to the visit and order with `prerequisiteId` set to `null`.
- `RisDocument.PrerequisiteId` was already nullable, so no database migration was needed.
- The existing staff-facing RIS upload endpoint and shared prerequisite behavior were not changed.
- No visit-status restriction was added.

### Mobile dependencies

- Added Expo SDK 57-compatible `expo-image-picker` for camera capture.
- Added Expo SDK 57-compatible `expo-document-picker` for existing files.
- Configured a patient-facing camera permission message and disabled unnecessary photo-library and microphone permissions from the image-picker plugin.
- Multipart requests intentionally omit an explicit `Content-Type` header so the runtime supplies the required boundary.

### Multipart reliability and diagnostics

- Multipart mode is passed explicitly to the shared API client instead of being inferred with `body instanceof FormData`, which is not reliable across every Expo/React Native runtime.
- Explicit multipart mode prevents the shared client from adding `Content-Type: application/json`; the native runtime remains responsible for generating `multipart/form-data` with its boundary.
- The patient upload endpoint logs receipt, validation rejection, authorization rejection, unexpected failure, and successful document creation using visit/order/document identifiers without logging file contents.
- The upload action no longer applies `[FromForm]` directly to `IFormFile`, preventing that action from breaking Swagger document generation.
- Document storage still uses the existing `RisDocumentsPath` system configuration. The setting must be seeded or configured in pocAdmin (the standard Windows seed value is `C:\Ramyro\RISDocuments`); uploads return a validation error and create no document when it is missing.
- A single manual multipart trial against guest visit 36/order 34 reached the endpoint but created no document because the current environment did not contain `RisDocumentsPath`.
- The local tenant-1 environment was subsequently configured with `RisDocumentsPath = C:\Ramyro\RISDocuments` (configuration row ID 101), and that directory was created. `SystemConfigurationService.GetByKeyAsync` reads the database on each request, so an API restart is not required solely for this configuration value.
- Native multipart attachments use `File` from `expo-file-system`, which implements `Blob`, instead of casting a React Native `{ uri, name, type }` object to `Blob`. This is required for Expo SDK 57's standards-compliant global fetch implementation.
- Upload failures use one global patient-facing message after the entire batch finishes. Individual rows show only their upload state, without exposing transport or server details.
- Retry and Continue actions, along with the global failure message, remain hidden while initial or retry uploads are still running. This prevents a partially completed multi-file batch from appearing to have failed while later files are waiting.

Builds and test commands were intentionally not run, per request. Manual testing should cover guest booking, authenticated booking, camera/file attachments and upload retries, QR scanning, prerequisite loading, login cleanup, and the studies filter cleanup.

## 10. Web patient portal implementation

The corresponding changes were applied to `D:\RAMYRO-FRONTEND\patientPortal` with these web-specific decisions:

- The web portal remains authenticated-only. No guest booking route, guest receipt persistence, guest QR card, or guest-auth cleanup was added.
- The authenticated booking form initially required first name, last name, phone number, and date of birth. This was later superseded by configuration-driven required demographics; email, gender, and procedure remain optional unless configured otherwise, and the reason field has been removed.
- Missing profile dates default to `1990-01-01`, email uses the `name@example.com` placeholder, and the compact RIS gender selector includes a clear action.
- Procedure options are loaded from `/api/patient/bookings/procedure-options?branchId={branchId}` and shown in a searchable `Modality Display Name — Procedure Display Name` selector.
- Prerequisites are loaded from the existing `/api/ris/procedures/{procedureId}/prerequisites` endpoint, shown in the form and in a reusable reservation dialog, and prerequisite status is ignored.
- The current backend resolves tenant context internally for these routes, so the web client does not append `tenantId` or introduce a tenant environment setting.
- Web attachments use a normal multi-file picker only. No camera, scan, capture, or camera-capability detection was added.
- The form accepts up to five PDF/JPEG/PNG files of at most 20 MB each. It creates the reservation once, uploads files sequentially, retries only failed uploads, and permits continuing without failed documents.
- Multipart uploads use the browser `File` and `FormData` APIs and leave the `Content-Type` boundary to the browser.
- Authenticated reservation cards and desktop rows show QR and prerequisite actions. QR codes use `qrcode.react`, a white background, a dark foreground, and a quiet zone.
- Added `VITE_RIS_REGISTRATION_URL`, exposed as `env.risRegistrationUrl`, with the runtime configuration value `http://$SERVER_HOSTNAME:9007/registration`.
- Authenticated reservation cards and rows display VAT-inclusive pricing only when returned, using the currency symbol with currency-code fallback.
- A compact local All/Paid/Partially paid/Unpaid filter uses the backend `paymentStatus` field. Scheduled rows use `scheduledAtUtc`; every other row is labelled `Requested at` and uses `createdAtUtc`.
- The studies page retains only modality filtering. Report-status statistics and filtering were removed, and internal study IDs are hidden from both cards and the desktop table while remaining available internally for navigation.
- The existing web login screen already had no session-timeout modal, so its plain login behavior was retained.
- The web prerequisites dialog was refined to match the portal's card styling, with a rounded gradient header, prerequisite icon, scrollable content, styled requirement badges, loading state, and bordered footer.
- The web QR dialog now uses the same rounded gradient header, icon container, bordered content area, visit-ID pill, and matching footer treatment as the prerequisites dialog.
- The booking-form prerequisite area now uses a collapsible appointment-preparation card with a prerequisite/required-count summary, an expanded-by-default details area, and retained retry/clear handling.
- The booking submit action remains full-width on phones and is right-aligned with a compact minimum width on medium and larger screens.
- Booking-form responsiveness was improved by hydrating profile values once, stabilizing field callbacks, avoiding redundant validation-state updates, and memoizing the 263-item country selector, procedure selector, and prerequisite section so ordinary typing no longer rebuilds those expensive trees.
- The mobile booking form now mirrors the web prerequisite experience with an expanded-by-default `Before your appointment` card, requirement and required-count summary, compact View/Hide control, loading treatment, and the existing retry/clear actions.

Builds, tests, linters, and formatters were not run for the web implementation, as requested.

## 11. Visit-level booking documents

- The existing patient booking upload endpoint now accepts an optional multipart `orderId`. When omitted, the document is stored against the visit with `OrderId = null`; when supplied, the order must still belong to the visit.
- Visit ownership, anonymous guest behavior, file-type and size validation, the five-document limit, storage, and the `PatientPortalAttachment` document type remain unchanged.
- The Documents section is always available in both booking forms, even when no procedure is selected. Mobile retains camera capture and file selection; web remains file-selection only.
- Pending documents remain selected when the procedure is selected, changed, or cleared. After the reservation is created, clients include `orderId` only when the booking response contains one.
- Procedure-free reservations are still created once and their documents upload sequentially using only `visitId`; retry continues to target failed files without creating another reservation.
- No database migration is required because RIS document order links were already nullable.

Builds, tests, linters, and formatters were not run for this change, as requested.

## 12. Persisted order totals and deposits

- Patient reservation responses now read `OrderTotalPrice` and `DepositedAmount` directly from each saved RIS order instead of recalculating prices from current procedure, payer, insurance, and price-list data.
- `PatientVisitPricingResolver` and its dependency-registration entry were removed. `PatientPortalService` performs direct mapping and resolves only the currency code/symbol referenced by the order's saved `CurrencyId`, caching repeated currency IDs.
- The response adds nullable `depositedAmount`. Priced orders return the stored deposit, including `0`; visit-only and unpriced rows return null financial fields.
- Payment classification uses persisted order amounts: zero deposit is `Unpaid`, a positive deposit below the total is `PartiallyPaid`, and a deposit equal to or above the total is `Paid`. Unpriced and visit-only rows are unclassified.
- Patient-facing status normalization now reflects the current enum: `Admitted` and `Scheduled` display as `Scheduled`; every other row displays as `Unscheduled`. Obsolete `StudyCreated` and `ScanDone` portal handling was removed.
- Mobile reservation cards display separate `Total price` and `Deposited amount` rows. Web cards do the same, while the desktop table uses one compact Payment column containing both labelled amounts.
- Both portals format the two stored amounts with the saved currency symbol or currency-code fallback. Neither portal calculates an outstanding balance, copay, or remaining amount.
- Patient-portal-created orders may initially have no saved total; financial rows remain hidden until the RIS workflow populates the order price snapshot.
- No database migration was added because the RIS order financial columns already exist.

Builds, tests, linters, formatters, and migrations were not run for this change, as requested.

### Web payment-cell refinement

- The desktop reservations table now renders Total price and Deposited as aligned label/value rows in a wider Payment cell, with non-wrapping currency amounts.
- Missing or non-numeric deposited values are displayed as `0.00` for priced orders instead of `NaN`; invalid stored total values also safely format as zero.

### Mobile financial-response normalization

- The mobile reservation service normalizes stored totals and deposits before caching/rendering them, accepting numeric JSON values, numeric strings, and both `totalPrice` and `orderTotalPrice` response aliases.
- When a total exists but the deposit is missing or invalid, mobile displays a deposited amount of `0.00`. Currency code/symbol aliases are normalized as well, and amount formatting cannot emit `NaN`.
- The EAS preview API ports were corrected to match the backend services: PatientPortal uses `8014` and RISService uses `8015`. The local `.env.local` configuration already used this mapping.
- The web desktop Payment cell uses a compact two-column label/value grid with a smaller minimum width, keeping both monetary rows aligned without excessive space between labels and amounts.
- The mobile payment-filter trigger uses a fixed compact width and a single-line label so `Partially paid` fits cleanly without clipping or wrapping.

## 13. RIS report delivery tracker

- Added a role-protected `/report-delivery` page to `D:\RAMYRO-FRONTEND\pocRIS`, backed by dedicated endpoints under `/api/ris/report-deliveries` in `RISService`.
- The tracker includes only non-cancelled RIS orders with a linked, non-deleted study and defaults to orders scheduled today. It supports patient/order/accession search plus branch, modality, report-status, delivery-status, quick-date, and manual date-range filters.
- Delivery readiness uses three states. Required Pending or Waived prerequisites produce `Prerequisites pending`; otherwise a non-terminal report is `In workflow`; a terminal report with no required blockers is `Ready for delivery`.
- Terminal report detection matches the notification engine: `REP_Reviewed`, or `REP_Verified` with double verification enabled, latest-report second verification, and no review requirement.
- Reception can inspect required prerequisites in an inline dialog. With management permission, Pending or Waived non-document requirements can be completed with notes, while document requirements can be satisfied by uploading a PDF/JPEG/PNG file or linking an unlinked document from the same visit.
- Report preview and download are both restricted to Ready-for-delivery rows and are independently protected by view/manage permissions. Reports reuse the existing latest-RTF-to-PDF conversion path.
- Added responsive cards, a desktop table, readiness summary cards, current prerequisite progress, a PDF preview dialog, and localized copy for every existing RIS locale.
- Added and registered `CanViewRISReportDelivery` and `CanManageRISReportDelivery`. They are intentionally not assigned to a group; both must be granted to reception users through role administration.
- The delivery API now requires authentication without enforcing those two roles server-side. The RIS frontend uses the roles only to expose the page and management/download controls.
- Delivery rows return the order's stored total price, deposited amount, calculated non-negative remaining amount, saved currency code/symbol, and nullable `isFullyPaid`. Unpriced orders remain financially unclassified.
- Desktop and responsive delivery rows display Total price and Deposited amount when a stored total exists. A prominent green `Paid in full` label appears when the calculated remaining amount is zero; this backend flag is intended to support the future patient-notification action.
- The report-delivery prerequisite dialog no longer displays completion notes. Non-document prerequisites are completed with one action and the frontend submits an empty request body, while the backend's optional notes contract remains compatible with other flows.
- The dialog layout now has a fixed header/footer, a scrollable content area, a prerequisite progress summary, clearer pending/completed cards, and separated upload/link panels for document prerequisites.
- No physical-delivery state, patient notification action, database field, or migration was added.
- Added classifier coverage for prerequisite precedence and the reviewed/second-verification terminal cases.

Builds, tests, linters, and formatters were not run for this feature, as requested.

## 14. Configuration-driven reservation demographics

- Guest mobile bookings and authenticated mobile/web bookings now load the configured branch fields from `GET /api/ris/patient-field-configurations?entityBranchId={branchId}`. The existing endpoint is anonymously readable so guest forms can use the same RIS configuration source.
- The configuration query is cached by branch. Submission remains unavailable while the configuration is loading or failed, and both clients provide a Retry action instead of falling back to hardcoded requirements.
- Reservation forms render only fields marked `Required`, in the RIS demographic order: title, nationality, first/middle/last name, SSN, phone, email, gender, DOB, address, emergency contact, weight, and height.
- Title uses the RIS title list, nationality is a searchable ISO-2 country selector, phone fields retain country-code controls, gender uses the RIS Male/Female/Other/Unknown values, and weight/height use positive numeric values with units.
- Authenticated forms prefill supported demographics from the patient profile. Existing patient-master values are read-only, while missing required values remain editable. The profile response includes title, nationality, emergency contact, and correctly mapped address/SSN plus the existing patient identifiers and status metadata.
- Guest forms retain the existing country-code and `1990-01-01` DOB defaults. Empty or non-required demographic values are submitted as `null`.
- Backend validation now resolves the branch configuration through `IPatientFieldConfigurationService` and enforces every currently required field. It also validates international phone numbers, optional email, non-future DOB, the four RIS gender values, ISO-2 nationality, and positive weight/height values.
- `CreatePatientPortalVisitRequest` now carries nullable standard demographics, all of which map to the existing `RisVisit` snapshot columns. No schema migration was required.
- Authenticated bookings resolve the linked patient exclusively from the token subject; the compatibility `patientId` request value is not trusted. The request still creates the visit snapshot, and validated submitted values fill only patient-master fields that were previously blank.
- Guest bookings continue creating an unlinked visit snapshot. The existing admission workflow can create/link the patient later and already copies the expanded snapshot fields.
- The lightweight patient-portal booking path remains in use, so portal requests still do not select or resolve a room, machine, date, or time slot. Optional procedures remain unscheduled as before.
- Effective patient/visit question definitions remain excluded for call-center completion. The former Reason field and its clinical-history/order-reason mapping were removed in the follow-up described below.
- Procedure selection, prerequisites, scans/files, upload retry/continue behavior, guest receipts, QR codes, reservation history, pricing, studies, reports, and other portal features were not changed.

No linters, formatters, or migrations were run. Mobile Jest coverage now verifies every configurable required demographic, optional demographic formats, normalized RIS request construction, required-only null serialization, guest/authenticated request behavior, and anonymous field-configuration loading. The full mobile suite passed: 19 suites and 74 tests.

A dedicated `RISService.Tests` xUnit project now covers the corresponding backend contract: every supported required field, Optional/Hidden omission, case-insensitive configuration keys, supplied-value formats, the normalized mobile payload, anonymous guest/configuration endpoints, and use of the authenticated token subject instead of a spoofed request `patientId`. Its 28 tests pass.

## 15. Reservation form readiness, responsiveness, and reason removal

- The web booking page now keeps the form unmounted until the authenticated profile, branch patient-field configuration, and procedure options are all available. A single loading card is shown while those sources load, and one Retry action reloads them when any source fails.
- Web text controls are memoized with stable field-update callbacks, so typing in one field does not rerender every other text control or rebuild the country/procedure selectors. The large decorative blur layers were also removed to avoid unnecessary browser compositing during form interaction.
- `reasonForReservation` was removed from the mobile and web form values, request types, submitted payloads, reservation response types, cards, and the web desktop table.
- The RIS patient-portal booking contract no longer accepts or returns a reservation reason. New portal bookings no longer write that value to `RisVisit.ClinicalHistory` or `RisOrder.ReasonForStudy`.
- Existing procedure selection, prerequisite display, document capture/upload, retry behavior, QR codes, demographics, and pricing remain unchanged.

Builds, tests, linters, and formatters were not run for this follow-up, as requested.

### Cairo reservation timestamps

- True UTC request/submission timestamps are normalized from the high-precision .NET timestamp shape and rendered in the `Africa/Cairo` timezone.
- Scheduled reservation timestamps preserve the wall-clock date and time selected in RIS. They are not shifted a second time, so an RIS time of `09:40` remains `09:40` in both patient portals.
- No timezone suffix is displayed.
- This applies to authenticated reservation rows/cards and the persisted mobile guest receipt. No backend timestamp or database behavior was changed.

Builds, tests, linters, and formatters were not run for this adjustment, as requested.

## 16. RIS gender values

- Backend validation and both reservation forms now accept exactly `Male`, `Female`, `Other`, and `Unknown`. Authenticated profile prefilling also maps the abbreviated `M`, `F`, `O`, and `U` values, and profile cards display all four labels.

Builds, tests, linters, and formatters were not run for this change, as requested.

## 17. Registered-patient demographic completion

- Guest reservation behavior is unchanged: submitted demographics remain stored on the visit snapshot for call-center completion.
- In authenticated mobile and web reservation forms, required demographic values already present in the patient profile remain prefilled and are read-only. Missing required values remain editable.
- Weight and height remain editable because they are visit-level measurements and are not stored on the patient master record.
- When an authenticated reservation is submitted, RIS continues linking the visit to the patient resolved from the access token. It fills only blank patient-master demographic fields from the validated request and never overwrites an existing value.
- Supported patient-master completion fields are title, nationality, first/middle/last name, SSN, phone, email, gender, date of birth, address, and emergency contact number.
- Mobile and web invalidate their patient-profile cache after a successful authenticated booking so newly completed information is reflected on the next reservation form.

Builds, tests, linters, and formatters were not run for this change, as requested.
