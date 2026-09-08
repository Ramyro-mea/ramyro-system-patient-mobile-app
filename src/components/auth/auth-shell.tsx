import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PropsWithChildren } from 'react';
import { ScreenBackground } from '@/src/components/screen-background';
import { useAppTheme } from '@/src/providers/theme-provider';

export function AuthShell({ title, subtitle, children }: PropsWithChildren<{ title: string; subtitle: string }>) {
  const { mode, colors } = useAppTheme();
  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Image source={mode === 'dark' ? require('@/assets/images/ramyro-logo.png') : require('@/assets/images/ramyro-logo-light2.png')} resizeMode="contain" style={styles.logo} accessibilityLabel="Ramyro" />
              <Text style={[styles.title, { color: colors.primary }]}>{title}</Text>
              <Text style={[styles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text>
              <View style={styles.content}>{children}</View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 }, scroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 460, alignSelf: 'center', borderRadius: 24, borderWidth: 1, padding: 24, shadowColor: '#0284c7', shadowOpacity: 0.2, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 8 },
  logo: { width: 175, height: 52, alignSelf: 'center', marginBottom: 12 },
  title: { textAlign: 'center', fontSize: 27, fontWeight: '800' },
  subtitle: { textAlign: 'center', fontSize: 14, marginTop: 6, lineHeight: 20 },
  content: { gap: 16, marginTop: 24 },
});
