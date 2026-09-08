import 'react-native-gesture-handler';
import 'react-native-reanimated';

import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppProviders } from '@/src/providers/app-providers';
import { useAuth } from '@/src/providers/auth-provider';
import { useAppTheme } from '@/src/providers/theme-provider';

void SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { status } = useAuth();
  const { mode } = useAppTheme();
  useEffect(() => { if (status !== 'loading') void SplashScreen.hideAsync(); }, [status]);
  if (status === 'loading') return null;

  return (
    <>
      <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
        <Stack.Screen name="book-reservation" options={{ animation: 'slide_from_right' }} />
      </Stack>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
    </>
  );
}

export default function RootLayout() {
  return <AppProviders><RootNavigator /></AppProviders>;
}
