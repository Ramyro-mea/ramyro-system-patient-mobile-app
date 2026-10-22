import { env } from '@/src/config/env';
import { setUnauthorizedHandler } from '@/src/lib/api-client';
import { requestSupport, supportService, uploadPendingSupportAttachments } from '@/src/services/support';

const mockExpoFetch = jest.fn();
const mockWrite = jest.fn();
const mockCreateDirectory = jest.fn();

jest.mock('expo/fetch', () => ({
  fetch: (...args: unknown[]) => mockExpoFetch(...args),
}));
jest.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache' },
  Directory: class {
    create = mockCreateDirectory;
  },
  File: class {
    uri = 'file:///cache/downloaded-file.pdf';
    type = 'application/pdf';
    size = 4;
    exists = true;
    write = mockWrite;
    slice = jest.fn(() => new Blob(['file'], { type: 'application/pdf' }));
    delete = jest.fn();
  },
}));

function response(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn(async () => data),
    blob: jest.fn(async () => new Blob(['file'])),
    arrayBuffer: jest.fn(async () => new Uint8Array([1, 2, 3]).buffer),
  } as unknown as Response;
}

describe('patient support service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setUnauthorizedHandler(null);
  });

  afterAll(() => setUnauthorizedHandler(null));

  it('uses exact paginated ticket and message URLs with bearer authorization', async () => {
    mockExpoFetch
      .mockResolvedValueOnce(response({ items: [], total: 0, unreadTotal: 0 }))
      .mockResolvedValueOnce(response({ items: [] }));

    await supportService.list('token', true, 20, 10);
    await supportService.messages('token', 17, 81, 50);

    expect(mockExpoFetch.mock.calls[0][0]).toBe(
      `${env.chatServerHost}/api/chat/support/patient/tickets?closed=true&skip=20&take=10`,
    );
    expect(mockExpoFetch.mock.calls[1][0]).toBe(
      `${env.chatServerHost}/api/chat/support/patient/tickets/17/messages?beforeId=81&take=50`,
    );
    expect(mockExpoFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer token');
  });

  it('sends raw JSON and accepts a 204 response without an envelope', async () => {
    const noContent = response(null, 204);
    mockExpoFetch.mockResolvedValue(noContent);

    await expect(supportService.read('token', 17, 99)).resolves.toBeNull();
    expect(noContent.json).not.toHaveBeenCalled();
    expect(JSON.parse(mockExpoFetch.mock.calls[0][1].body)).toEqual({ messageId: 99 });
  });

  it('preserves problem details and the existing ticket ID from conflicts', async () => {
    mockExpoFetch.mockResolvedValue(response({
      title: 'You already have an active support ticket.',
      status: 409,
      existingTicketId: 73,
    }, 409));

    await expect(supportService.create('token', 'Help', [])).rejects.toMatchObject({
      status: 409,
      messages: ['You already have an active support ticket.'],
      data: { existingTicketId: 73 },
    });
  });

  it('runs the shared unauthorized-session handler for raw REST requests', async () => {
    const unauthorized = jest.fn();
    setUnauthorizedHandler(unauthorized);
    mockExpoFetch.mockResolvedValue(response({ title: 'Unauthorized' }, 401));

    await expect(requestSupport('/private', {}, 'bad-token')).rejects.toMatchObject({ status: 401 });
    expect(unauthorized).toHaveBeenCalledTimes(1);
  });

  it('uploads multipart files sequentially through individual upload calls', async () => {
    mockExpoFetch.mockResolvedValue(response({ id: 5, originalFileName: 'scan.jpg' }));
    await supportService.upload('token', {
      id: 'camera-1',
      uri: 'file:///scan.jpg',
      fileName: 'scan.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 12,
      source: 'camera',
      status: 'pending',
      error: null,
      webFile: new Blob(['image'], { type: 'image/jpeg' }),
    });

    const [url, init] = mockExpoFetch.mock.calls[0];
    expect(url).toBe(`${env.chatServerHost}/api/chat/support/patient/attachments`);
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.headers['Content-Type']).toBeUndefined();
    expect(init.headers.Authorization).toBe('Bearer token');
  });

  it('retains successful upload IDs and retries only failed attachments', async () => {
    const attachments = [
      {
        id: 'already-uploaded', uri: 'file:///one.pdf', fileName: 'one.pdf',
        mimeType: 'application/pdf', sizeBytes: 4, source: 'file' as const,
        status: 'uploaded' as const, error: null, remoteId: 11,
        webFile: new Blob(['one'], { type: 'application/pdf' }),
      },
      {
        id: 'pending', uri: 'file:///two.pdf', fileName: 'two.pdf',
        mimeType: 'application/pdf', sizeBytes: 4, source: 'file' as const,
        status: 'failed' as const, error: 'Previous failure',
        webFile: new Blob(['two'], { type: 'application/pdf' }),
      },
    ];
    const changes = jest.fn();
    mockExpoFetch.mockResolvedValue(response({ id: 12, originalFileName: 'two.pdf' }));

    const result = await uploadPendingSupportAttachments('token', attachments, changes);

    expect(mockExpoFetch).toHaveBeenCalledTimes(1);
    expect(result.map((item) => item.remoteId)).toEqual([11, 12]);
    expect(changes).toHaveBeenLastCalledWith(expect.arrayContaining([
      expect.objectContaining({ id: 'already-uploaded', remoteId: 11 }),
      expect.objectContaining({ id: 'pending', remoteId: 12, status: 'uploaded' }),
    ]));
  });

  it('downloads attachments from the authenticated endpoint into cache', async () => {
    mockExpoFetch.mockResolvedValue(response(null));
    await expect(supportService.download('token', {
      id: 9,
      originalFileName: 'result.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 3,
      url: '/api/chat/support/attachments/9',
    })).resolves.toBe('file:///cache/downloaded-file.pdf');

    expect(mockExpoFetch.mock.calls[0][0]).toBe(`${env.chatServerHost}/api/chat/support/attachments/9`);
    expect(mockExpoFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer token');
    expect(mockCreateDirectory).toHaveBeenCalledWith({ idempotent: true, intermediates: true });
    expect(mockWrite).toHaveBeenCalledWith(expect.any(Uint8Array));
  });
});
