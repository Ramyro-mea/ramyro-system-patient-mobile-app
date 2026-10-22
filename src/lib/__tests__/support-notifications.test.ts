import { supportTicketIdFromNotificationData } from '@/src/lib/support-notifications';

describe('patient support notification routing', () => {
  it('accepts positive numeric ticket IDs for the patient-support category', () => {
    expect(supportTicketIdFromNotificationData({ category: 'patient-support', ticketId: 42 })).toBe(42);
    expect(supportTicketIdFromNotificationData({ category: 'patient-support', ticketId: '43' })).toBe(43);
  });

  it.each([
    null,
    {},
    { category: 'visit-admission', ticketId: 42 },
    { category: 'patient-support', ticketId: 0 },
    { category: 'patient-support', ticketId: 'not-a-number' },
  ])('rejects unrelated or invalid payloads', (payload) => {
    expect(supportTicketIdFromNotificationData(payload)).toBeNull();
  });
});
