import { LinearGradient } from 'expo-linear-gradient';
import { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { useAppTheme } from '@/src/providers/theme-provider';

export function ScreenBackground({ children }: PropsWithChildren) {
  const { mode, colors } = useAppTheme();
  const gradient = mode === 'dark' ? ['#020617', '#0f172a', '#020617'] : ['#f8fafc', '#eff6ff', '#f8fafc'];
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <LinearGradient colors={gradient as [string, string, string]} style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={[styles.glow, { backgroundColor: colors.primary }]} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  glow: { position: 'absolute', width: 260, height: 260, borderRadius: 130, top: -120, right: -80, opacity: 0.12 },
});

