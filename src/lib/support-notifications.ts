export function supportTicketIdFromNotificationData(data: unknown) {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  if (record.category !== 'patient-support') return null;
  const value = typeof record.ticketId === 'string'
    ? Number(record.ticketId)
    : record.ticketId;
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}
