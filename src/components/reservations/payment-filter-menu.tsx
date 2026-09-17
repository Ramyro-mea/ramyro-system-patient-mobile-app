import { MenuView, type MenuAction } from '@expo/ui/community/menu';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/src/providers/theme-provider';
import {
  getReservationPaymentFilterLabel,
  type ReservationPaymentFilter,
} from '@/src/lib/reservation-pricing';

const options: { label: string; value: ReservationPaymentFilter }[] = [
  { label: 'All', value: '' },
  { label: 'Paid', value: 'paid' },
  { label: 'Partially paid', value: 'partially-paid' },
  { label: 'Unpaid', value: 'unpaid' },
];

function selectedLabel(value: ReservationPaymentFilter) {
  return getReservationPaymentFilterLabel(value);
}

function FilterTrigger({ value }: { value: ReservationPaymentFilter }) {
  const { colors } = useAppTheme();

  return (
    <View
      accessible
      accessibilityRole="button"
      accessibilityLabel={`Payment filter: ${selectedLabel(value)}`}
      style={[
        styles.trigger,
        {
          backgroundColor: colors.surface,
          borderColor: value ? colors.primary : colors.border,
        },
      ]}
    >
      <Ionicons name="filter-outline" size={15} color={value ? colors.primary : colors.textMuted} />
      <Text numberOfLines={1} style={[styles.triggerText, { color: colors.text }]}>
        {selectedLabel(value)}
      </Text>
      <Ionicons name="chevron-down" size={15} color={colors.textMuted} />
    </View>
  );
}

export function PaymentFilterMenu({
  value,
  onChange,
}: {
  value: ReservationPaymentFilter;
  onChange: (value: ReservationPaymentFilter) => void;
}) {
  const { colors, mode } = useAppTheme();
  const [webOpen, setWebOpen] = useState(false);
  const actions: MenuAction[] = options.map((option) => ({
    id: option.value || 'all',
    title: option.label,
    state: option.value === value ? 'on' : 'off',
  }));

  if (Platform.OS === 'web') {
    return (
      <View style={styles.webContainer}>
        <Pressable onPress={() => setWebOpen((open) => !open)}>
          <FilterTrigger value={value} />
        </Pressable>
        {webOpen ? (
          <View
            style={[
              styles.webMenu,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            {options.map((option) => {
              const selected = option.value === value;
              return (
                <Pressable
                  key={option.value || 'all'}
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    onChange(option.value);
                    setWebOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.webOption,
                    {
                      backgroundColor: selected || pressed
                        ? colors.surfaceMuted
                        : colors.surface,
                    },
                  ]}
                >
                  <Text style={[styles.webOptionText, { color: colors.text }]}>{option.label}</Text>
                  {selected ? <Ionicons name="checkmark" size={17} color={colors.primary} /> : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <MenuView
      title="Payment status"
      colorScheme={mode}
      actions={actions}
      onPressAction={({ nativeEvent }) => {
        onChange(nativeEvent.event === 'all'
          ? ''
          : nativeEvent.event as ReservationPaymentFilter);
      }}
    >
      <FilterTrigger value={value} />
    </MenuView>
  );
}

const styles = StyleSheet.create({
  trigger: {
    width: 154,
    height: 38,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  triggerText: { flexShrink: 0, fontSize: 13, lineHeight: 17, fontWeight: '700' },
  webContainer: { position: 'relative', zIndex: 20 },
  webMenu: {
    position: 'absolute',
    top: 43,
    right: 0,
    width: 170,
    borderWidth: 1,
    borderRadius: 12,
    padding: 5,
    elevation: 5,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  webOption: {
    minHeight: 38,
    borderRadius: 8,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  webOptionText: { fontSize: 13, fontWeight: '600' },
});
