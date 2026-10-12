import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/src/providers/theme-provider';
import type { PatientProfile } from '@/src/types/api';

function initials(name: string | null) {
  return (name || '').split(/\s+/).filter(Boolean).map((part) => part[0]).join('').toUpperCase().slice(0, 2) || 'P';
}
function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
function formatGender(value: string | null) {
  return value ? ({ M: 'Male', F: 'Female', O: 'Other', U: 'Unknown' }[value] || value) : null;
}

export function ProfileCard({ profile, loading, error, totalStudies }: { profile?: PatientProfile; loading: boolean; error: boolean; totalStudies: number }) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderLeftColor: colors.primary }]}>
      {loading ? <View accessibilityLabel="Loading profile" style={styles.profileSkeleton}><View style={[styles.skeletonAvatar, { backgroundColor: colors.skeleton }]} /><View style={styles.skeletonLines}><View style={[styles.skeletonLine, { width: '72%', backgroundColor: colors.skeleton }]} /><View style={[styles.skeletonLine, { width: '48%', backgroundColor: colors.skeleton }]} /><View style={[styles.skeletonLine, { width: '88%', backgroundColor: colors.skeleton }]} /></View></View> : error || !profile ? (
        <View style={styles.loading}><Ionicons name="alert-circle-outline" size={24} color={colors.danger} /><Text style={{ color: colors.danger }}>Failed to load profile information.</Text></View>
      ) : <>
        <View style={styles.top}>
          <View style={[styles.avatar, { backgroundColor: colors.primaryDark }]}><Text style={styles.initials}>{initials(profile.fullName)}</Text></View>
          <View style={styles.identity}>
            <Text style={[styles.name, { color: colors.text }]}>{profile.fullName || 'Patient'}</Text>
            <Text numberOfLines={1} style={[styles.contact, { color: colors.textMuted }]}>{profile.email || profile.phoneNumber || 'Contact information not available'}</Text>
            <View style={styles.details}>
              {profile.mrn || profile.patientID ? <Text style={[styles.detail, { color: colors.textMuted }]}>MRN: <Text style={{ color: colors.text, fontWeight: '700' }}>{profile.mrn || profile.patientID}</Text></Text> : null}
              {profile.dateOfBirth ? <Text style={[styles.detail, { color: colors.textMuted }]}>DOB: <Text style={{ color: colors.text, fontWeight: '700' }}>{formatDate(profile.dateOfBirth)}</Text></Text> : null}
              {profile.gender ? <Text style={[styles.detail, { color: colors.textMuted }]}>Gender: <Text style={{ color: colors.text, fontWeight: '700' }}>{formatGender(profile.gender)}</Text></Text> : null}
            </View>
          </View>
        </View>
        <Text style={[styles.welcome, { color: colors.textMuted }]}>Here are your recent imaging encounters and their status.</Text>
        <View style={styles.totalRow}><View style={[styles.dot, { backgroundColor: colors.primary }]} /><Text style={[styles.total, { color: colors.text }]}>{totalStudies}</Text><Text style={{ color: colors.textMuted }}>total studies</Text></View>
      </>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginTop: 18, borderWidth: 1, borderLeftWidth: 4, borderRadius: 18, padding: 17, gap: 14, shadowColor: '#0284c7', shadowOpacity: 0.12, shadowRadius: 14, elevation: 4 },
  profileSkeleton: { minHeight: 90, flexDirection: 'row', alignItems: 'center', gap: 14 }, skeletonAvatar: { width: 62, height: 62, borderRadius: 31 }, skeletonLines: { flex: 1, gap: 10 }, skeletonLine: { height: 12, borderRadius: 6 },
  loading: { minHeight: 90, alignItems: 'center', justifyContent: 'center', gap: 10 }, top: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  avatar: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center' }, initials: { color: 'white', fontSize: 18, fontWeight: '800' },
  identity: { flex: 1, gap: 4 }, name: { fontSize: 19, fontWeight: '800' }, contact: { fontSize: 13 }, details: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 3 }, detail: { fontSize: 12 },
  welcome: { fontSize: 14, lineHeight: 20 }, totalRow: { flexDirection: 'row', alignItems: 'center', gap: 7 }, dot: { width: 8, height: 8, borderRadius: 4 }, total: { fontWeight: '800' },
});
