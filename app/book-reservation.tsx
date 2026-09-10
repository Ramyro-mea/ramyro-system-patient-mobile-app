import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/src/components/screen-background';
import { AppButton } from '@/src/components/ui/app-button';
import { DateField } from '@/src/components/ui/date-field';
import { ErrorList } from '@/src/components/ui/error-list';
import { FormField } from '@/src/components/ui/form-field';
import { SelectField } from '@/src/components/ui/select-field';
import { WebScreenHeader } from '@/src/components/web-screen-header';
import { env } from '@/src/config/env';
import { usePatientProfile } from '@/src/hooks/use-patient-data';
import { reservationSchema, type ReservationValues } from '@/src/lib/validation';
import {
  countryCallingCodeOptions,
  DEFAULT_COUNTRY_CODE,
  DEFAULT_COUNTRY_ISO,
  getCountryCallingCode,
  splitInternationalPhone,
} from '@/src/lib/country-calling-codes';
import { useAuth } from '@/src/providers/auth-provider';
import { useGuestReceipt } from '@/src/providers/guest-receipt-provider';
import { useAppTheme } from '@/src/providers/theme-provider';
import { reservationsService } from '@/src/services/reservations';

const submitError = 'We could not send your reservation request. Please try again.';
const emptyValues: ReservationValues = {
  firstName: '',
  lastName: '',
  countryCode: DEFAULT_COUNTRY_CODE,
  phoneNumber: '',
  email: '',
  dateOfBirth: '',
  gender: '',
  reasonForReservation: '',
};

function getProfileGender(gender: string | null) {
  const value = gender?.trim().toLowerCase();
  if (value === 'male') return 'Male';
  if (value === 'female') return 'Female';
  return '';
}

function buildInternationalPhone(countryCode: string, phoneNumber: string) {
  const code = countryCode.replace(/\D/g, '');
  const number = phoneNumber.replace(/\D/g, '').replace(/^0+/, '');
  return `+${code}${number}`;
}

