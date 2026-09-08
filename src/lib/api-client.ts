import { env } from '@/src/config/env';
import type { ApiResponse } from '@/src/types/api';

type UnauthorizedHandler = () => void | Promise<void>;

let unauthorizedHandler: UnauthorizedHandler | null = null;

export class ApiError extends Error {
  readonly messages: string[];
  readonly status?: number;

  constructor(messages: string[], status?: number) {
    super(messages[0] || 'The request could not be completed.');
    this.name = 'ApiError';
    this.messages = messages;
    this.status = status;
  }
}

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  unauthorizedHandler = handler;
}

export async function notifyUnauthorized() {
  await unauthorizedHandler?.();
}

function uniqueMessages(values: unknown[], fallback: string): string[] {
  const messages = values
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set(messages.length ? messages : [fallback])];
}

export function envelopeErrorMessages(
  envelope: Partial<ApiResponse<unknown>> | null,
  fallback: string,
): string[] {
  return uniqueMessages(
    [...(Array.isArray(envelope?.errors) ? envelope.errors : []), envelope?.message],
    fallback,
  );
}

async function parseEnvelope<T>(response: Response): Promise<ApiResponse<T> | null> {
  try {
    return (await response.json()) as ApiResponse<T>;
  } catch {
    return null;
  }
}

export async function requestApiAt<T>(
  baseUrl: string,
  path: string,
  options: RequestInit = {},
  token?: string,
  fallback = 'The request could not be completed.',
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError([
      'Unable to reach the server. Check your network and server address.',
    ]);
  }

  const envelope = await parseEnvelope<T>(response);

  if (response.status === 401 && token) {
    await notifyUnauthorized();
  }

  if (!response.ok || !envelope?.success || envelope.data === null) {
    throw new ApiError(
      envelopeErrorMessages(envelope, fallback),
      response.status,
    );
  }

  return envelope.data;
}

export function requestApi<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
  fallback?: string,
) {
  return requestApiAt<T>(env.apiUrl, path, options, token, fallback);
}

export function errorMessages(error: unknown, fallback: string): string[] {
  if (error instanceof ApiError) return error.messages;
  if (error instanceof Error && error.message.trim()) return [error.message];
  return [fallback];
}
