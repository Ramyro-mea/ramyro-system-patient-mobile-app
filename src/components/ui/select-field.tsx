import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppTheme } from '@/src/providers/theme-provider';

export interface SelectOption<T extends string | number> {
  label: string;
  value: T;
}

interface Props<T extends string | number> {
  label: string;
  placeholder: string;
  value: T | null;
  options: SelectOption<T>[];
  open: boolean;
  error?: string;
  emptyMessage?: string;
  onOpen: () => void;
  onClose: () => void;
  onChange: (value: T | null) => void;
  allowClear?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
}

export function SelectField<T extends string | number>({
  label,
  placeholder,
  value,
  options,
  open,
  error,
  emptyMessage = 'No options are available.',
  onOpen,
  onClose,
  onChange,
  allowClear,
  searchable = false,
  searchPlaceholder = 'Search options',
}: Props<T>) {
  const { colors } = useAppTheme();
  const [search, setSearch] = useState('');
  const selected = options.find((option) => option.value === value);
  const normalizedSearch = search.trim().toLowerCase();
  const visibleOptions = normalizedSearch
    ? options.filter((option) => option.label.toLowerCase().includes(normalizedSearch))
    : options;
  const close = () => {
    setSearch('');
    onClose();
  };

  return (
    <View style={styles.group}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onOpen}
        style={[styles.control, { backgroundColor: colors.surfaceMuted, borderColor: error ? colors.danger : colors.border }]}
      >
        <Text numberOfLines={1} style={[styles.value, { color: selected ? colors.text : colors.textMuted }]}>
          {selected?.label ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={19} color={colors.textMuted} />
      </Pressable>
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
        <SafeAreaView style={[styles.modal, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{label}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`Close ${label}`} onPress={close} style={styles.close}>
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>
          {searchable ? (
            <View style={styles.searchContainer}>
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={searchPlaceholder}
                placeholderTextColor={colors.textMuted}
                autoCorrect={false}
                autoCapitalize="none"
                clearButtonMode="while-editing"
                style={[styles.searchInput, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, color: colors.text }]}
              />
            </View>
          ) : null}
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.options}>
            {allowClear ? (
              <OptionRow label="No preference" selected={value === null} onPress={() => { onChange(null); close(); }} />
            ) : null}
            {visibleOptions.map((option) => (
              <OptionRow
                key={String(option.value)}
                label={option.label}
                selected={option.value === value}
                onPress={() => { onChange(option.value); close(); }}
              />
            ))}
            {!visibleOptions.length ? <Text style={[styles.empty, { color: colors.textMuted }]}>{emptyMessage}</Text> : null}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

function OptionRow({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.option, { backgroundColor: selected ? colors.successSurface : colors.surface, borderColor: selected ? colors.primary : colors.border }]}
    >
      <Text style={[styles.optionLabel, { color: colors.text }]}>{label}</Text>
      {selected ? <Ionicons name="checkmark" size={21} color={colors.primary} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  group: { gap: 7 },
  label: { fontSize: 13, fontWeight: '600' },
  control: { minHeight: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  value: { flex: 1, fontSize: 16 },
  error: { fontSize: 12, lineHeight: 16 },
  modal: { flex: 1 },
  modalHeader: { minHeight: 58, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center' },
  modalTitle: { flex: 1, fontSize: 18, fontWeight: '800' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  searchContainer: { paddingHorizontal: 16, paddingTop: 14 },
  searchInput: { minHeight: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, fontSize: 16 },
  options: { padding: 16, gap: 10 },
  option: { minHeight: 50, borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  optionLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
  empty: { textAlign: 'center', paddingVertical: 32 },
});
