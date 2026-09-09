import { router } from 'expo-router';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { PatientVisitCard } from '@/src/components/reservations/patient-visit-card';
import { env } from '@/src/config/env';
import { ScreenBackground } from '@/src/components/screen-background';
import { AppButton } from '@/src/components/ui/app-button';
import { ErrorList } from '@/src/components/ui/error-list';
import { WebScreenHeader } from '@/src/components/web-screen-header';
import { usePatientVisits } from '@/src/hooks/use-reservations';
import { useAppTheme } from '@/src/providers/theme-provider';

export default function ReservationsScreen() {
  const { colors } = useAppTheme();
  const visitsQuery = usePatientVisits();
  const errors = visitsQuery.isError
    ? ['We could not load your reservations. Please try again.']
    : [];

  return (
    <ScreenBackground>
      <WebScreenHeader title="My reservations" />
      <FlatList
        data={visitsQuery.data ?? []}
        keyExtractor={(item) => `${item.visitId}-${item.orderId ?? 'request'}`}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        refreshing={visitsQuery.isRefetching}
        onRefresh={() => void visitsQuery.refetch()}
        ListHeaderComponent={(
          <View style={styles.header}>
            <Text style={[styles.description, { color: colors.textMuted }]}>Track the reservation requests associated with your patient account.</Text>
            {env.isReservationEnabled ? (
              <AppButton label="Book a new reservation" icon="add-circle-outline" onPress={() => router.push('/book-reservation')} />
            ) : null}
            {errors.length ? <ErrorList messages={errors} /> : null}
            {errors.length ? <AppButton label="Try again" variant="outline" onPress={() => void visitsQuery.refetch()} /> : null}
          </View>
        )}
        ListEmptyComponent={!visitsQuery.isPending && !visitsQuery.isError ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No reservation requests</Text>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>Your submitted reservation requests will appear here.</Text>
          </View>
        ) : visitsQuery.isPending ? (
          <Text style={[styles.loading, { color: colors.textMuted }]}>Loading reservations…</Text>
        ) : null}
        renderItem={({ item }) => <PatientVisitCard visit={item} />}
        ListFooterComponent={<View style={{ height: 30 }} />}
      />
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  list: { flexGrow: 1, padding: 16 },
  header: { gap: 14, paddingBottom: 18 },
  description: { fontSize: 14, lineHeight: 20 },
  empty: { flex: 1, minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 18, fontWeight: '800' },
  emptyText: { textAlign: 'center', fontSize: 14, lineHeight: 20 },
  loading: { textAlign: 'center', paddingVertical: 50 },
});
