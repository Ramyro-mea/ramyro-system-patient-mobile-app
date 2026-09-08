import { Redirect } from 'expo-router';
import { useAuth } from '@/src/providers/auth-provider';
export default function IndexRoute() {
  const { token } = useAuth();
  return <Redirect href={token ? '/(app)' : '/(auth)/login'} />;
}

