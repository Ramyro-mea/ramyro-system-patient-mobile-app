export function formatCairoDateTime(value: string): string {
  const trimmedValue = value.trim();
  const millisecondPrecisionValue = trimmedValue.replace(
    /(\.\d{3})\d+(?=Z|[+-]\d{2}:?\d{2}$|$)/i,
    '$1',
  );
  const utcValue = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(millisecondPrecisionValue)
    ? millisecondPrecisionValue
    : `${millisecondPrecisionValue}Z`;
  const date = new Date(utcValue);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Cairo',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function formatCairoScheduledDateTime(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value.trim());
  if (!match) return value;

  const wallClockDate = new Date(Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
  ));

  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(wallClockDate);
}

export function parseDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateOnly(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
