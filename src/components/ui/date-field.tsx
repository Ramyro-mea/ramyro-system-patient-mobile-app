import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatDateOnly, parseDateOnly } from '@/src/lib/date-time';
import { useAppTheme } from '@/src/providers/theme-provider';

interface Props {
  label: string;
  value: string;
  error?: string;
  disabled?: boolean;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onChange: (value: string) => void;
}

export function DateField({
  label,
  value,
  error,
  disabled = false,
  open,
  onOpen,
  onClose,
  onChange,
}: Props) {
  const { colors } = useAppTheme();
  const selectedDate = parseDateOnly(value) ?? new Date(1990, 0, 1, 12);
  const [draftDate, setDraftDate] = useState(
    () => parseDateOnly(value) ?? new Date(1990, 0, 1, 12),
  );

  const handleChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'ios') {
      if (event.type === 'set' && date) setDraftDate(date);
      return;
    }

    onClose();
    if (event.type === 'set' && date) onChange(formatDateOnly(date));
  };

  const confirmIosDate = () => {
    onChange(formatDateOnly(draftDate));
    onClose();
  };

  return (
    <View style={styles.group}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => {
          setDraftDate(parseDateOnly(value) ?? new Date(1990, 0, 1, 12));
          onOpen();
        }}
        style={[
          styles.field,
          {
            borderColor: error ? colors.danger : colors.border,
            backgroundColor: colors.surfaceMuted,
            opacity: disabled ? 0.55 : 1,
          },
        ]}
      >
        <Text style={[styles.value, { color: value ? colors.text : colors.textMuted }]}>
          {value || 'Select date'}
        </Text>
        <Ionicons name="calendar-outline" size={20} color={colors.primary} />
      </Pressable>
      {open ? (
        <View style={styles.picker}>
          <DateTimePicker
            value={Platform.OS === 'ios' ? draftDate : selectedDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            maximumDate={new Date()}
            onChange={handleChange}
          />
          {Platform.OS === 'ios' ? (
            <Pressable accessibilityRole="button" onPress={confirmIosDate} style={styles.done}>
              <Text style={[styles.doneText, { color: colors.primary }]}>Done</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 7 },
  label: { fontSize: 13, fontWeight: '600' },
  field: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  value: { fontSize: 16 },
  picker: { gap: 4 },
  done: { alignSelf: 'flex-end', paddingHorizontal: 12, paddingVertical: 6 },
  doneText: { fontSize: 15, fontWeight: '700' },
  error: { fontSize: 12, lineHeight: 16 },
});
