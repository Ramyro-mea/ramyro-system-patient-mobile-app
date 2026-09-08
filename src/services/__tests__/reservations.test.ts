import { env } from '@/src/config/env';
import { reservationsService } from '@/src/services/reservations';

const request = {
  entityBranchId: 1,
  patientId: 'patient-123',
  firstName: 'Ramy',
  lastName: 'Patient',
  phoneNumber: '+201000000000',
  email: 'patient@example.com',
  dateOfBirth: '1990-01-02',
  gender: 'Male',
  reasonForReservation: 'Persistent headache',
};

function successful<T>(data: T) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ success: true, data, errors: [], message: 'Success' }),
  } as Response;
}

describe('reservation requests', () => {
  afterEach(() => jest.restoreAllMocks());

  it('creates a guest request without a patient or authorization', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      successful({ submittedAtUtc: '2026-09-03T10:00:00Z' }),
    );

    await reservationsService.createGuest(request);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      `${env.risApiUrl}/api/patient/bookings/mobile-request/guest?tenantId=${env.risTenantId}`,
    );
    expect((init?.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(JSON.parse(init?.body as string)).not.toHaveProperty('patientId');
  });

  it('authenticates patient creation and visit retrieval', async () => {
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(successful({ visitId: 1 }))
      .mockResolvedValueOnce(successful([]));

    await reservationsService.create(request, 'patient-token');
    await reservationsService.getVisits('patient-token');

    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string).patientId).toBe('patient-123');
    expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>).Authorization)
      .toBe('Bearer patient-token');
    expect(String(fetchMock.mock.calls[1][0]))
      .toBe(`${env.risApiUrl}/api/patient/bookings/visits`);
  });
});
