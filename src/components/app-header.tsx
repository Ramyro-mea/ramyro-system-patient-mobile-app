import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/src/providers/auth-provider';
import { useAppTheme } from '@/src/providers/theme-provider';

export function AppHeader() {
  const { logout } = useAuth();
  const { mode, colors, toggleTheme } = useAppTheme();
  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: colors.surface }}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Image source={mode === 'dark' ? require('@/assets/images/ramyro-logo.png') : require('@/assets/images/ramyro-logo-light2.png')} resizeMode="contain" style={styles.logo} accessibilityLabel="Ramyro" />
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel="Toggle theme" onPress={toggleTheme} style={[styles.iconButton, { borderColor: colors.border }]}>
            <Ionicons name={mode === 'dark' ? 'sunny-outline' : 'moon-outline'} size={21} color={colors.text} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Log out" onPress={() => void logout()} style={[styles.iconButton, { borderColor: colors.border }]}>
            <Ionicons name="log-out-outline" size={21} color={colors.text} />
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { height: 58, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  logo: { width: 135, height: 38 }, actions: { flexDirection: 'row', gap: 8 },
  iconButton: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});

