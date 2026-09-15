import { loginSchema, registrationSchema, reservationSchema } from '@/src/lib/validation';

describe('authentication validation', () => {
  it('requires both login fields and enforces the 256-character limit', () => {
    expect(loginSchema.safeParse({ username: '', password: '' }).success).toBe(false);
    expect(loginSchema.safeParse({ username: 'x'.repeat(257), password: 'ok' }).success).toBe(false);
  });

  it('validates password confirmation while preserving patient-code case', () => {
    const values = { patientCode: 'AbC-Case-Sensitive', username: 'patient', password: 'secret', confirmPassword: 'secret' };
    const result = registrationSchema.safeParse(values);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.patientCode).toBe(values.patientCode);
    expect(registrationSchema.safeParse({ ...values, confirmPassword: 'different' }).success).toBe(false);
  });
});

describe('reservation validation', () => {
  const valid = {
    firstName: 'Ramy', lastName: 'Patient', countryCode: '+20', phoneNumber: '1000000000',
    email: 'patient@example.com', dateOfBirth: '1990-01-02', gender: 'Male',
    reasonForReservation: null, procedureId: null,
  };

  it('accepts mandatory demographics with an optional reason', () => {
    expect(reservationSchema.safeParse(valid).success).toBe(true);
    expect(reservationSchema.safeParse({ ...valid, countryCode: '+1268' }).success).toBe(true);
  });

  it('rejects invalid email and dates', () => {
    expect(reservationSchema.safeParse({ ...valid, email: 'invalid' }).success).toBe(false);
    expect(reservationSchema.safeParse({ ...valid, phoneNumber: 'call me' }).success).toBe(false);
    expect(reservationSchema.safeParse({ ...valid, dateOfBirth: '2024-02-31' }).success).toBe(false);
    expect(reservationSchema.safeParse({ ...valid, dateOfBirth: '2999-01-01' }).success).toBe(false);
  });

  it('accepts empty optional demographics and an optional procedure', () => {
    expect(reservationSchema.safeParse({
      ...valid,
      email: '',
      gender: '',
      procedureId: 8,
    }).success).toBe(true);
    expect(reservationSchema.safeParse({ ...valid, procedureId: 0 }).success).toBe(false);
  });
});
