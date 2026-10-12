import type { ReservationValues } from '@/src/lib/validation';
import type { CreateMobileVisitRequest, PatientFieldKey } from '@/src/types/api';

function buildInternationalPhone(countryCode: string, phoneNumber: string) {
  if (!phoneNumber.trim()) return null;
  const code = countryCode.replace(/\D/g, '');
  const number = phoneNumber.replace(/\D/g, '').replace(/^0+/, '');
  return `+${code}${number}`;
}

export function buildReservationRequest(
  entityBranchId: number,
  values: ReservationValues,
  requiredFields: ReadonlySet<string>,
  patientId?: string | null,
): CreateMobileVisitRequest {
  const requiredText = (field: PatientFieldKey, value: string) => (
    requiredFields.has(field) ? value.trim() || null : null
  );

  const request: CreateMobileVisitRequest = {
    entityBranchId,
    title: requiredText('title', values.title),
    nationality: requiredText('nationality', values.nationality)?.toUpperCase() ?? null,
    firstName: requiredText('firstName', values.firstName),
    middleName: requiredText('middleName', values.middleName),
    lastName: requiredText('lastName', values.lastName),
    ssn: requiredText('ssn', values.ssn),
    phoneNumber: requiredFields.has('phoneNumber')
      ? buildInternationalPhone(values.countryCode, values.phoneNumber)
      : null,
    email: requiredText('email', values.email),
    gender: requiredText('gender', values.gender),
    dateOfBirth: requiredText('dateOfBirth', values.dateOfBirth),
    address: requiredText('address', values.address),
    emergencyContactNumber: requiredFields.has('emergencyContactNumber')
      ? buildInternationalPhone(values.emergencyCountryCode, values.emergencyContactNumber)
      : null,
    weightKg: requiredFields.has('weightKg') && values.weightKg
      ? Number(values.weightKg)
      : null,
    heightCm: requiredFields.has('heightCm') && values.heightCm
      ? Number(values.heightCm)
      : null,
    procedureId: values.procedureId,
  };

  if (patientId !== undefined) request.patientId = patientId;
  return request;
}
