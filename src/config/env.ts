const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const apiUrl = process.env.EXPO_PUBLIC_PATIENT_PORTAL_API_URL?.trim();
const webUrl = process.env.EXPO_PUBLIC_PATIENT_PORTAL_WEB_URL?.trim();
const sharedStudyUrl = process.env.EXPO_PUBLIC_SHARED_STUDY_URL?.trim();
const risApiUrl = process.env.EXPO_PUBLIC_RIS_API_URL?.trim();

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const env = {
  apiUrl: trimTrailingSlash(apiUrl || 'http://10.10.10.79:8007'),
  webUrl: trimTrailingSlash(webUrl || 'http://10.10.10.79:9007'),
  sharedStudyUrl: trimTrailingSlash(
    sharedStudyUrl ||
      'http://10.10.10.79:9007/patientPortal/shared-study',
  ),
  risApiUrl: trimTrailingSlash(risApiUrl || 'http://10.10.10.79:8014'),
  risTenantId: positiveInteger(process.env.EXPO_PUBLIC_RIS_TENANT_ID, 1),
  risBranchId: positiveInteger(process.env.EXPO_PUBLIC_RIS_BRANCH_ID, 1),
};

export const portalOrigin = new URL(env.webUrl).origin;
