import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/src/components/ui/app-button';
import { formatCairoDateTime } from '@/src/lib/date-time';
import { useGuestReceipt } from '@/src/providers/guest-receipt-provider';
import { useAppTheme } from '@/src/providers/theme-provider';

export function GuestReceiptCard() {
  const { receipt, dismissReceipt } = useGuestReceipt();
  const { colors } = useAppTheme();
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
      <AppButton label="Got it" variant="outline" onPress={() => void dismissReceipt()} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 15, gap: 8 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 16, fontWeight: '800' },
  message: { fontSize: 14, lineHeight: 20 },
  date: { fontSize: 12 },
});
