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
  procedureId: null,
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
    const receipt = {
      visitId: 27,
      orderId: null,
      submittedAtUtc: '2026-09-03T10:00:00Z',
      procedureId: null,
      procedureDisplayName: null,
    };
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      successful(receipt),
    );

    await expect(reservationsService.createGuest(request)).resolves.toEqual(receipt);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      `${env.risApiUrl}/api/patient/bookings/mobile-request/guest?tenantId=${env.risTenantId}`,
    );
    expect((init?.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(JSON.parse(init?.body as string)).not.toHaveProperty('patientId');
  });

  it('authenticates patient creation and visit retrieval', async () => {
    const visit = {
      visitId: 27,
      visitNumber: 'RV27',
      orderId: 91,
      procedureId: 8,
      procedure: 'MRI Brain',
      bookingSource: 'PatientPortal',
      status: 'Scheduled',
      createdAtUtc: '2026-09-03T10:00:00Z',
      scheduledAtUtc: '2026-09-03T10:00:00Z',
      roomName: null,
      reasonForReservation: null,
      totalPrice: 115,
      depositedAmount: 25,
      currencyCode: 'EGP',
      currencySymbol: null,
      isPaid: true,
    };
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(successful(visit))
      .mockResolvedValueOnce(successful([visit]));

    await reservationsService.create(request, 'patient-token');
    await expect(reservationsService.getVisits('patient-token')).resolves.toEqual([visit]);

    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string).patientId).toBe('patient-123');
    expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>).Authorization)
      .toBe('Bearer patient-token');
    expect(String(fetchMock.mock.calls[1][0]))
      .toBe(`${env.risApiUrl}/api/patient/bookings/visits`);
  });

  it('normalizes persisted order amounts returned as runtime strings or aliases', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(successful([{
      visitId: 27,
      orderId: 91,
      status: 'Scheduled',
      orderTotalPrice: '2736',
      depositedAmount: null,
      currencyCode: 'EGP',
    }]));

    const visits = await reservationsService.getVisits('patient-token');

    expect(visits[0].totalPrice).toBe(2736);
    expect(visits[0].depositedAmount).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('loads joined procedure options for the configured branch', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(successful([]));

    await reservationsService.getProcedureOptions();

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      `${env.risApiUrl}/api/patient/bookings/procedure-options?branchId=${env.risBranchId}&tenantId=${env.risTenantId}`,
    );
    expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('loads prerequisites from the existing RIS endpoint', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(successful([]));

    await reservationsService.getProcedurePrerequisites(8);

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      `${env.risApiUrl}/api/ris/procedures/8/prerequisites?tenantId=${env.risTenantId}`,
    );
  });

  it('uploads a booking document as multipart data without a JSON content type', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(successful(42));

    await reservationsService.uploadDocument(27, 91, {
      id: 'document-1',
      uri: 'file:///document.jpg',
      fileName: 'document.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1024,
      source: 'camera',
      status: 'pending',
      error: null,
      webFile: new Blob(['test image'], { type: 'image/jpeg' }),
    }, 'patient-token');

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      `${env.risApiUrl}/api/patient/bookings/visits/27/documents/upload?tenantId=${env.risTenantId}`,
    );
    expect(init?.body).toBeInstanceOf(FormData);
    expect((init?.body as FormData).get('orderId')).toBe('91');
    expect((init?.headers as Record<string, string>)['Content-Type']).toBeUndefined();
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer patient-token');
  });

  it('omits orderId when uploading a visit-level booking document', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(successful(43));

    await reservationsService.uploadDocument(28, null, {
      id: 'document-2',
      uri: 'file:///visit-document.pdf',
      fileName: 'visit-document.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 2048,
      source: 'file',
      status: 'pending',
      error: null,
      webFile: new Blob(['test pdf'], { type: 'application/pdf' }),
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(init?.body).toBeInstanceOf(FormData);
    expect((init?.body as FormData).get('orderId')).toBeNull();
    expect((init?.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });
});
