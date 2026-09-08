import { fetch as expoFetch } from 'expo/fetch';

import { ApiError, envelopeErrorMessages, notifyUnauthorized, requestApi } from '@/src/lib/api-client';
import { createReportFile } from '@/src/lib/report-files';
import type {
  LoginRequest,
  PatientAuthResponse,
  PatientProfile,
  PatientWorklistItem,
  PushTokenRegistrationRequest,
  RegistrationRequest,
  SharedStudyLinkResponse,
} from '@/src/types/api';
import { env } from '@/src/config/env';

export const patientPortalService = {
  login(request: LoginRequest) {
    return requestApi<PatientAuthResponse>(
      '/api/PatientLogin/login',
      { method: 'POST', body: JSON.stringify(request) },
      undefined,
      'Login failed. Please try again.',
    );
  },

  register(request: RegistrationRequest) {
    return requestApi<PatientAuthResponse>(
      '/api/PatientRegistration/register',
      { method: 'POST', body: JSON.stringify(request) },
      undefined,
      'Registration failed. Please try again.',
    );
  },

  registerPushToken(request: PushTokenRegistrationRequest, token: string) {
    return requestApi<boolean>(
      '/api/Push/register',
      { method: 'POST', body: JSON.stringify(request) },
      token,
      'Notifications could not be enabled right now.',
    );
  },

  unregisterPushToken(pushToken: string, token: string) {
    return requestApi<boolean>(
      '/api/Push/unregister',
      { method: 'POST', body: JSON.stringify({ token: pushToken }) },
      token,
      'Notifications could not be disabled right now.',
    );
  },

  getProfile(token: string) {
    return requestApi<PatientProfile>(
      '/api/PatientProfile/profile',
      {},
      token,
      'Failed to load your profile.',
    );
  },

  getWorklist(token: string) {
    return requestApi<PatientWorklistItem[]>(
      '/api/PatientProfile/worklist',
      {},
      token,
      'Failed to load your studies.',
    );
  },

  createShareLink(studyInstanceUID: string, token: string) {
    return requestApi<SharedStudyLinkResponse>(
      `/api/PatientProfile/share-link?studyInstanceUID=${encodeURIComponent(studyInstanceUID)}`,
      { method: 'POST', body: '{}' },
      token,
      'Failed to create the study link.',
    );
  },

  async downloadReport(studyId: number, token: string) {
    let response: Response;
    try {
      response = await expoFetch(
        `${env.apiUrl}/api/PatientProfile/report/${encodeURIComponent(studyId)}`,
        {
          headers: {
            Accept: 'application/pdf',
            Authorization: `Bearer ${token}`,
          },
        },
      );
    } catch {
      throw new ApiError([
        'Unable to reach the Patient Portal server. Check your network and try again.',
      ]);
    }

    if (!response.ok) {
      if (response.status === 401) await notifyUnauthorized();
      let envelope = null;
      try {
        envelope = await response.json();
      } catch {
        // The report endpoint can return a plain-text error.
      }
      throw new ApiError(
        envelopeErrorMessages(envelope, 'Report not found or failed to load.'),
        response.status,
      );
    }

    const contentType = response.headers.get('content-type')?.toLowerCase() || '';
    if (!contentType.includes('application/pdf')) {
      throw new ApiError(['The server returned an invalid report file.']);
    }

    const bytes = await response.bytes();
    if (!bytes.length) throw new ApiError(['The report file is empty.']);
    return createReportFile(studyId, bytes);
  },
};
