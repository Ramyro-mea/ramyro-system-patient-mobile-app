import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/src/components/ui/app-button';
import { useProcedurePrerequisites } from '@/src/hooks/use-reservations';
import { useAppTheme } from '@/src/providers/theme-provider';
import type { RisPrerequisite } from '@/src/types/api';

const prerequisiteTypeLabels: Record<number, string> = {
  0: 'Gender',
  1: 'Clinical',
  2: 'Managerial',
  3: 'Document',
};

function prerequisiteTypeLabel(type: number | string) {
  if (typeof type === 'number') return prerequisiteTypeLabels[type] ?? 'Prerequisite';
  return type || 'Prerequisite';
}

export function ProcedurePrerequisiteList({ items }: { items: RisPrerequisite[] }) {
  const { colors } = useAppTheme();

  if (!items.length) {
    return <Text style={[styles.empty, { color: colors.textMuted }]}>No prerequisites listed.</Text>;
  }

  return (
    <View style={styles.list}>
      {items.map((item) => (
        <View
          key={item.id}
          style={[styles.item, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}
        >
          <View style={styles.itemHeading}>
            <Text style={[styles.itemName, { color: colors.text }]}>{item.name}</Text>
            <Text style={[styles.requirement, { color: item.isRequired ? colors.warning : colors.textMuted }]}>
              {item.isRequired ? 'Required' : 'Optional'}
            </Text>
          </View>
          <Text style={[styles.meta, { color: colors.textMuted }]}>
            {[prerequisiteTypeLabel(item.type), item.subTypeName].filter(Boolean).join(' · ')}
          </Text>
          {item.requiredGender ? (
            <Text style={[styles.meta, { color: colors.textMuted }]}>Applies to: {item.requiredGender}</Text>
          ) : null}
          {item.description ? (
            <Text style={[styles.description, { color: colors.text }]}>{item.description}</Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

interface ModalProps {
  procedureId: number;
  procedureDisplayName: string | null;
  onClose: () => void;
}

export function ProcedurePrerequisitesModal({
  procedureId,
  procedureDisplayName,
  onClose,
}: ModalProps) {
  const { colors } = useAppTheme();
  const prerequisitesQuery = useProcedurePrerequisites(procedureId);

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <View
          accessibilityViewIsModal
          style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Text style={[styles.title, { color: colors.text }]}>Procedure prerequisites</Text>
          {procedureDisplayName ? (
            <Text style={[styles.procedureName, { color: colors.textMuted }]}>{procedureDisplayName}</Text>
          ) : null}
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
            {prerequisitesQuery.isPending ? (
              <Text style={[styles.loading, { color: colors.textMuted }]}>Loading prerequisites...</Text>
            ) : prerequisitesQuery.isError ? (
              <View style={styles.errorState}>
                <Text style={[styles.error, { color: colors.danger }]}>Prerequisites could not be loaded.</Text>
                <AppButton label="Try again" variant="outline" onPress={() => void prerequisitesQuery.refetch()} />
              </View>
            ) : (
              <ProcedurePrerequisiteList items={prerequisitesQuery.data ?? []} />
            )}
          </ScrollView>
          <AppButton label="Close" variant="ghost" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  list: { gap: 9 },
  item: { borderWidth: 1, borderRadius: 12, padding: 11, gap: 5 },
  itemHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  itemName: { flex: 1, fontSize: 14, lineHeight: 19, fontWeight: '700' },
  requirement: { fontSize: 11, lineHeight: 16, fontWeight: '800' },
  meta: { fontSize: 11, lineHeight: 16 },
  description: { fontSize: 13, lineHeight: 18 },
  empty: { fontSize: 13, lineHeight: 19 },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 520, maxHeight: '88%', borderWidth: 1, borderRadius: 20, padding: 20, gap: 14 },
  title: { fontSize: 20, fontWeight: '800' },
  procedureName: { fontSize: 13, lineHeight: 18, marginTop: -8 },
  modalScroll: { flexShrink: 1 },
  modalContent: { flexGrow: 1 },
  loading: { fontSize: 14, paddingVertical: 16, textAlign: 'center' },
  errorState: { gap: 10 },
  error: { fontSize: 13, lineHeight: 18 },
});
