import { buildReservationRequest } from '@/src/lib/reservation-request';
import type { ReservationValues } from '@/src/lib/validation';

const values: ReservationValues = {
  title: ' Dr ',
  nationality: ' eg ',
  firstName: ' Ramy ',
  middleName: ' Ahmed ',
  lastName: ' Patient ',
  ssn: ' 29801011234567 ',
  countryCode: '+20',
  phoneNumber: '(010) 1234-5678',
  email: ' patient@example.com ',
  dateOfBirth: '1990-01-02',
  gender: 'Male',
  address: ' Cairo ',
  emergencyCountryCode: '+1',
  emergencyContactNumber: '0555 123 4567',
  weightKg: '75.5',
  heightCm: '180',
  procedureId: 8,
};

const everyDemographic = new Set([
  'title',
  'nationality',
  'firstName',
  'middleName',
  'lastName',
  'ssn',
  'phoneNumber',
  'email',
  'dateOfBirth',
  'gender',
  'address',
  'emergencyContactNumber',
  'weightKg',
  'heightCm',
]);

describe('RIS reservation request mapping', () => {
  it('normalizes every configured demographic into the RIS request contract', () => {
    expect(buildReservationRequest(1053, values, everyDemographic)).toEqual({
      entityBranchId: 1053,
      title: 'Dr',
      nationality: 'EG',
      firstName: 'Ramy',
      middleName: 'Ahmed',
      lastName: 'Patient',
      ssn: '29801011234567',
      phoneNumber: '+201012345678',
      email: 'patient@example.com',
      gender: 'Male',
      dateOfBirth: '1990-01-02',
      address: 'Cairo',
      emergencyContactNumber: '+15551234567',
      weightKg: 75.5,
      heightCm: 180,
      procedureId: 8,
    });
  });

  it('sends non-required demographics as null while retaining optional booking data', () => {
    const request = buildReservationRequest(
      1053,
      values,
      new Set(['firstName', 'phoneNumber']),
    );

    expect(request).toMatchObject({
      firstName: 'Ramy',
      phoneNumber: '+201012345678',
      title: null,
      nationality: null,
      middleName: null,
      lastName: null,
      dateOfBirth: null,
      weightKg: null,
      heightCm: null,
      procedureId: 8,
    });
    expect(request).not.toHaveProperty('patientId');
  });

  it('includes the authenticated patient identifier only when supplied', () => {
    expect(buildReservationRequest(1053, values, everyDemographic, 'patient-123').patientId)
      .toBe('patient-123');
    expect(buildReservationRequest(1053, values, everyDemographic, null))
      .toHaveProperty('patientId', null);
  });

  it('serializes a missing procedure independently of demographics', () => {
    const request = buildReservationRequest(1053, {
      ...values,
      procedureId: null,
    }, new Set());

    expect(request.procedureId).toBeNull();
  });
});
