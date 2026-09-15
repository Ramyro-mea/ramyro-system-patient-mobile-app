import * as SecureStore from 'expo-secure-store';
import React, { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/src/providers/auth-provider';
import type { GuestReservationReceipt } from '@/src/types/api';

const RECEIPT_KEY = 'patient_portal_guest_reservation_receipt';

interface GuestReceiptContextValue {
  receipt: GuestReservationReceipt | null;
  saveReceipt: (receipt: GuestReservationReceipt) => Promise<void>;
}

const GuestReceiptContext = createContext<GuestReceiptContextValue | null>(null);

function parseReceipt(value: string): GuestReservationReceipt | null {
  try {
    const parsed = JSON.parse(value) as Partial<GuestReservationReceipt>;
    if (
      Number.isInteger(parsed.visitId)
      && Number(parsed.visitId) > 0
      && typeof parsed.submittedAtUtc === 'string'
      && parsed.submittedAtUtc.length > 0
    ) {
      return {
        visitId: Number(parsed.visitId),
        orderId: Number.isInteger(parsed.orderId) && Number(parsed.orderId) > 0
          ? Number(parsed.orderId)
          : null,
        submittedAtUtc: parsed.submittedAtUtc,
        procedureId: Number.isInteger(parsed.procedureId) && Number(parsed.procedureId) > 0
          ? Number(parsed.procedureId)
          : null,
        procedureDisplayName: typeof parsed.procedureDisplayName === 'string'
          && parsed.procedureDisplayName.trim().length > 0
          ? parsed.procedureDisplayName.trim()
          : null,
      };
    }
  } catch {
    // Invalid and legacy receipts are removed below.
  }
  return null;
}

export function GuestReceiptProvider({ children }: PropsWithChildren) {
  const { status } = useAuth();
  const [receipt, setReceipt] = useState<GuestReservationReceipt | null>(null);

  useEffect(() => {
    if (status === 'loading') return undefined;

    let mounted = true;
    if (status === 'authenticated') {
      void SecureStore.deleteItemAsync(RECEIPT_KEY)
        .catch(() => undefined)
        .finally(() => {
          if (mounted) setReceipt(null);
        });
      return () => { mounted = false; };
    }

    SecureStore.getItemAsync(RECEIPT_KEY)
      .then((stored) => {
        if (!mounted || !stored) return;
        const parsed = parseReceipt(stored);
        if (parsed) {
          setReceipt(parsed);
        } else {
          void SecureStore.deleteItemAsync(RECEIPT_KEY);
        }
      })
      .catch(() => undefined);
    return () => { mounted = false; };
  }, [status]);

  const saveReceipt = useCallback(async (value: GuestReservationReceipt) => {
    await SecureStore.setItemAsync(RECEIPT_KEY, JSON.stringify(value), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    setReceipt(value);
  }, []);

  const context = useMemo(
    () => ({ receipt, saveReceipt }),
    [receipt, saveReceipt],
  );

  return <GuestReceiptContext.Provider value={context}>{children}</GuestReceiptContext.Provider>;
}

export function useGuestReceipt() {
  const context = useContext(GuestReceiptContext);
  if (!context) throw new Error('useGuestReceipt must be used within GuestReceiptProvider');
  return context;
}
