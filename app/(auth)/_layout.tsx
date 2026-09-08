import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/src/providers/auth-provider';
export default function AuthLayout() {
  const { token } = useAuth();
  if (token) return <Redirect href="/(app)" />;
  return <Stack screenOptions={{ headerShown: false, animation: 'fade_from_bottom' }} />;
}

