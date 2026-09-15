import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '@/src/components/app-header';
import { FilterChips } from '@/src/components/portal/filter-chips';
import { ProfileCard } from '@/src/components/portal/profile-card';
import { ShareLinkModal } from '@/src/components/portal/share-link-modal';
import { StudyCard } from '@/src/components/portal/study-card';
import { StudySkeleton } from '@/src/components/portal/study-skeleton';
import { ScreenBackground } from '@/src/components/screen-background';
import { ErrorList } from '@/src/components/ui/error-list';
import { AppButton } from '@/src/components/ui/app-button';
import { env } from '@/src/config/env';
import { usePatientProfile, usePatientWorklist } from '@/src/hooks/use-patient-data';
import { errorMessages } from '@/src/lib/api-client';
import { buildSharedStudyUrl, countBy, filterStudies } from '@/src/lib/studies';
import { useAuth } from '@/src/providers/auth-provider';
import { useAppTheme } from '@/src/providers/theme-provider';
import { patientPortalService } from '@/src/services/patient-portal';

export default function PatientPortalScreen() {
  const { token } = useAuth();
  const { colors } = useAppTheme();
  const profileQuery = usePatientProfile();
  const worklistQuery = usePatientWorklist();
  const [modality, setModality] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const studies = useMemo(() => worklistQuery.data ?? [], [worklistQuery.data]);
  const modalities = useMemo(() => countBy(studies, (study) => study.modality), [studies]);
  const filtered = useMemo(() => filterStudies(studies, { modality, status: null }), [studies, modality]);

  const shareMutation = useMutation({
    mutationFn: (studyInstanceUID: string) => patientPortalService.createShareLink(studyInstanceUID, token!),
    onSuccess: (result) => {
      setShareUrl(buildSharedStudyUrl(result.sharedStudyCode));
    },
  });

  const refresh = async () => { await Promise.all([profileQuery.refetch(), worklistQuery.refetch()]); };
  const refreshing = profileQuery.isRefetching || worklistQuery.isRefetching;
  const worklistErrors = worklistQuery.isError ? errorMessages(worklistQuery.error, 'Failed to load your studies.') : [];
  const shareErrors = shareMutation.isError ? errorMessages(shareMutation.error, 'Failed to create the study link.') : [];

  return (
    <ScreenBackground>
      <AppHeader />
      <FlatList
        data={filtered}
        keyExtractor={(item) => `${item.studyID}-${item.studyInstanceUID || 'study'}`}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: 13 }} />}
        refreshing={refreshing}
        onRefresh={() => void refresh()}
        ListHeaderComponent={<View>
          <ProfileCard profile={profileQuery.data} loading={profileQuery.isPending} error={profileQuery.isError} totalStudies={studies.length} />
          {env.isReservationEnabled ? (
            <View style={styles.portalActions}>
              <AppButton label="Book a reservation" icon="calendar-outline" onPress={() => router.push('/book-reservation')} style={styles.portalAction} />
              <AppButton label="My reservations" icon="list-outline" variant="outline" onPress={() => router.push('/(app)/reservations')} style={styles.portalAction} />
            </View>
          ) : null}
          <FilterChips
            modalities={modalities}
            activeModality={modality}
            onModality={(value) => setModality((current) => current === value ? null : value)}
          />
          <View style={styles.sectionHeading}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent encounters</Text>
            <Text style={[styles.sectionDescription, { color: colors.textMuted }]}>Tap report or viewer for more details.</Text>
          </View>
          {worklistErrors.length ? <View style={styles.message}><ErrorList messages={worklistErrors} /><Pressable accessibilityRole="button" onPress={() => void worklistQuery.refetch()}><Text style={[styles.retry, { color: colors.primary }]}>Try again</Text></Pressable></View> : null}
          {shareErrors.length ? <View style={styles.message}><ErrorList messages={shareErrors} /></View> : null}
        </View>}
        renderItem={({ item }) => <StudyCard study={item}
          onReport={() => router.push({ pathname: '/(app)/report/[studyId]', params: { studyId: String(item.studyID) } })}
          onViewer={() => item.studyInstanceUID && router.push({ pathname: '/(app)/viewer', params: { studyInstanceUID: item.studyInstanceUID } })}
          onShare={() => item.studyInstanceUID && shareMutation.mutate(item.studyInstanceUID)}
          sharing={shareMutation.isPending && shareMutation.variables === item.studyInstanceUID} />}
        ListEmptyComponent={worklistQuery.isPending ? <View style={styles.skeletons}><StudySkeleton /><StudySkeleton /><StudySkeleton /></View> : !worklistQuery.isError ? <View style={styles.empty}><Text style={[styles.emptyTitle, { color: colors.text }]}>No studies found</Text><Text style={{ color: colors.textMuted }}>{modality ? 'Clear a filter to see other encounters.' : 'There are no recent imaging encounters to display.'}</Text></View> : null}
        ListFooterComponent={<View style={{ height: 28 }} />}
      />
      <ShareLinkModal url={shareUrl} onClose={() => setShareUrl(null)} />
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  list: { flexGrow: 1 }, sectionHeading: { paddingHorizontal: 16, paddingTop: 22, paddingBottom: 13, gap: 4 },
  portalActions: { paddingHorizontal: 16, paddingTop: 16, flexDirection: 'row', gap: 10 }, portalAction: { flex: 1 },
  sectionTitle: { fontSize: 19, fontWeight: '800' }, sectionDescription: { fontSize: 13 },
  message: { paddingHorizontal: 16, paddingBottom: 12, gap: 8 }, retry: { textAlign: 'center', fontWeight: '800', padding: 8 },
  empty: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 26 }, emptyTitle: { fontSize: 18, fontWeight: '800' }, skeletons: { gap: 13 },
});
