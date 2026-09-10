import { formatCairoDateTime } from '@/src/lib/date-time';

describe('formatCairoDateTime', () => {
  it('treats timestamps without an offset as UTC', () => {
    expect(formatCairoDateTime('2026-07-01T10:00:00'))
      .toBe(formatCairoDateTime('2026-07-01T10:00:00Z'));
  });

  it('uses Cairo daylight-saving rules', () => {
    expect(formatCairoDateTime('2026-07-01T10:00:00Z')).toContain('13:00');
    expect(formatCairoDateTime('2026-01-01T10:00:00Z')).toContain('12:00');
  });
});
