import { zodResolver } from '@hookform/resolvers/zod';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BookingAttachmentsField } from '@/src/components/reservations/booking-attachments-field';
import { ScreenBackground } from '@/src/components/screen-background';
import { AppButton } from '@/src/components/ui/app-button';
import { CompactSelectField } from '@/src/components/ui/compact-select-field';
import { DateField } from '@/src/components/ui/date-field';
import { ErrorList } from '@/src/components/ui/error-list';
import { FormField } from '@/src/components/ui/form-field';
import { SelectField } from '@/src/components/ui/select-field';
import { ProcedurePrerequisiteList } from '@/src/components/reservations/procedure-prerequisites';
import { WebScreenHeader } from '@/src/components/web-screen-header';
import { env } from '@/src/config/env';
import { usePatientProfile } from '@/src/hooks/use-patient-data';
import { useProcedureOptions, useProcedurePrerequisites } from '@/src/hooks/use-reservations';
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
import { errorMessages } from '@/src/lib/api-client';
import { reservationsService } from '@/src/services/reservations';
import type { PendingBookingAttachment } from '@/src/types/api';

const submitError = 'We could not send your reservation request. Please try again.';
const uploadError = 'Your reservation was created, but one or more documents could not be uploaded.';
const emptyValues: ReservationValues = {
  firstName: '',
  lastName: '',
  countryCode: DEFAULT_COUNTRY_CODE,
  phoneNumber: '',
  email: '',
  dateOfBirth: '',
  gender: '',
  reasonForReservation: '',
  procedureId: null,
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

interface CompletedBooking {
  kind: 'guest' | 'patient';
  visitId: number;
  orderId: number | null;
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
  const [procedureOpen, setProcedureOpen] = useState(false);
  const [prerequisitesOpen, setPrerequisitesOpen] = useState(true);
  const [dateOpen, setDateOpen] = useState(false);
  const [attachments, setAttachments] = useState<PendingBookingAttachment[]>([]);
  const [attachmentPickerBusy, setAttachmentPickerBusy] = useState(false);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const [completedBooking, setCompletedBooking] = useState<CompletedBooking | null>(null);
  const [retryingUploads, setRetryingUploads] = useState(false);

  const { control, handleSubmit, reset, setValue, formState: { errors, isSubmitting } } = useForm<ReservationValues>({
    resolver: zodResolver(reservationSchema),
    defaultValues: emptyValues,
  });
  const procedureId = useWatch({ control, name: 'procedureId' });
  const procedureOptionsQuery = useProcedureOptions();
  const prerequisitesQuery = useProcedurePrerequisites(procedureId ?? null);
  const prerequisiteSummary = useMemo(() => {
    if (prerequisitesQuery.isPending) return 'Loading requirements...';
    if (prerequisitesQuery.isError) return 'Requirements could not be loaded';

    const items = prerequisitesQuery.data ?? [];
    if (items.length === 0) return 'No prerequisites listed';

    const requiredCount = items.filter((item) => item.isRequired).length;
    const requirementLabel = items.length === 1 ? '1 requirement' : `${items.length} requirements`;
    return requiredCount > 0 ? `${requirementLabel} - ${requiredCount} required` : requirementLabel;
  }, [prerequisitesQuery.data, prerequisitesQuery.isError, prerequisitesQuery.isPending]);
  const procedureOptions = useMemo(
    () => (procedureOptionsQuery.data ?? []).map((option) => ({
      value: option.procedureId,
      label: `${option.modalityDisplayName} — ${option.procedureDisplayName}`,
    })),
    [procedureOptionsQuery.data],
  );

  useEffect(() => {
    if (procedureId !== null) setPrerequisitesOpen(true);
  }, [procedureId]);

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
      const { countryCode, phoneNumber, email, gender, reasonForReservation, ...details } = values;
      const request = {
        ...details,
        phoneNumber: buildInternationalPhone(countryCode, phoneNumber),
        email: email.trim() || null,
        gender: gender || null,
        reasonForReservation: reasonForReservation?.trim() || null,
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

  const continueAfterBooking = (booking: CompletedBooking) => {
    router.replace(booking.kind === 'guest' ? '/(auth)/login' : '/(app)/reservations');
  };

  const uploadAttachments = async (
    booking: CompletedBooking,
    candidates: PendingBookingAttachment[],
  ) => {
    if (candidates.length === 0) return true;
    if (booking.orderId === null) {
      const message = 'The reservation order was not returned.';
      setAttachments((current) => current.map((attachment) => (
        candidates.some((candidate) => candidate.id === attachment.id)
          ? { ...attachment, status: 'failed', error: message }
          : attachment
      )));
      return false;
    }

    let succeeded = true;
    for (const candidate of candidates) {
      setAttachments((current) => current.map((attachment) => (
        attachment.id === candidate.id
          ? { ...attachment, status: 'uploading', error: null }
          : attachment
      )));
      try {
        await reservationsService.uploadDocument(
          booking.visitId,
          booking.orderId,
          candidate,
          token ?? undefined,
        );
        setAttachments((current) => current.map((attachment) => (
          attachment.id === candidate.id
            ? { ...attachment, status: 'uploaded', error: null }
            : attachment
        )));
      } catch (error) {
        succeeded = false;
        const message = errorMessages(error, 'Upload failed.')[0];
        setAttachments((current) => current.map((attachment) => (
          attachment.id === candidate.id
            ? { ...attachment, status: 'failed', error: message }
            : attachment
        )));
      }
    }
    return succeeded;
  };

  const clearProcedure = () => {
    const clear = () => {
      setAttachments([]);
      setValue('procedureId', null, { shouldValidate: true });
    };
    if (attachments.length === 0) {
      clear();
      return;
    }
    Alert.alert(
      'Clear procedure?',
      'The selected documents will also be removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: clear },
      ],
    );
  };

  const submit = handleSubmit(async (values) => {
    setServerErrors([]);
    let result: Awaited<ReturnType<typeof mutation.mutateAsync>>;
    try {
      result = await mutation.mutateAsync(values);
    } catch {
      setServerErrors([submitError]);
      return;
    }

    const booking: CompletedBooking = {
      kind: result.kind,
      visitId: result.data.visitId,
      orderId: result.data.orderId,
    };
    setUploadingAttachments(true);
    setCompletedBooking(booking);
    if (result.kind === 'guest') {
      await saveReceipt(result.data).catch(() => undefined);
    } else {
      await queryClient.invalidateQueries({ queryKey: ['patient-visits'] }).catch(() => undefined);
    }

    try {
      const succeeded = await uploadAttachments(
        booking,
        attachments.filter((attachment) => attachment.status === 'pending'),
      );
      if (succeeded) {
        continueAfterBooking(booking);
      } else {
        setServerErrors([uploadError]);
      }
    } finally {
      setUploadingAttachments(false);
    }
  });

  const retryFailedUploads = async () => {
    if (!completedBooking) return;
    setServerErrors([]);
    setRetryingUploads(true);
    setUploadingAttachments(true);
    try {
      const succeeded = await uploadAttachments(
        completedBooking,
        attachments.filter((attachment) => attachment.status === 'failed'),
      );
      if (succeeded) {
        continueAfterBooking(completedBooking);
      } else {
        setServerErrors([uploadError]);
      }
    } finally {
      setUploadingAttachments(false);
      setRetryingUploads(false);
    }
  };

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
                <FormField label="Email (optional)" placeholder="name@example.com" value={value} onChangeText={onChange} onBlur={onBlur} error={errors.email?.message} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textContentType="emailAddress" autoComplete="email" returnKeyType="next" />
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
                <CompactSelectField
                  label="Gender (optional)"
                  placeholder="Select gender"
                  value={value}
                  options={[
                    { label: 'Male', value: 'Male' },
                    { label: 'Female', value: 'Female' },
                  ]}
                  error={errors.gender?.message}
                  onChange={onChange}
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

              <Controller control={control} name="procedureId" render={({ field: { value, onChange } }) => (
                <SelectField
                  label="Modality and procedure (optional)"
                  placeholder={procedureOptionsQuery.isPending ? 'Loading procedures...' : 'Select a procedure'}
                  value={value}
                  options={procedureOptions}
                  open={procedureOpen}
                  disabled={procedureOptionsQuery.isPending || procedureOptionsQuery.isError}
                  error={errors.procedureId?.message}
                  emptyMessage="No active procedures are available for this branch."
                  searchable
                  allowClear
                  searchPlaceholder="Search modality or procedure"
                  onOpen={() => setProcedureOpen(true)}
                  onClose={() => setProcedureOpen(false)}
                  onChange={(nextValue) => {
                    if (nextValue === null) {
                      clearProcedure();
                    } else {
                      onChange(nextValue);
                    }
                  }}
                />
              )} />
              {procedureOptionsQuery.isError ? (
                <View style={styles.lookupError}>
                  <Text style={[styles.lookupErrorText, { color: colors.danger }]}>Procedures could not be loaded.</Text>
                  <AppButton label="Try again" variant="outline" onPress={() => void procedureOptionsQuery.refetch()} />
                </View>
              ) : null}

              {procedureId !== null ? (
                <View style={[styles.prerequisites, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded: prerequisitesOpen }}
                    accessibilityLabel={`${prerequisitesOpen ? 'Hide' : 'View'} appointment prerequisites`}
                    style={({ pressed }) => [styles.prerequisitesHeader, pressed && styles.prerequisitesHeaderPressed]}
                    onPress={() => setPrerequisitesOpen((current) => !current)}
                  >
                    <View style={[styles.prerequisitesIcon, { backgroundColor: colors.warningSurface }]}>
                      <Ionicons name="clipboard-outline" size={22} color={colors.warning} />
                    </View>
                    <View style={styles.prerequisitesHeading}>
                      <Text style={[styles.prerequisitesTitle, { color: colors.text }]}>Before your appointment</Text>
                      <Text style={[styles.prerequisitesSummary, { color: colors.textMuted }]}>{prerequisiteSummary}</Text>
                    </View>
                    <View style={styles.prerequisitesToggle}>
                      <Text style={[styles.prerequisitesToggleText, { color: colors.primary }]}>
                        {prerequisitesOpen ? 'Hide' : 'View'}
                      </Text>
                      <Ionicons
                        name={prerequisitesOpen ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color={colors.primary}
                      />
                    </View>
                  </Pressable>

                  {prerequisitesOpen ? (
                    <View style={[styles.prerequisitesContent, { borderTopColor: colors.border }]}>
                      {prerequisitesQuery.isPending ? (
                        <View style={styles.prerequisitesLoading}>
                          <ActivityIndicator size="small" color={colors.primary} />
                          <Text style={[styles.prerequisitesMessage, { color: colors.textMuted }]}>Loading prerequisites...</Text>
                        </View>
                      ) : prerequisitesQuery.isError ? (
                        <View style={styles.lookupError}>
                          <Text style={[styles.lookupErrorText, { color: colors.danger }]}>Prerequisites could not be loaded.</Text>
                          <View style={styles.retryActions}>
                            <AppButton style={styles.retryButton} label="Try again" variant="outline" onPress={() => void prerequisitesQuery.refetch()} />
                            <AppButton style={styles.retryButton} label="Clear procedure" variant="ghost" onPress={clearProcedure} />
                          </View>
                        </View>
                      ) : (
                        <ProcedurePrerequisiteList items={prerequisitesQuery.data ?? []} />
                      )}
                    </View>
                  ) : null}
                </View>
              ) : null}

              {procedureId !== null ? (
                <BookingAttachmentsField
                  attachments={attachments}
                  disabled={Boolean(completedBooking) || isSubmitting || mutation.isPending || retryingUploads}
                  onChange={setAttachments}
                  onBusyChange={setAttachmentPickerBusy}
                />
              ) : null}

              {!uploadingAttachments ? <ErrorList messages={serverErrors} /> : null}
              {completedBooking ? (
                uploadingAttachments || serverErrors.length === 0 ? null : <View style={styles.uploadFailureActions}>
                  <AppButton
                    style={styles.uploadFailureButton}
                    label="Retry failed uploads"
                    icon="refresh-outline"
                    loading={retryingUploads}
                    onPress={() => void retryFailedUploads()}
                  />
                  <AppButton
                    style={styles.uploadFailureButton}
                    label="Continue without them"
                    variant="outline"
                    disabled={retryingUploads}
                    onPress={() => continueAfterBooking(completedBooking)}
                  />
                </View>
              ) : (
                <AppButton
                  label="Send reservation request"
                  icon="calendar-outline"
                  disabled={Boolean(
                    attachmentPickerBusy
                    || (token && profileQuery.isPending)
                    || (procedureId !== null && (prerequisitesQuery.isPending || prerequisitesQuery.isError))
                  )}
                  loading={isSubmitting || mutation.isPending}
                  onPress={() => void submit()}
                />
              )}
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
  lookupError: { gap: 9 },
  lookupErrorText: { fontSize: 13, lineHeight: 18 },
  prerequisites: { borderWidth: 1, borderRadius: 18, overflow: 'hidden' },
  prerequisitesHeader: { minHeight: 72, paddingHorizontal: 14, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', gap: 11 },
  prerequisitesHeaderPressed: { opacity: 0.72 },
  prerequisitesIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  prerequisitesHeading: { flex: 1, gap: 3 },
  prerequisitesTitle: { fontSize: 15, fontWeight: '800' },
  prerequisitesSummary: { fontSize: 12, lineHeight: 17 },
  prerequisitesToggle: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  prerequisitesToggleText: { fontSize: 12, fontWeight: '800' },
  prerequisitesContent: { borderTopWidth: 1, padding: 13 },
  prerequisitesLoading: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 9 },
  prerequisitesMessage: { fontSize: 13, lineHeight: 18 },
  retryActions: { flexDirection: 'row', gap: 8 },
  retryButton: { flex: 1 },
  uploadFailureActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  uploadFailureButton: { flexGrow: 1, minWidth: 190 },
});
