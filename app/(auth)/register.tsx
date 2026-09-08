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
import { registrationSchema, type RegistrationValues } from '@/src/lib/validation';
import { useAuth } from '@/src/providers/auth-provider';
import { useAppTheme } from '@/src/providers/theme-provider';
import { GuestReceiptCard } from '@/src/components/reservations/guest-receipt-card';

export default function RegisterScreen() {
  const { register } = useAuth();
  const { colors } = useAppTheme();
  const [serverErrors, setServerErrors] = React.useState<string[]>([]);
  const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm<RegistrationValues>({
    resolver: zodResolver(registrationSchema),
    defaultValues: { patientCode: '', username: '', password: '', confirmPassword: '' },
  });

  const submit = handleSubmit(async ({ confirmPassword: _confirmPassword, ...values }) => {
    setServerErrors([]);
    try { await register(values); }
    catch (error) { setServerErrors(errorMessages(error, 'Registration failed. Please try again.')); }
  });

  return (
    <AuthShell title="Create Account" subtitle="Use the patient code sent with your invitation.">
      <GuestReceiptCard />
      <Controller control={control} name="patientCode" render={({ field: { value, onChange, onBlur } }) => (
        <FormField label="Patient Code" value={value} onChangeText={onChange} onBlur={onBlur} error={errors.patientCode?.message} placeholder="Paste or enter your patient code" autoCapitalize="none" autoCorrect={false} returnKeyType="next" />
      )} />
      <Controller control={control} name="username" render={({ field: { value, onChange, onBlur } }) => (
        <FormField label="Username" value={value} onChangeText={onChange} onBlur={onBlur} error={errors.username?.message} placeholder="Choose a username" autoCapitalize="none" autoCorrect={false} textContentType="username" autoComplete="username-new" returnKeyType="next" />
      )} />
      <Controller control={control} name="password" render={({ field: { value, onChange, onBlur } }) => (
        <FormField label="Password" value={value} onChangeText={onChange} onBlur={onBlur} error={errors.password?.message} placeholder="Choose a password" secureTextEntry textContentType="newPassword" autoComplete="new-password" returnKeyType="next" />
      )} />
      <Controller control={control} name="confirmPassword" render={({ field: { value, onChange, onBlur } }) => (
        <FormField label="Confirm Password" value={value} onChangeText={onChange} onBlur={onBlur} error={errors.confirmPassword?.message} placeholder="Repeat your password" secureTextEntry textContentType="newPassword" autoComplete="new-password" returnKeyType="done" onSubmitEditing={() => void submit()} />
      )} />
      <ErrorList messages={serverErrors} />
      <AppButton label="Create account" icon="person-add-outline" loading={isSubmitting} onPress={() => void submit()} />
      <AppButton label="Book a reservation" icon="calendar-outline" variant="outline" onPress={() => router.push('/book-reservation')} />
      <View style={styles.footer}>
        <Text style={{ color: colors.textMuted }}>Already registered?</Text>
        <Link href="/(auth)/login" asChild>
          <Pressable accessibilityRole="link"><Text style={[styles.link, { color: colors.primary }]}>Sign in</Text></Pressable>
        </Link>
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({ footer: { alignItems: 'center', gap: 7, marginTop: 2 }, link: { fontWeight: '700', fontSize: 14 } });
