import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/src/providers/theme-provider';
import type { PatientWorklistItem } from '@/src/types/api';
import { isReportAvailable } from '@/src/lib/studies';

function Action({ label, icon, disabled, onPress }: { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; disabled?: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: Boolean(disabled) }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.action, { borderColor: colors.border, opacity: disabled ? 0.35 : pressed ? 0.65 : 1 }]}><Ionicons name={icon} size={17} color={colors.primary} /><Text style={[styles.actionText, { color: colors.text }]}>{label}</Text></Pressable>;
}

export function StudyCard({ study, onReport, onViewer, onShare, sharing }: { study: PatientWorklistItem; onReport: () => void; onViewer: () => void; onShare: () => void; sharing?: boolean }) {
  const { colors } = useAppTheme();
  const reportAvailable = isReportAvailable(study);
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.accent, { backgroundColor: colors.accent }]} />
      <View style={styles.heading}>
        <View style={styles.titleWrap}><Ionicons name="scan-outline" size={22} color={colors.primary} /><Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{study.modality || 'Unknown'} <Text style={{ color: colors.textMuted }}>• {study.bodyPartExamined || 'Unspecified'}</Text></Text></View>
        <View style={[styles.badge, { backgroundColor: reportAvailable ? colors.successSurface : colors.warningSurface }]}><Text style={[styles.badgeText, { color: reportAvailable ? colors.success : colors.warning }]}>{study.reportStatus || 'Unknown'}</Text></View>
      </View>
      {study.studyDescription ? <Text style={[styles.description, { color: colors.text }]} numberOfLines={2}>{study.studyDescription}</Text> : null}
      <View style={styles.metaRow}><Ionicons name="calendar-outline" size={17} color={colors.textMuted} /><Text style={[styles.meta, { color: colors.textMuted }]}>{study.studyDate || 'Date unavailable'}</Text><Ionicons name="time-outline" size={17} color={colors.textMuted} /><Text style={[styles.meta, { color: colors.textMuted }]}>{study.studyTime || 'Time unavailable'}</Text></View>
      <View style={styles.metaRow}><Ionicons name="layers-outline" size={17} color={colors.primary} /><Text style={[styles.meta, { color: colors.textMuted }]}><Text style={{ color: colors.text, fontWeight: '800' }}>{study.seriesCount ?? 0}</Text> series</Text></View>
      <View style={[styles.actions, { borderTopColor: colors.border }]}>
        <Action label="Report" icon="document-text-outline" disabled={!reportAvailable} onPress={onReport} />
        <Action label="Viewer" icon="eye-outline" disabled={!study.studyInstanceUID} onPress={onViewer} />
        <Action label={sharing ? 'Creating…' : 'Share'} icon="share-social-outline" disabled={!reportAvailable || !study.studyInstanceUID || sharing} onPress={onShare} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, borderWidth: 1, borderRadius: 18, padding: 16, gap: 9, overflow: 'hidden', shadowColor: '#020617', shadowOpacity: 0.12, shadowRadius: 9, elevation: 3 },
  accent: { position: 'absolute', left: 0, right: 0, top: 0, height: 2 }, heading: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, justifyContent: 'space-between' },
  titleWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }, title: { flex: 1, fontSize: 16, fontWeight: '800' },
  badge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 }, badgeText: { fontSize: 11, fontWeight: '800' }, description: { fontSize: 14, fontWeight: '700' },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 }, meta: { fontSize: 13, marginRight: 5 },
  actions: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, marginTop: 3, flexDirection: 'row', gap: 7 },
  action: { flex: 1, minHeight: 40, borderWidth: 1, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 }, actionText: { fontSize: 12, fontWeight: '700' },
});
