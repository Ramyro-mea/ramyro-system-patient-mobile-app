import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import { useAppTheme } from '@/src/providers/theme-provider';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
interface Props {
  label: string; onPress: () => void; disabled?: boolean; loading?: boolean;
  icon?: IconName; variant?: 'primary' | 'outline' | 'ghost' | 'danger'; style?: ViewStyle;
}

export function AppButton({ label, onPress, disabled, loading, icon, variant = 'primary', style }: Props) {
  const { colors } = useAppTheme();
  const isPrimary = variant === 'primary';
  const foreground = isPrimary ? colors.white : variant === 'danger' ? colors.danger : colors.text;
  const backgroundColor = isPrimary ? colors.primaryDark : variant === 'danger' ? colors.dangerSurface : 'transparent';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor, borderColor: isPrimary ? colors.primaryDark : colors.border, opacity: disabled ? 0.42 : pressed ? 0.76 : 1 },
        variant === 'ghost' && styles.ghost,
        style,
      ]}>
      {loading ? <ActivityIndicator color={foreground} /> : <>
        {icon ? <Ionicons name={icon} size={18} color={foreground} /> : null}
        <Text style={[styles.label, { color: foreground }]}>{label}</Text>
      </>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 46, borderRadius: 13, borderWidth: 1, paddingHorizontal: 16, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 15, fontWeight: '700' },
  ghost: { borderWidth: 0, paddingHorizontal: 10 },
});

