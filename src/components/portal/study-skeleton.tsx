import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/src/providers/theme-provider';

function Bar({ width, height = 12 }: { width: `${number}%` | number; height?: number }) {
  const { colors } = useAppTheme();
  return <View style={{ width, height, borderRadius: height / 2, backgroundColor: colors.skeleton }} />;
}

export function StudySkeleton() {
  const { colors } = useAppTheme();
  return (
    <View accessibilityLabel="Loading study" style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.heading}><Bar width="42%" height={18} /><Bar width={72} height={24} /></View>
      <Bar width="76%" />
      <Bar width="30%" height={9} />
      <Bar width="58%" />
      <View style={styles.actions}><Bar width="31%" height={40} /><Bar width="31%" height={40} /><Bar width="31%" height={40} /></View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, borderWidth: 1, borderRadius: 18, padding: 16, gap: 12 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actions: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8 },
});
