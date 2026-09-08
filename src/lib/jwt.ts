import { jwtDecode } from 'jwt-decode';

interface TokenClaims {
  exp?: number;
}

export function isTokenUsable(token: string, now = Date.now()): boolean {
  try {
    const { exp } = jwtDecode<TokenClaims>(token);
    return typeof exp === 'number' && exp * 1000 > now;
  } catch {
    return false;
  }
}

