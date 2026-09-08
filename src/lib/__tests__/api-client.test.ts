import {
  envelopeErrorMessages,
  requestApi,
} from '@/src/lib/api-client';

describe('API envelope handling', () => {
  afterEach(() => jest.restoreAllMocks());

  it('preserves all distinct backend validation errors and the message', () => {
    expect(
      envelopeErrorMessages(
        {
          success: false,
          errors: ['Invalid code.', 'Username already exists.', 'Invalid code.'],
          message: 'Registration failed.',
        },
        'Fallback',
      ),
    ).toEqual(['Invalid code.', 'Username already exists.', 'Registration failed.']);
  });

  it('rejects a successful HTTP response with success false', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: false, data: null, errors: ['Code expired.'], message: '' }),
    } as Response);

    await expect(requestApi('/registration')).rejects.toMatchObject({
      messages: ['Code expired.'],
      status: 200,
    });
  });

  it('turns network failures into a safe user-facing error', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('socket details'));
    await expect(requestApi('/profile')).rejects.toMatchObject({
      messages: [expect.stringContaining('Unable to reach')],
    });
  });
});
