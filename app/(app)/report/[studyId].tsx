import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { LocalPdfViewer } from '@/src/components/pdf/local-pdf-viewer';
import { ErrorList } from '@/src/components/ui/error-list';
import { WebScreenHeader } from '@/src/components/web-screen-header';
import { errorMessages } from '@/src/lib/api-client';
import { deleteReport } from '@/src/lib/report-files';
import { useAuth } from '@/src/providers/auth-provider';
import { useAppTheme } from '@/src/providers/theme-provider';
import { patientPortalService } from '@/src/services/patient-portal';

export default function ReportScreen() {
  const params = useLocalSearchParams<{ studyId?: string }>();
  const studyId = Number(params.studyId);
  const { token } = useAuth();
  const { colors } = useAppTheme();
  const [uri, setUri] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let createdUri: string | null = null;
    (async () => {
      setLoading(true); setErrors([]); setUri(null);
      if (!Number.isInteger(studyId) || studyId <= 0 || !token) {
        setErrors(['The study identifier is invalid.']); setLoading(false); return;
      }
      try {
        const file = await patientPortalService.downloadReport(studyId, token);
        createdUri = file.uri;
        if (active) setUri(file.uri);
        else deleteReport(file.uri);
      } catch (error) {
        if (active) setErrors(errorMessages(error, 'Report not found or failed to load.'));
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; if (createdUri) deleteReport(createdUri); };
  }, [attempt, studyId, token]);

  const shareReport = useCallback(async () => {
    if (!uri) return;
    try {
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Sharing unavailable', 'This device cannot open the save/share chooser.');
        return;
      }
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Save or share patient report' });
    } catch {
      Alert.alert('Could not share report', 'The save/share chooser could not be opened. Please try again.');
    }
  }, [uri]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <WebScreenHeader title="Patient Report" right={uri ? <Pressable accessibilityRole="button" accessibilityLabel="Download or share report" onPress={() => void shareReport()} style={styles.share}><Ionicons name="download-outline" size={22} color={colors.text} /></Pressable> : undefined} />
      {loading ? <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /><Text style={{ color: colors.textMuted }}>Downloading report securely…</Text></View> : errors.length ? <View style={styles.error}><ErrorList messages={errors} /><Pressable accessibilityRole="button" onPress={() => setAttempt((value) => value + 1)}><Text style={[styles.retry, { color: colors.primary }]}>Try again</Text></Pressable></View> : uri ? <LocalPdfViewer uri={uri} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }, error: { flex: 1, justifyContent: 'center', padding: 20, gap: 12 }, retry: { textAlign: 'center', fontWeight: '800', padding: 12 }, share: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' } });
