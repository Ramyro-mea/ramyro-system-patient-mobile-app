import { formatCairoDateTime, formatCairoScheduledDateTime } from '@/src/lib/date-time';

describe('formatCairoDateTime', () => {
  it('treats timestamps without an offset as UTC', () => {
    expect(formatCairoDateTime('2026-07-01T10:00:00'))
      .toBe(formatCairoDateTime('2026-07-01T10:00:00Z'));
  });

  it('uses Cairo daylight-saving rules', () => {
    expect(formatCairoDateTime('2026-07-01T10:00:00Z')).toContain('13:00');
    expect(formatCairoDateTime('2026-01-01T10:00:00Z')).toContain('12:00');
  });

  it('normalizes high-precision timestamps returned by .NET', () => {
    expect(formatCairoDateTime('2026-07-01T10:00:00.1234567Z'))
      .toBe(formatCairoDateTime('2026-07-01T10:00:00.123Z'));
  });

  it('preserves the scheduled wall-clock time selected in RIS', () => {
    expect(formatCairoScheduledDateTime('2026-10-12T09:40:00Z')).toContain('09:40');
  });
});
