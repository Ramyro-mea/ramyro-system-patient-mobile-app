import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/src/providers/theme-provider';

export function ErrorList({ messages, tone = 'error' }: { messages: string[]; tone?: 'error' | 'info' }) {
  const { colors } = useAppTheme();
  if (!messages.length) return null;
  const color = tone === 'error' ? colors.danger : colors.primary;
  const background = tone === 'error' ? colors.dangerSurface : colors.surfaceMuted;
  return (
    <View accessibilityRole="alert" style={[styles.container, { backgroundColor: background, borderColor: color }]}>
      <Ionicons name={tone === 'error' ? 'alert-circle-outline' : 'information-circle-outline'} size={20} color={color} />
      <View style={styles.messages}>
        {messages.map((message) => <Text key={message} style={[styles.message, { color }]}>{message}</Text>)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: 'row', gap: 9 },
  messages: { flex: 1, gap: 3 }, message: { fontSize: 13, lineHeight: 18 },
});

