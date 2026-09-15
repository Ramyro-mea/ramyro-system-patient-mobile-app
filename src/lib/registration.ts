import { env } from '@/src/config/env';

export function buildVisitRegistrationUrl(visitId: number) {
  const url = new URL(env.risRegistrationUrl);
  url.searchParams.set('visitId', String(visitId));
  return url.toString();
}
