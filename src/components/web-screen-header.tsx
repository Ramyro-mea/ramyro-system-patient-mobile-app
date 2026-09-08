import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '@/src/providers/theme-provider';

export function WebScreenHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: colors.surface }}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to encounters" onPress={() => router.back()} style={styles.back}><Ionicons name="arrow-back" size={23} color={colors.text} /></Pressable>
        <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>{title}</Text>
        <View style={styles.right}>{right}</View>
      </View>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({ header: { height: 56, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 }, back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, title: { flex: 1, fontSize: 17, fontWeight: '800' }, right: { minWidth: 44, alignItems: 'flex-end' } });

