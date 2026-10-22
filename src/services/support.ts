import { fetch as expoFetch } from 'expo/fetch';
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { env } from '@/src/config/env';
import { ApiError, genericNetworkError, notifyUnauthorized } from '@/src/lib/api-client';
import type { PendingSupportAttachment, SupportAttachment, SupportMessage, SupportMessageList, SupportTicketCreated, SupportTicketList } from '@/src/types/support';

export const supportKeys = {
  all: ['support'] as const,
  tickets: (closed: boolean) => ['support', 'tickets', closed] as const,
  messages: (ticketId: number) => ['support', 'messages', ticketId] as const,
};

type ProblemDetails = {
  title?: unknown;
  detail?: unknown;
  message?: unknown;
  errors?: unknown;
  existingTicketId?: unknown;
};

function rawErrorMessages(data: ProblemDetails | null, fallback: string) {
  const candidates: unknown[] = [];
  if (Array.isArray(data?.errors)) candidates.push(...data.errors);
  else if (data?.errors && typeof data.errors === 'object') {
    for (const value of Object.values(data.errors)) {
      if (Array.isArray(value)) candidates.push(...value);
      else candidates.push(value);
    }
  }
  candidates.push(data?.detail, data?.message, data?.title);
  const messages = candidates
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set(messages.length ? messages : [fallback])];
}

async function parseJson(response: Response) {
  if (response.status === 204) return null;
  try {
    return await response.json() as unknown;
  } catch {
    return null;
  }
}

export async function requestSupport<T>(
  path: string,
  options: RequestInit & { multipart?: boolean } = {},
  token?: string,
  fallback = 'The support request could not be completed.',
): Promise<T> {
  const { multipart = false, ...fetchOptions } = options;
  let response: Response;
  try {
    response = await expoFetch(`${env.chatServerHost}${path}`, {
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

  const data = await parseJson(response);
  if (response.status === 401 && token) await notifyUnauthorized();
  if (!response.ok) {
    throw new ApiError(rawErrorMessages(data as ProblemDetails | null, fallback), response.status, data);
  }
  return data as T;
}

function formDataForAttachment(attachment: PendingSupportAttachment) {
  const form = new FormData();
  if (attachment.webFile) {
    const blob = attachment.webFile.type === attachment.mimeType
      ? attachment.webFile
      : new Blob([attachment.webFile], { type: attachment.mimeType });
    form.append('file', blob, attachment.fileName);
  } else {
    const file = new File(attachment.uri);
    const blob = file.type === attachment.mimeType
      ? file
      : file.slice(0, file.size, attachment.mimeType);
    form.append('file', blob, attachment.fileName);
  }
  return form;
}

function safeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 180) || 'support-attachment';
}

export const supportService = {
  list(token: string, closed = false, skip = 0, take = 100) {
    return requestSupport<SupportTicketList>(
      `/api/chat/support/patient/tickets?closed=${closed}&skip=${skip}&take=${take}`,
      {}, token, 'Support requests could not be loaded.',
    );
  },

  messages(token: string, ticketId: number, beforeId?: number, take = 50) {
    const before = beforeId ? `beforeId=${beforeId}&` : '';
    return requestSupport<SupportMessageList>(
      `/api/chat/support/patient/tickets/${ticketId}/messages?${before}take=${take}`,
      {}, token, 'Support messages could not be loaded.',
    );
  },

  create(token: string, body: string | null, attachmentIds: number[]) {
    return requestSupport<SupportTicketCreated>(
      '/api/chat/support/patient/tickets',
      { method: 'POST', body: JSON.stringify({ body, attachmentIds }) }, token,
      'The support request could not be created.',
    );
  },

  send(token: string, ticketId: number, body: string | null, attachmentIds: number[]) {
    return requestSupport<SupportMessage>(
      `/api/chat/support/patient/tickets/${ticketId}/messages`,
      { method: 'POST', body: JSON.stringify({ body, attachmentIds }) }, token,
      'The message could not be sent.',
    );
  },

  read(token: string, ticketId: number, messageId: number) {
    return requestSupport<void>(
      `/api/chat/support/patient/tickets/${ticketId}/read`,
      { method: 'POST', body: JSON.stringify({ messageId }) }, token,
      'The support request could not be marked as read.',
    );
  },

  upload(token: string, attachment: PendingSupportAttachment) {
    return requestSupport<SupportAttachment>(
      '/api/chat/support/patient/attachments',
      { method: 'POST', body: formDataForAttachment(attachment), multipart: true }, token,
      `${attachment.fileName} could not be uploaded.`,
    );
  },

  async download(token: string, attachment: SupportAttachment) {
    let response: Response;
    try {
      response = await expoFetch(
        `${env.chatServerHost}/api/chat/support/attachments/${attachment.id}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
    } catch {
      throw new ApiError([genericNetworkError]);
    }
    if (response.status === 401) await notifyUnauthorized();
    if (!response.ok) throw new ApiError(['The attachment could not be downloaded.'], response.status);

    if (Platform.OS === 'web') {
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = attachment.originalFileName;
      anchor.click();
      URL.revokeObjectURL(url);
      return null;
    }

    const directory = new Directory(Paths.cache, 'patient-support');
    directory.create({ idempotent: true, intermediates: true });
    const file = new File(directory, `${Date.now()}-${safeFileName(attachment.originalFileName)}`);
    file.write(new Uint8Array(await response.arrayBuffer()));
    return file.uri;
  },

  removeDownload(uri: string) {
    const file = new File(uri);
    if (file.exists) file.delete();
  },
};

export async function uploadPendingSupportAttachments(
  token: string,
  attachments: PendingSupportAttachment[],
  onChange?: (attachments: PendingSupportAttachment[]) => void,
) {
  const uploaded = attachments.map((attachment) => ({ ...attachment }));
  for (let index = 0; index < uploaded.length; index += 1) {
    const current = uploaded[index];
    if (current.remoteId) continue;
    uploaded[index] = { ...current, status: 'uploading', error: null };
    onChange?.([...uploaded]);
    try {
      const result = await supportService.upload(token, uploaded[index]);
      uploaded[index] = { ...uploaded[index], remoteId: result.id, status: 'uploaded', error: null };
      onChange?.([...uploaded]);
    } catch (error) {
      const message = error instanceof Error && error.message
        ? error.message
        : `${current.fileName} could not be uploaded.`;
      uploaded[index] = { ...uploaded[index], status: 'failed', error: message };
      onChange?.([...uploaded]);
      throw error;
    }
  }
  return uploaded;
}
