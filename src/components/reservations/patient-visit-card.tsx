import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/src/components/ui/app-button';
import { formatCairoDateTime } from '@/src/lib/date-time';
import { formatOrderPrice } from '@/src/lib/reservation-pricing';
import { useAppTheme } from '@/src/providers/theme-provider';
import type { PatientVisit } from '@/src/types/api';

function statusColors(status: string, colors: ReturnType<typeof useAppTheme>['colors']) {
  if (status === 'Cancelled') return { foreground: colors.danger, background: colors.dangerSurface };
  if (
    status === 'StudyCreationCompleted'
    || status === 'StudyCreated'
    || status === 'ScanDone'
    || status === 'Admitted'
  ) {
    return { foreground: colors.success, background: colors.successSurface };
  }
  if (
    status === 'ReadyForAdmission'
    || status === 'StudyCreationPending'
    || status === 'Scheduled'
  ) {
    return { foreground: colors.primary, background: colors.surface };
  }
  return { foreground: colors.warning, background: colors.warningSurface };
}

export function PatientVisitCard({
  visit,
  onShowQrCode,
  onShowPrerequisites,
}: {
  visit: PatientVisit;
  onShowQrCode: () => void;
  onShowPrerequisites?: () => void;
}) {
  const { colors } = useAppTheme();
  const badge = statusColors(visit.status, colors);
  const hasOrder = visit.orderId !== null;
  const title = hasOrder ? (visit.procedure ?? 'Scheduled procedure') : 'Reservation request';
  const isScheduled = visit.status === 'Scheduled';
  const timestamp = isScheduled ? visit.scheduledAtUtc : visit.createdAtUtc;
  const timestampLabel = isScheduled ? 'Scheduled at' : 'Requested at';

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.heading}>
        <View style={[styles.icon, { backgroundColor: colors.surfaceMuted }]}>
          <Ionicons name="calendar-outline" size={23} color={colors.primary} />
        </View>
        <View style={styles.headingText}>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        </View>
      </View>

      <View style={[styles.details, { backgroundColor: colors.surfaceMuted }]}>
        <View style={styles.infoRow}>
          <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Status</Text>
          <View
            style={[
              styles.badge,
              { backgroundColor: badge.background, borderColor: badge.foreground },
            ]}>
            <Text style={[styles.badgeText, { color: badge.foreground }]}>{visit.status}</Text>
          </View>
        </View>

        <View style={styles.infoRow}>
          <Text style={[styles.detailLabel, { color: colors.textMuted }]}>{timestampLabel}</Text>
          <Text style={[styles.detailText, { color: colors.text }]}>
            {formatCairoDateTime(timestamp)}
          </Text>
        </View>

        {hasOrder && visit.roomName ? (
          <View style={styles.infoRow}>
            <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Room</Text>
            <Text style={[styles.detailText, { color: colors.text }]}>{visit.roomName}</Text>
          </View>
        ) : null}

        {visit.totalPrice != null ? (
          <View style={styles.infoRow}>
            <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Price</Text>
            <Text style={[styles.priceText, { color: colors.text }]}>
              {formatOrderPrice(visit.totalPrice, visit.currencySymbol, visit.currencyCode)}
            </Text>
          </View>
        ) : null}
      </View>

      {visit.reasonForReservation ? (
        <View style={styles.reason}>
          <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Reason for reservation</Text>
          <Text style={[styles.reasonText, { color: colors.text }]}>{visit.reasonForReservation}</Text>
        </View>
      ) : null}

      <View style={[styles.actions, { borderTopColor: colors.border }]}>
        <AppButton
          style={styles.actionButton}
          label="Show QR code"
          icon="qr-code-outline"
          variant="outline"
          onPress={onShowQrCode}
        />
        {visit.procedureId !== null && onShowPrerequisites ? (
          <AppButton
            style={styles.actionButton}
            label="Prerequisites"
            icon="list-outline"
            variant="outline"
            onPress={onShowPrerequisites}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, padding: 15, gap: 14 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  icon: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  headingText: { flex: 1, minWidth: 0 },
  title: { fontSize: 16, lineHeight: 21, fontWeight: '800' },
  details: { borderRadius: 13, padding: 12, gap: 10 },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  badge: {
    maxWidth: '72%',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    flexShrink: 1,
  },
  badgeText: { fontSize: 10, lineHeight: 13, fontWeight: '800', textAlign: 'center' },
  detailLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  detailText: { flex: 1, fontSize: 12, lineHeight: 17, textAlign: 'right' },
  priceText: { flex: 1, fontSize: 14, lineHeight: 18, fontWeight: '800', textAlign: 'right' },
  reason: { gap: 5 },
  reasonText: { fontSize: 13, lineHeight: 19 },
  actions: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, flexDirection: 'row', gap: 8 },
  actionButton: { flex: 1, paddingHorizontal: 8 },
});
