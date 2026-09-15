import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { PatientVisitCard } from '@/src/components/reservations/patient-visit-card';
import { PaymentFilterMenu } from '@/src/components/reservations/payment-filter-menu';
import { ProcedurePrerequisitesModal } from '@/src/components/reservations/procedure-prerequisites';
import { VisitRegistrationQrModal } from '@/src/components/reservations/visit-registration-qr';
import { env } from '@/src/config/env';
import { ScreenBackground } from '@/src/components/screen-background';
import { AppButton } from '@/src/components/ui/app-button';
import { ErrorList } from '@/src/components/ui/error-list';
import { WebScreenHeader } from '@/src/components/web-screen-header';
import { usePatientVisits } from '@/src/hooks/use-reservations';
import {
  filterPatientVisitsByPayment,
  type ReservationPaymentFilter,
} from '@/src/lib/reservation-pricing';
import { useAppTheme } from '@/src/providers/theme-provider';

export default function ReservationsScreen() {
  const { colors } = useAppTheme();
  const [selectedVisitId, setSelectedVisitId] = useState<number | null>(null);
  const [selectedProcedure, setSelectedProcedure] = useState<{ id: number; name: string | null } | null>(null);
  const [paymentFilter, setPaymentFilter] = useState<ReservationPaymentFilter>('');
  const visitsQuery = usePatientVisits();
  const visits = useMemo(
    () => filterPatientVisitsByPayment(visitsQuery.data ?? [], paymentFilter),
    [paymentFilter, visitsQuery.data],
  );
  const errors = visitsQuery.isError
    ? ['We could not load your reservations. Please try again.']
    : [];

  return (
    <ScreenBackground>
      <WebScreenHeader title="My reservations" />
      <FlatList
        data={visits}
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
            {!visitsQuery.isPending && !visitsQuery.isError && (visitsQuery.data?.length ?? 0) > 0 ? (
              <View style={styles.filterBar}>
                <Text style={[styles.filterLabel, { color: colors.textMuted }]}>Payment status</Text>
                <PaymentFilterMenu value={paymentFilter} onChange={setPaymentFilter} />
              </View>
            ) : null}
          </View>
        )}
        ListEmptyComponent={!visitsQuery.isPending && !visitsQuery.isError ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {paymentFilter ? `No ${paymentFilter} reservations` : 'No reservation requests'}
            </Text>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              {paymentFilter
                ? `You do not have any ${paymentFilter} reservations.`
                : 'Your submitted reservation requests will appear here.'}
            </Text>
          </View>
        ) : visitsQuery.isPending ? (
          <Text style={[styles.loading, { color: colors.textMuted }]}>Loading reservations…</Text>
        ) : null}
        renderItem={({ item }) => (
          <PatientVisitCard
            visit={item}
            onShowQrCode={() => setSelectedVisitId(item.visitId)}
            onShowPrerequisites={item.procedureId !== null
              ? () => setSelectedProcedure({ id: item.procedureId!, name: item.procedure })
              : undefined}
          />
        )}
        ListFooterComponent={<View style={{ height: 30 }} />}
      />
      <VisitRegistrationQrModal
        visitId={selectedVisitId}
        onClose={() => setSelectedVisitId(null)}
      />
      {selectedProcedure ? (
        <ProcedurePrerequisitesModal
          procedureId={selectedProcedure.id}
          procedureDisplayName={selectedProcedure.name}
          onClose={() => setSelectedProcedure(null)}
        />
      ) : null}
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  list: { flexGrow: 1, padding: 16 },
  header: { gap: 14, paddingBottom: 18 },
  description: { fontSize: 14, lineHeight: 20 },
  filterBar: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  filterLabel: { fontSize: 12, lineHeight: 16, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  empty: { flex: 1, minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 18, fontWeight: '800' },
  emptyText: { textAlign: 'center', fontSize: 14, lineHeight: 20 },
  loading: { textAlign: 'center', paddingVertical: 50 },
});