export default function BookReservationScreen() {
  const { token } = useAuth();
  const { colors } = useAppTheme();
  const { saveReceipt } = useGuestReceipt();
  const queryClient = useQueryClient();
  const profileQuery = usePatientProfile();
  const profileApplied = useRef(false);
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const [countryOpen, setCountryOpen] = useState(false);
  const [countryIso, setCountryIso] = useState(DEFAULT_COUNTRY_ISO);
  const [genderOpen, setGenderOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);

  const { control, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<ReservationValues>({
    resolver: zodResolver(reservationSchema),
    defaultValues: emptyValues,
  });

  useEffect(() => {
    if (!token || !profileQuery.data || profileApplied.current) return;
    const profile = profileQuery.data;
    const profilePhone = splitInternationalPhone(profile.phoneNumber);
    reset({
      ...emptyValues,
      firstName: profile.firstName ?? '',
      lastName: profile.lastName ?? '',
      countryCode: profilePhone.countryCode,
      phoneNumber: profilePhone.nationalNumber,
      email: profile.email ?? '',
      dateOfBirth: profile.dateOfBirth?.slice(0, 10) ?? '',
      gender: getProfileGender(profile.gender),
    });
    setCountryIso(profilePhone.countryIso);
    profileApplied.current = true;
  }, [profileQuery.data, reset, token]);

  const mutation = useMutation({
    mutationFn: async (values: ReservationValues) => {
      const { countryCode, phoneNumber, ...details } = values;
      const request = {
        ...details,
        phoneNumber: buildInternationalPhone(countryCode, phoneNumber),
        reasonForReservation: values.reasonForReservation?.trim() || null,
        entityBranchId: env.risBranchId,
      };

      return token
        ? {
            kind: 'patient' as const,
            data: await reservationsService.create(
              { ...request, patientId: profileQuery.data?.userId ?? null },
              token,
            ),
          }
        : {
            kind: 'guest' as const,
            data: await reservationsService.createGuest(request),
          };
    },
  });

  const submit = handleSubmit(async (values) => {
    setServerErrors([]);
    try {
      const result = await mutation.mutateAsync(values);
      if (result.kind === 'guest') {
        await saveReceipt(result.data);
        router.replace('/(auth)/login');
        return;
      }

      await queryClient.invalidateQueries({ queryKey: ['patient-visits'] });
      router.replace('/(app)/reservations');
    } catch {
      setServerErrors([submitError]);
    }
  });

  return (
    <ScreenBackground>
      <SafeAreaView edges={['bottom']} style={styles.safe}>
        <WebScreenHeader title="Book a reservation" />
        <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.title, { color: colors.text }]}>Reservation request</Text>
              <Text style={[styles.description, { color: colors.textMuted }]}>
                Send your details and our team will contact you to confirm the appointment.
              </Text>
              {token && profileQuery.isPending ? (
                <Text style={{ color: colors.textMuted }}>Loading your profile...</Text>
              ) : null}

              <Controller control={control} name="firstName" render={({ field: { value, onChange, onBlur } }) => (
                <FormField label="First name" value={value} onChangeText={onChange} onBlur={onBlur} error={errors.firstName?.message} autoCapitalize="words" returnKeyType="next" />
              )} />
              <Controller control={control} name="lastName" render={({ field: { value, onChange, onBlur } }) => (
                <FormField label="Last name" value={value} onChangeText={onChange} onBlur={onBlur} error={errors.lastName?.message} autoCapitalize="words" returnKeyType="next" />
              )} />
              <View style={styles.phoneRow}>
                <View style={styles.countryCode}>
                  <Controller control={control} name="countryCode" render={({ field: { onChange } }) => (
                    <SelectField
                      label="Country code"
                      placeholder="Select country"
                      value={countryIso}
                      options={countryCallingCodeOptions}
                      open={countryOpen}
                      error={errors.countryCode?.message}
                      emptyMessage="No countries match your search."
                      searchable
                      searchPlaceholder="Search country or code"
                      onOpen={() => setCountryOpen(true)}
                      onClose={() => setCountryOpen(false)}
                      onChange={(nextIso) => {
                        if (!nextIso) return;
                        const country = getCountryCallingCode(nextIso);
                        if (!country) return;
                        setCountryIso(country.iso2);
                        onChange(country.callingCode);
                      }}
                    />
                  )} />
                </View>
                <View style={styles.mobileNumber}>
                  <Controller control={control} name="phoneNumber" render={({ field: { value, onChange, onBlur } }) => (
                    <FormField label="Mobile number" value={value} onChangeText={onChange} onBlur={onBlur} error={errors.phoneNumber?.message} keyboardType="phone-pad" textContentType="telephoneNumber" autoComplete="tel" returnKeyType="next" />
                  )} />
                </View>
              </View>
              <Controller control={control} name="email" render={({ field: { value, onChange, onBlur } }) => (
                <FormField label="Email" value={value} onChangeText={onChange} onBlur={onBlur} error={errors.email?.message} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textContentType="emailAddress" autoComplete="email" returnKeyType="next" />
              )} />
              <Controller control={control} name="dateOfBirth" render={({ field: { value, onChange } }) => (
                <DateField
                  label="Date of birth"
                  value={value}
                  error={errors.dateOfBirth?.message}
                  open={dateOpen}
                  onOpen={() => setDateOpen(true)}
                  onClose={() => setDateOpen(false)}
                  onChange={onChange}
                />
              )} />
              <Controller control={control} name="gender" render={({ field: { value, onChange } }) => (
                <SelectField
                  label="Gender"
                  placeholder="Select gender"
                  value={value || null}
                  options={[
                    { label: 'Male', value: 'Male' },
                    { label: 'Female', value: 'Female' },
                  ]}
                  open={genderOpen}
                  error={errors.gender?.message}
                  onOpen={() => setGenderOpen(true)}
                  onClose={() => setGenderOpen(false)}
                  onChange={(next) => onChange(next ?? '')}
                />
              )} />
              <Controller control={control} name="reasonForReservation" render={({ field: { value, onChange, onBlur } }) => (
                <FormField
                  label="Reason for reservation (optional)"
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.reasonForReservation?.message}
                  placeholder="Briefly describe how we can help"
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  style={styles.reasonInput}
                />
              )} />

              <ErrorList messages={serverErrors} />
              <AppButton
                label="Send reservation request"
                icon="calendar-outline"
                disabled={Boolean(token && profileQuery.isPending)}
                loading={isSubmitting || mutation.isPending}
                onPress={() => void submit()}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 32 },
  card: { width: '100%', maxWidth: 560, alignSelf: 'center', borderRadius: 22, borderWidth: 1, padding: 20, gap: 16 },
  title: { fontSize: 23, fontWeight: '800' },
  description: { fontSize: 14, lineHeight: 21, marginTop: -8 },
  phoneRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  countryCode: { flex: 1.15 },
  mobileNumber: { flex: 1 },
  reasonInput: { minHeight: 100 },
});
