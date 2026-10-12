import { createReservationSchema, loginSchema, registrationSchema } from '@/src/lib/validation';

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
  const reservationSchema = createReservationSchema(new Set([
    'firstName', 'lastName', 'phoneNumber', 'dateOfBirth',
  ]));
  const valid = {
    title: '', nationality: '', firstName: 'Ramy', middleName: '', lastName: 'Patient', ssn: '',
    countryCode: '+20', phoneNumber: '1000000000',
    email: 'patient@example.com', dateOfBirth: '1990-01-02', gender: 'Male',
    address: '', emergencyCountryCode: '+20', emergencyContactNumber: '', weightKg: '', heightCm: '',
    procedureId: null,
  };

  it('accepts the configured mandatory demographics', () => {
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

  it('enforces whichever configured demographic fields are required', () => {
    const configuredSchema = createReservationSchema(new Set(['title', 'nationality', 'weightKg']));
    expect(configuredSchema.safeParse(valid).success).toBe(false);
    expect(configuredSchema.safeParse({
      ...valid,
      firstName: '',
      lastName: '',
      phoneNumber: '',
      dateOfBirth: '',
      title: 'Mr',
      nationality: 'EG',
      weightKg: '75',
    }).success).toBe(true);
  });

  it.each([
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
  ] as const)('enforces the configured %s field', (field) => {
    const configuredValues = {
      ...valid,
      title: 'Mr',
      nationality: 'EG',
      middleName: 'Ahmed',
      ssn: '29801011234567',
      address: 'Cairo',
      emergencyContactNumber: '1111111111',
      weightKg: '75',
      heightCm: '180',
    };
    const configuredSchema = createReservationSchema(new Set([field]));

    expect(configuredSchema.safeParse(configuredValues).success).toBe(true);
    expect(configuredSchema.safeParse({ ...configuredValues, [field]: '' }).success).toBe(false);
  });

  it('validates non-empty optional demographic formats', () => {
    const optionalSchema = createReservationSchema(new Set());

    expect(optionalSchema.safeParse({ ...valid, nationality: 'Egypt' }).success).toBe(false);
    expect(optionalSchema.safeParse({ ...valid, gender: 'Other' }).success).toBe(true);
    expect(optionalSchema.safeParse({ ...valid, gender: 'Unknown' }).success).toBe(true);
    expect(optionalSchema.safeParse({ ...valid, gender: 'Invalid' }).success).toBe(false);
    expect(optionalSchema.safeParse({ ...valid, weightKg: '0' }).success).toBe(false);
    expect(optionalSchema.safeParse({ ...valid, heightCm: '-1' }).success).toBe(false);
    expect(optionalSchema.safeParse({
      ...valid,
      emergencyCountryCode: '+20',
      emergencyContactNumber: '12',
    }).success).toBe(false);
  });
});
