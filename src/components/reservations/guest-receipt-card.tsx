import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ProcedurePrerequisitesModal } from '@/src/components/reservations/procedure-prerequisites';
import { VisitRegistrationQr } from '@/src/components/reservations/visit-registration-qr';
import { AppButton } from '@/src/components/ui/app-button';
import { formatCairoDateTime } from '@/src/lib/date-time';
import { useGuestReceipt } from '@/src/providers/guest-receipt-provider';
import { useAppTheme } from '@/src/providers/theme-provider';

export function GuestReceiptCard() {
  const { receipt } = useGuestReceipt();
  const { colors } = useAppTheme();
  const [showPrerequisites, setShowPrerequisites] = useState(false);
  if (!receipt) return null;

  return (
    <View
      accessibilityRole="summary"
      style={[styles.card, { backgroundColor: colors.successSurface, borderColor: colors.success }]}
    >
      <View style={styles.heading}>
        <Ionicons name="checkmark-circle" size={24} color={colors.success} />
        <Text style={[styles.title, { color: colors.success }]}>Request received</Text>
      </View>
      <Text style={[styles.message, { color: colors.text }]}>
        We will contact you to confirm your reservation.
      </Text>
      <Text style={[styles.date, { color: colors.textMuted }]}>
        Submitted {formatCairoDateTime(receipt.submittedAtUtc)}
      </Text>
      {receipt.procedureDisplayName ? (
        <Text style={[styles.procedure, { color: colors.text }]}>Procedure: {receipt.procedureDisplayName}</Text>
      ) : null}
      <VisitRegistrationQr visitId={receipt.visitId} />
      {receipt.procedureId !== null ? (
        <AppButton
          label="Show prerequisites"
          icon="list-outline"
          variant="outline"
          onPress={() => setShowPrerequisites(true)}
        />
      ) : null}
      {showPrerequisites && receipt.procedureId !== null ? (
        <ProcedurePrerequisitesModal
          procedureId={receipt.procedureId}
          procedureDisplayName={receipt.procedureDisplayName}
          onClose={() => setShowPrerequisites(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 15, gap: 8 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 16, fontWeight: '800' },
  message: { fontSize: 14, lineHeight: 20 },
  date: { fontSize: 12 },
  procedure: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
});
