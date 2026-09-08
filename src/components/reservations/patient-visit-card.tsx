import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { formatCairoDateTime } from '@/src/lib/date-time';
import { useAppTheme } from '@/src/providers/theme-provider';
import type { PatientVisit } from '@/src/types/api';

function statusColors(status: string, colors: ReturnType<typeof useAppTheme>['colors']) {
  if (status === 'Cancelled') return { foreground: colors.danger, background: colors.dangerSurface };
  if (status === 'StudyCreationCompleted' || status === 'Admitted') {
    return { foreground: colors.success, background: colors.successSurface };
  }
  if (status === 'ReadyForAdmission' || status === 'StudyCreationPending') {
    return { foreground: colors.primary, background: colors.surfaceMuted };
  }
  return { foreground: colors.warning, background: colors.warningSurface };
}

export function PatientVisitCard({ visit }: { visit: PatientVisit }) {
  const { colors } = useAppTheme();
  const badge = statusColors(visit.status, colors);

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.heading}>
        <View style={[styles.icon, { backgroundColor: colors.surfaceMuted }]}>
          <Ionicons name="calendar-outline" size={23} color={colors.primary} />
        </View>
        <View style={styles.headingText}>
          {visit.procedure ? (
            <Text numberOfLines={2} style={[styles.title, { color: colors.text }]}>
              {visit.procedure}
            </Text>
          ) : null}
          <Text style={[styles.date, { color: colors.textMuted }]}>
            {formatCairoDateTime(visit.createdAtUtc)}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: badge.background }]}>
          <Text numberOfLines={1} style={[styles.badgeText, { color: badge.foreground }]}>
            {visit.status}
          </Text>
        </View>
      </View>
      {visit.reasonForReservation ? (
        <View style={styles.reason}>
          <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Reason for reservation</Text>
          <Text style={[styles.reasonText, { color: colors.text }]}>{visit.reasonForReservation}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, padding: 15, gap: 14 },
  heading: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  icon: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  headingText: { flex: 1, gap: 4 },
  title: { fontSize: 16, lineHeight: 21, fontWeight: '800' },
  date: { fontSize: 12 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, flexShrink: 0 },
  badgeText: { fontSize: 11, fontWeight: '800' },
  detailLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  reason: { gap: 5 },
  reasonText: { fontSize: 13, lineHeight: 19 },
});
