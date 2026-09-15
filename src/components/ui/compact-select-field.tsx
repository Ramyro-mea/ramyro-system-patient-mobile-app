import { Host, Picker } from '@expo/ui';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/src/providers/theme-provider';

interface CompactSelectOption {
  label: string;
  value: string;
}

interface Props {
  label: string;
  placeholder: string;
  value: string;
  options: CompactSelectOption[];
  error?: string;
  onChange: (value: string) => void;
}

export function CompactSelectField({ label, placeholder, value, options, error, onChange }: Props) {
  const { colors, mode } = useAppTheme();

  return (
    <View style={styles.group}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <View
        style={[
          styles.control,
          {
            backgroundColor: colors.surfaceMuted,
            borderColor: error ? colors.danger : colors.border,
          },
        ]}
      >
        <Host
          colorScheme={mode}
          matchContents={{ vertical: true }}
          seedColor={colors.primary}
          style={styles.host}
        >
          <Picker
            appearance="menu"
            selectedValue={value}
            onValueChange={onChange}
            testID={`${label.toLowerCase().replace(/\s+/g, '-')}-picker`}
          >
            <Picker.Item label={placeholder} value="" />
            {options.map((option) => (
              <Picker.Item key={option.value} label={option.label} value={option.value} />
            ))}
          </Picker>
        </Host>
        {value ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Clear ${label.toLowerCase()}`}
            hitSlop={8}
            onPress={() => onChange('')}
            style={styles.clear}
          >
            <Ionicons name="close-circle" size={20} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 7 },
  label: { fontSize: 13, fontWeight: '600' },
  control: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  host: { flex: 1, minHeight: 44, justifyContent: 'center' },
  clear: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
  error: { fontSize: 12, lineHeight: 16 },
});
