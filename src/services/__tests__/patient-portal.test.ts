import { patientPortalService } from '@/src/services/patient-portal';

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));
jest.mock('@/src/lib/report-files', () => ({ createReportFile: jest.fn() }));

describe('patient portal requests', () => {
  afterEach(() => jest.restoreAllMocks());

  it('sends only the documented login fields', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { token: 'jwt' }, errors: [], message: '' }),
    } as Response);

    await patientPortalService.login({ username: 'patient', password: 'secret' });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({ username: 'patient', password: 'secret' });
    expect(init.body).not.toContain('tenantId');
  });

  it('URL-encodes the UID and never adds tenantId', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { sharedStudyCode: 'abc', expiresAtUtc: '2026-01-01' }, errors: [], message: '' }),
    } as Response);

    await patientPortalService.createShareLink('1.2/3?x=1', 'token');
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('studyInstanceUID=1.2%2F3%3Fx%3D1');
    expect(String(url)).not.toContain('tenantId');
  });
});
