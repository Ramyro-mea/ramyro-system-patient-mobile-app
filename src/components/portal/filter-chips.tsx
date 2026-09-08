import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/src/providers/theme-provider';

function Chip({ label, count, active, onPress }: { label: string; count: number; active: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }} style={[styles.chip, { backgroundColor: active ? colors.primaryDark : colors.surfaceMuted, borderColor: active ? colors.primary : colors.border }]}>
      <Text style={[styles.chipText, { color: active ? colors.white : colors.text }]}>{label} · {count}</Text>
    </Pressable>
  );
}

export function FilterChips({ modalities, statuses, activeModality, activeStatus, onModality, onStatus }: {
  modalities: Record<string, number>; statuses: Record<string, number>; activeModality: string | null; activeStatus: string | null;
  onModality: (value: string) => void; onStatus: (value: string) => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.container}>
      {Object.keys(modalities).length ? <><Text style={[styles.label, { color: colors.textMuted }]}>Modality</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>{Object.entries(modalities).map(([name, count]) => <Chip key={name} label={name} count={count} active={activeModality === name} onPress={() => onModality(name)} />)}</ScrollView></> : null}
      {Object.keys(statuses).length ? <><Text style={[styles.label, { color: colors.textMuted }]}>Report status</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>{Object.entries(statuses).map(([name, count]) => <Chip key={name} label={name} count={count} active={activeStatus === name} onPress={() => onStatus(name)} />)}</ScrollView></> : null}
    </View>
  );
}

const styles = StyleSheet.create({ container: { gap: 8, paddingTop: 16 }, label: { marginHorizontal: 16, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 }, row: { paddingHorizontal: 16, gap: 8 }, chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }, chipText: { fontSize: 12, fontWeight: '700' } });

