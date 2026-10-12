import { z } from 'zod';

const username = z.string().trim().min(1, 'Username is required.').max(256, 'Username cannot exceed 256 characters.');
const password = z.string().min(1, 'Password is required.').max(256, 'Password cannot exceed 256 characters.');

export const loginSchema = z.object({ username, password });

export const registrationSchema = z.object({
  patientCode: z.string().min(1, 'Patient code is required.').max(256, 'Patient code cannot exceed 256 characters.'),
  username,
  password,
  confirmPassword: z.string().min(1, 'Please confirm your password.').max(256, 'Password confirmation cannot exceed 256 characters.'),
}).refine((values) => values.password === values.confirmPassword, {
  path: ['confirmPassword'],
  message: 'Passwords do not match.',
});

export type LoginValues = z.infer<typeof loginSchema>;
export type RegistrationValues = z.infer<typeof registrationSchema>;

const reservationBaseSchema = z.object({
  title: z.string().trim().max(40, 'Title cannot exceed 40 characters.'),
  nationality: z.string().trim().refine(
    (value) => value.length === 0 || /^[A-Za-z]{2}$/.test(value),
    'Select a valid nationality.',
  ),
  firstName: z.string().trim().max(200, 'First name cannot exceed 200 characters.'),
  middleName: z.string().trim().max(200, 'Middle name cannot exceed 200 characters.'),
  lastName: z.string().trim().max(200, 'Last name cannot exceed 200 characters.'),
  ssn: z.string().trim().max(450, 'National ID / SSN cannot exceed 450 characters.'),
  countryCode: z.string().trim().regex(/^\+\d{1,4}$/, 'Select a valid country code.'),
  phoneNumber: z.string().trim().max(30, 'Mobile number cannot exceed 30 characters.').refine(
    (value) => value.length === 0 || (/^[-\d\s().]+$/.test(value) && (value.match(/\d/g)?.length ?? 0) >= 6),
    'Enter a valid mobile number.',
  ),
  email: z.string().trim().max(256, 'Email cannot exceed 256 characters.').refine(
    (value) => value.length === 0 || z.email().safeParse(value).success,
    'Enter a valid email address.',
  ),
  dateOfBirth: z.string().trim().refine((value) => {
    if (value.length === 0) return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && date <= new Date();
  }, 'Use a valid past date in YYYY-MM-DD format.'),
  gender: z.string().refine(
    (value): boolean => value === '' || ['Male', 'Female', 'Other', 'Unknown'].includes(value),
    'Select a valid gender.',
  ),
  address: z.string().trim().max(450, 'Address cannot exceed 450 characters.'),
  emergencyCountryCode: z.string().trim().regex(/^\+\d{1,4}$/, 'Select a valid country code.'),
  emergencyContactNumber: z.string().trim().max(30, 'Emergency contact cannot exceed 30 characters.').refine(
    (value) => value.length === 0 || (/^[-\d\s().]+$/.test(value) && (value.match(/\d/g)?.length ?? 0) >= 6),
    'Enter a valid emergency contact number.',
  ),
  weightKg: z.string().trim().refine(
    (value) => value.length === 0 || (Number.isFinite(Number(value)) && Number(value) > 0),
    'Weight must be greater than zero.',
  ),
  heightCm: z.string().trim().refine(
    (value) => value.length === 0 || (Number.isFinite(Number(value)) && Number(value) > 0),
    'Height must be greater than zero.',
  ),
  procedureId: z.number().int().positive().nullable(),
});

export type ReservationValues = z.infer<typeof reservationBaseSchema>;

type RequiredPatientField = Exclude<keyof ReservationValues,
  | 'countryCode'
  | 'emergencyCountryCode'
  | 'procedureId'
>;

const requiredMessages: Record<RequiredPatientField, string> = {
  title: 'Title is required.',
  nationality: 'Nationality is required.',
  firstName: 'First name is required.',
  middleName: 'Middle name is required.',
  lastName: 'Last name is required.',
  ssn: 'National ID / SSN is required.',
  phoneNumber: 'Mobile number is required.',
  email: 'Email is required.',
  dateOfBirth: 'Date of birth is required.',
  gender: 'Gender is required.',
  address: 'Address is required.',
  emergencyContactNumber: 'Emergency contact is required.',
  weightKg: 'Weight is required.',
  heightCm: 'Height is required.',
};

function isValidInternationalPhone(countryCode: string, phoneNumber: string) {
  const digits = `${countryCode}${phoneNumber}`.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15;
}

export function createReservationSchema(requiredFields: ReadonlySet<string>) {
  return reservationBaseSchema.superRefine((values, context) => {
    for (const [field, message] of Object.entries(requiredMessages)) {
      if (requiredFields.has(field) && !String(values[field as RequiredPatientField] ?? '').trim()) {
        context.addIssue({ code: 'custom', path: [field], message });
      }
    }

    if (values.phoneNumber && !isValidInternationalPhone(values.countryCode, values.phoneNumber)) {
      context.addIssue({ code: 'custom', path: ['phoneNumber'], message: 'Enter a valid international mobile number.' });
    }
    if (values.emergencyContactNumber
      && !isValidInternationalPhone(values.emergencyCountryCode, values.emergencyContactNumber)) {
      context.addIssue({ code: 'custom', path: ['emergencyContactNumber'], message: 'Enter a valid international emergency contact number.' });
    }
  });
}
