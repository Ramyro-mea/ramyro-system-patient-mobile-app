import {
  filterPatientVisitsByPayment,
  formatOrderPrice,
} from '@/src/lib/reservation-pricing';
import type { PatientVisit } from '@/src/types/api';

const baseVisit: PatientVisit = {
  visitId: 27,
  visitNumber: 'RV27',
  orderId: 91,
  procedureId: 8,
  procedure: 'MRI Brain',
  bookingSource: 'PatientPortal',
  status: 'Scheduled',
  createdAtUtc: '2026-09-03T10:00:00Z',
  scheduledAtUtc: '2026-09-03T10:00:00Z',
  roomName: null,
  reasonForReservation: null,
  totalPrice: 125,
  depositedAmount: 0,
  currencyCode: 'EGP',
  currencySymbol: '$',
  isPaid: true,
  paymentStatus: 'Paid',
};

describe('reservation pricing', () => {
  it('keeps all rows by default and filters only classified order rows', () => {
    const visits = [
      baseVisit,
      { ...baseVisit, visitId: 28, isPaid: null, paymentStatus: 'PartiallyPaid' as const, depositedAmount: 25 },
      { ...baseVisit, visitId: 29, isPaid: false, paymentStatus: 'Unpaid' as const, depositedAmount: 0 },
      { ...baseVisit, visitId: 30, orderId: null, isPaid: null, paymentStatus: null, totalPrice: null, depositedAmount: null },
    ];

    expect(filterPatientVisitsByPayment(visits, '')).toHaveLength(4);
    expect(filterPatientVisitsByPayment(visits, 'paid').map((visit) => visit.visitId)).toEqual([27]);
    expect(filterPatientVisitsByPayment(visits, 'partially-paid').map((visit) => visit.visitId)).toEqual([28]);
    expect(filterPatientVisitsByPayment(visits, 'unpaid').map((visit) => visit.visitId)).toEqual([29]);
  });

  it('uses the currency symbol and falls back to the currency code', () => {
    expect(formatOrderPrice(125, '$', 'EGP')).toBe('$ 125.00');
    expect(formatOrderPrice(125, null, 'EGP')).toBe('EGP 125.00');
    expect(formatOrderPrice(0, null, 'EGP')).toBe('EGP 0.00');
  });
});
