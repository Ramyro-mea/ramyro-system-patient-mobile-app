import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { useAppTheme } from '@/src/providers/theme-provider';

interface Props extends TextInputProps { label: string; error?: string; }

export function FormField({ label, error, secureTextEntry, style, ...props }: Props) {
  const { colors } = useAppTheme();
  const [visible, setVisible] = useState(false);
  const editable = props.editable !== false;
  return (
    <View style={styles.group}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <View
        style={[
          styles.inputRow,
          {
            borderColor: error ? colors.danger : colors.border,
            backgroundColor: colors.surfaceMuted,
            opacity: editable ? 1 : 0.55,
          },
        ]}
      >
        <TextInput
          {...props}
          secureTextEntry={secureTextEntry && !visible}
          placeholderTextColor={colors.textMuted}
          style={[styles.input, { color: colors.text }, style]}
          accessibilityLabel={label}
        />
        {secureTextEntry ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`} onPress={() => setVisible((value) => !value)} style={styles.eye}>
            <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={21} color={colors.primary} />
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 7 }, label: { fontSize: 13, fontWeight: '600' },
  inputRow: { minHeight: 48, borderWidth: 1, borderRadius: 13, flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  eye: { width: 48, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  error: { fontSize: 12, lineHeight: 16 },
});
