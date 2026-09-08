import * as SecureStore from 'expo-secure-store';
import React, { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type { GuestReservationReceipt } from '@/src/types/api';

const RECEIPT_KEY = 'patient_portal_guest_reservation_receipt';

interface GuestReceiptContextValue {
  receipt: GuestReservationReceipt | null;
  saveReceipt: (receipt: GuestReservationReceipt) => Promise<void>;
  dismissReceipt: () => Promise<void>;
}

const GuestReceiptContext = createContext<GuestReceiptContextValue | null>(null);

export function GuestReceiptProvider({ children }: PropsWithChildren) {
  const [receipt, setReceipt] = useState<GuestReservationReceipt | null>(null);

  useEffect(() => {
    let mounted = true;
    SecureStore.getItemAsync(RECEIPT_KEY)
      .then((stored) => {
        if (!mounted || !stored) return;
        try {
          setReceipt(JSON.parse(stored) as GuestReservationReceipt);
        } catch {
          void SecureStore.deleteItemAsync(RECEIPT_KEY);
        }
      })
      .catch(() => undefined);
    return () => { mounted = false; };
  }, []);

  const saveReceipt = useCallback(async (value: GuestReservationReceipt) => {
    await SecureStore.setItemAsync(RECEIPT_KEY, JSON.stringify(value), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    setReceipt(value);
  }, []);

  const dismissReceipt = useCallback(async () => {
    await SecureStore.deleteItemAsync(RECEIPT_KEY);
    setReceipt(null);
  }, []);

  const context = useMemo(
    () => ({ receipt, saveReceipt, dismissReceipt }),
    [receipt, saveReceipt, dismissReceipt],
  );

  return <GuestReceiptContext.Provider value={context}>{children}</GuestReceiptContext.Provider>;
}

export function useGuestReceipt() {
  const context = useContext(GuestReceiptContext);
  if (!context) throw new Error('useGuestReceipt must be used within GuestReceiptProvider');
  return context;
}
