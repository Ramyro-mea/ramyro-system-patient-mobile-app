import { env } from '@/src/config/env';
import { buildVisitRegistrationUrl } from '@/src/lib/registration';

describe('visit registration URL', () => {
  const originalUrl = env.risRegistrationUrl;

  afterEach(() => {
    env.risRegistrationUrl = originalUrl;
  });

  it('adds the visit id to the configured registration URL', () => {
    const url = new URL(buildVisitRegistrationUrl(27));

    expect(`${url.origin}${url.pathname}`).toBe(env.risRegistrationUrl);
    expect(url.searchParams.get('visitId')).toBe('27');
  });

  it('replaces an existing visit id without removing other query parameters', () => {
    env.risRegistrationUrl = `${originalUrl}?language=en&visitId=1`;

    const url = new URL(buildVisitRegistrationUrl(42));

    expect(url.searchParams.get('language')).toBe('en');
    expect(url.searchParams.get('visitId')).toBe('42');
  });
});
