import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/src/providers/auth-provider';
export default function ProtectedLayout() {
  const { token } = useAuth();
  if (!token) return <Redirect href="/(auth)/login" />;
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="reservations" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="support" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="viewer" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="report/[studyId]" options={{ animation: 'slide_from_right' }} />
    </Stack>
  );
}
