import { env } from '@/src/config/env';
import type { ApiResponse } from '@/src/types/api';

type UnauthorizedHandler = () => void | Promise<void>;

export type ApiRequestOptions = RequestInit & {
  multipart?: boolean;
};

let unauthorizedHandler: UnauthorizedHandler | null = null;
export const genericNetworkError = 'Something went wrong. Please try again.';

export class ApiError extends Error {
  readonly messages: string[];
  readonly status?: number;
  readonly data?: unknown;

  constructor(messages: string[], status?: number, data?: unknown) {
    super(messages[0] || 'The request could not be completed.');
    this.name = 'ApiError';
    this.messages = messages;
    this.status = status;
    this.data = data;
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
  options: ApiRequestOptions = {},
  token?: string,
  fallback = 'The request could not be completed.',
): Promise<T> {
  let response: Response;
  const { multipart = false, ...fetchOptions } = options;

  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...fetchOptions,
      headers: {
        Accept: 'application/json',
        ...(multipart ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...fetchOptions.headers,
      },
    });
  } catch {
    throw new ApiError([genericNetworkError]);
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
  options: ApiRequestOptions = {},
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
