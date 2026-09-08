import { isTokenUsable } from '@/src/lib/jwt';

function tokenWithPayload(payload: object) {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.`;
}

describe('isTokenUsable', () => {
  const now = Date.UTC(2026, 0, 1);

  it('accepts a token whose expiry is in the future', () => {
    expect(isTokenUsable(tokenWithPayload({ exp: now / 1000 + 60 }), now)).toBe(true);
  });

  it.each([
    ['expired', tokenWithPayload({ exp: now / 1000 - 1 })],
    ['without expiry', tokenWithPayload({ sub: 'patient' })],
    ['malformed', 'not-a-jwt'],
  ])('rejects a %s token', (_description, token) => {
    expect(isTokenUsable(token, now)).toBe(false);
  });
});
