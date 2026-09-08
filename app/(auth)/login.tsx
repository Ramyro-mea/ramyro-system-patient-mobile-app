import { zodResolver } from '@hookform/resolvers/zod';
import { Link, router } from 'expo-router';
import React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthShell } from '@/src/components/auth/auth-shell';
import { AppButton } from '@/src/components/ui/app-button';
import { ErrorList } from '@/src/components/ui/error-list';
import { FormField } from '@/src/components/ui/form-field';
import { errorMessages } from '@/src/lib/api-client';
import { loginSchema, type LoginValues } from '@/src/lib/validation';
import { useAuth } from '@/src/providers/auth-provider';
import { useAppTheme } from '@/src/providers/theme-provider';
import { GuestReceiptCard } from '@/src/components/reservations/guest-receipt-card';

export default function LoginScreen() {
  const { login, sessionMessage, clearSessionMessage } = useAuth();
  const { colors } = useAppTheme();
  const [serverErrors, setServerErrors] = React.useState<string[]>([]);
  const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema), defaultValues: { username: '', password: '' },
  });

  const submit = handleSubmit(async (values) => {
    setServerErrors([]); clearSessionMessage();
    try { await login(values); }
    catch (error) { setServerErrors(errorMessages(error, 'Login failed. Please try again.')); }
  });

  return (
    <AuthShell title="Patient Portal" subtitle="Sign in to view your studies and reports.">
      <GuestReceiptCard />
      {sessionMessage ? <ErrorList tone="info" messages={[sessionMessage]} /> : null}
      <Controller control={control} name="username" render={({ field: { value, onChange, onBlur } }) => (
        <FormField label="Username" value={value} onChangeText={onChange} onBlur={onBlur} error={errors.username?.message} placeholder="Enter your username" autoCapitalize="none" autoCorrect={false} textContentType="username" autoComplete="username" returnKeyType="next" />
      )} />
      <Controller control={control} name="password" render={({ field: { value, onChange, onBlur } }) => (
        <FormField label="Password" value={value} onChangeText={onChange} onBlur={onBlur} error={errors.password?.message} placeholder="Enter your password" secureTextEntry textContentType="password" autoComplete="current-password" returnKeyType="done" onSubmitEditing={() => void submit()} />
      )} />
      <ErrorList messages={serverErrors} />
      <AppButton label="Sign in" icon="log-in-outline" loading={isSubmitting} onPress={() => void submit()} />
      <AppButton label="Book a reservation" icon="calendar-outline" variant="outline" onPress={() => router.push('/book-reservation')} />
      <View style={styles.footer}>
        <Text style={{ color: colors.textMuted }}>Need to create an account?</Text>
        <Link href="/(auth)/register" asChild>
          <Pressable accessibilityRole="link"><Text style={[styles.link, { color: colors.primary }]}>Register with your code</Text></Pressable>
        </Link>
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({ footer: { alignItems: 'center', gap: 7, marginTop: 2 }, link: { fontWeight: '700', fontSize: 14 } });
