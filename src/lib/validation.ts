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

export const reservationSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required.').max(200, 'First name cannot exceed 200 characters.'),
  lastName: z.string().trim().min(1, 'Last name is required.').max(200, 'Last name cannot exceed 200 characters.'),
  phoneNumber: z.string().trim().min(1, 'Phone number is required.').max(100, 'Phone number cannot exceed 100 characters.').refine(
    (value) => /^[+]?[-\d\s().]+$/.test(value) && (value.match(/\d/g)?.length ?? 0) >= 7,
    'Enter a valid phone number.',
  ),
  email: z.email('Enter a valid email address.').max(256, 'Email cannot exceed 256 characters.'),
  dateOfBirth: z.string().trim().min(1, 'Date of birth is required.').refine((value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && date <= new Date();
  }, 'Use a valid past date in YYYY-MM-DD format.'),
  gender: z.string().trim().min(1, 'Gender is required.').max(50, 'Gender cannot exceed 50 characters.'),
  reasonForReservation: z.string().trim().max(2000, 'Your description cannot exceed 2000 characters.').nullable(),
});

export type ReservationValues = z.infer<typeof reservationSchema>;
