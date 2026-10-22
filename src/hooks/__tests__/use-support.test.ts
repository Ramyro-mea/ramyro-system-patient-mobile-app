import { flattenSupportMessages } from '@/src/hooks/use-support';
import type { SupportMessage } from '@/src/types/support';

function message(id: number): SupportMessage {
  return {
    id,
    ticketId: 7,
    senderKind: 'Patient',
    senderId: 'patient',
    senderDisplayName: 'Patient',
    body: `Message ${id}`,
    createdAtUtc: '2026-10-21T10:00:00Z',
    attachments: [],
  };
}

describe('support message pagination', () => {
  it('places older pages first and removes realtime/page overlap', () => {
    expect(flattenSupportMessages([
      { items: [message(4), message(5)] },
      { items: [message(2), message(3), message(4)] },
    ]).map((item) => item.id)).toEqual([2, 3, 4, 5]);
  });
});
