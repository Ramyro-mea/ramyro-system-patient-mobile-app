import { zodResolver } from '@hookform/resolvers/zod';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
import { usePatientFieldConfigurations, useProcedureOptions, useProcedurePrerequisites } from '@/src/hooks/use-reservations';
import { createReservationSchema, type ReservationValues } from '@/src/lib/validation';
import { buildReservationRequest } from '@/src/lib/reservation-request';
import {
  countryCallingCodeOptions,
  countryOptions,
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
import type { PatientFieldKey, PendingBookingAttachment } from '@/src/types/api';

const submitError = 'We could not send your reservation request. Please try again.';
const uploadError = 'Your reservation was created, but one or more documents could not be uploaded.';
const titleOptions = ['Mr', 'Mrs', 'Ms', 'Miss', 'Mx', 'Dr', 'Prof', 'Master', 'Baby']
  .map((value) => ({ label: value, value }));
const emptyValues: ReservationValues = {
  title: '',
  nationality: '',
  firstName: '',
  middleName: '',
  lastName: '',
  ssn: '',
  countryCode: DEFAULT_COUNTRY_CODE,
  phoneNumber: '',
  email: '',
  dateOfBirth: '1990-01-01',
  gender: '',
  address: '',
  emergencyCountryCode: DEFAULT_COUNTRY_CODE,
  emergencyContactNumber: '',
  weightKg: '',
  heightCm: '',
  procedureId: null,
};

function getProfileGender(gender: string | null) {
  const value = gender?.trim().toLowerCase();
  if (value === 'male' || value === 'm') return 'Male';
  if (value === 'female' || value === 'f') return 'Female';
  if (value === 'other' || value === 'o') return 'Other';
  if (value === 'unknown' || value === 'u') return 'Unknown';
  return '';
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
  const [nationalityOpen, setNationalityOpen] = useState(false);
  const [emergencyCountryOpen, setEmergencyCountryOpen] = useState(false);
  const [emergencyCountryIso, setEmergencyCountryIso] = useState(DEFAULT_COUNTRY_ISO);
  const [procedureOpen, setProcedureOpen] = useState(false);
  const [prerequisitesOpen, setPrerequisitesOpen] = useState(true);
  const [dateOpen, setDateOpen] = useState(false);
  const [attachments, setAttachments] = useState<PendingBookingAttachment[]>([]);
  const [attachmentPickerBusy, setAttachmentPickerBusy] = useState(false);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const [completedBooking, setCompletedBooking] = useState<CompletedBooking | null>(null);
  const [retryingUploads, setRetryingUploads] = useState(false);

  const fieldConfigurationsQuery = usePatientFieldConfigurations();
  const requiredFieldConfigurations = useMemo(
    () => (fieldConfigurationsQuery.data ?? []).filter((field) => field.requirement === 2),
    [fieldConfigurationsQuery.data],
  );
  const requiredFieldKeys = useMemo(
    () => new Set(requiredFieldConfigurations.map((field) => field.fieldKey)),
    [requiredFieldConfigurations],
  );
  const lockedPatientFieldKeys = useMemo(() => {
    const profile = token ? profileQuery.data : null;
    if (!profile) return new Set<PatientFieldKey>();

    const populatedFields: Partial<Record<PatientFieldKey, unknown>> = {
      title: profile.title?.trim(),
      nationality: profile.nationality?.trim(),
      firstName: profile.firstName?.trim(),
      middleName: profile.middleName?.trim(),
      lastName: profile.lastName?.trim(),
      ssn: profile.ssn?.trim(),
      phoneNumber: profile.phoneNumber?.trim(),
      email: profile.email?.trim(),
      gender: getProfileGender(profile.gender),
      dateOfBirth: profile.dateOfBirth?.trim(),
      address: profile.address?.trim(),
      emergencyContactNumber: profile.emergencyContactNumber?.trim(),
    };

    return new Set(
      (Object.entries(populatedFields) as [PatientFieldKey, unknown][])
        .filter(([, value]) => Boolean(value))
        .map(([fieldKey]) => fieldKey),
    );
  }, [profileQuery.data, token]);
  const reservationSchema = useMemo(
    () => createReservationSchema(requiredFieldKeys),
    [requiredFieldKeys],
  );
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
    if (!token || !profileQuery.data || profileApplied.current) return;
    const profile = profileQuery.data;
    const profilePhone = splitInternationalPhone(profile.phoneNumber);
    const emergencyPhone = splitInternationalPhone(profile.emergencyContactNumber);
    reset({
      ...emptyValues,
      title: profile.title ?? '',
      nationality: profile.nationality?.toUpperCase() ?? '',
      firstName: profile.firstName ?? '',
      middleName: profile.middleName ?? '',
      lastName: profile.lastName ?? '',
      ssn: profile.ssn ?? '',
      countryCode: profilePhone.countryCode,
      phoneNumber: profilePhone.nationalNumber,
      email: profile.email ?? '',
      dateOfBirth: profile.dateOfBirth?.slice(0, 10) ?? emptyValues.dateOfBirth,
      gender: getProfileGender(profile.gender),
      address: profile.address ?? '',
      emergencyCountryCode: emergencyPhone.countryCode,
      emergencyContactNumber: emergencyPhone.nationalNumber,
    });
    setCountryIso(profilePhone.countryIso);
    setEmergencyCountryIso(emergencyPhone.countryIso);
    profileApplied.current = true;
  }, [profileQuery.data, reset, token]);

  const mutation = useMutation({
    mutationFn: async (values: ReservationValues) => {
      const request = buildReservationRequest(env.risBranchId, values, requiredFieldKeys);

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
    setValue('procedureId', null, { shouldValidate: true });
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
      await queryClient.invalidateQueries({ queryKey: ['patient-profile'] }).catch(() => undefined);
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

  const renderPatientField = (fieldKey: PatientFieldKey) => {
    const locked = lockedPatientFieldKeys.has(fieldKey);
    switch (fieldKey) {
      case 'title':
        return (
          <Controller key={fieldKey} control={control} name="title" render={({ field: { value, onChange } }) => (
            <CompactSelectField label="Title" placeholder="Select title" value={value} options={titleOptions} error={errors.title?.message} disabled={locked} onChange={onChange} />
          )} />
        );
      case 'nationality':
        return (
          <Controller key={fieldKey} control={control} name="nationality" render={({ field: { value, onChange } }) => (
            <SelectField
              label="Nationality"
              placeholder="Select nationality"
              value={value || null}
              options={countryOptions}
              open={nationalityOpen}
              disabled={locked}
              error={errors.nationality?.message}
              emptyMessage="No countries match your search."
              searchable
              searchPlaceholder="Search countries"
              onOpen={() => setNationalityOpen(true)}
              onClose={() => setNationalityOpen(false)}
              onChange={(nextValue) => onChange(nextValue ?? '')}
            />
          )} />
        );
      case 'firstName':
        return (
          <Controller key={fieldKey} control={control} name="firstName" render={({ field: { value, onChange, onBlur } }) => (
            <FormField label="First name" value={value} editable={!locked} onChangeText={onChange} onBlur={onBlur} error={errors.firstName?.message} autoCapitalize="words" returnKeyType="next" />
          )} />
        );
      case 'middleName':
        return (
          <Controller key={fieldKey} control={control} name="middleName" render={({ field: { value, onChange, onBlur } }) => (
            <FormField label="Middle name" value={value} editable={!locked} onChangeText={onChange} onBlur={onBlur} error={errors.middleName?.message} autoCapitalize="words" returnKeyType="next" />
          )} />
        );
      case 'lastName':
        return (
          <Controller key={fieldKey} control={control} name="lastName" render={({ field: { value, onChange, onBlur } }) => (
            <FormField label="Last name" value={value} editable={!locked} onChangeText={onChange} onBlur={onBlur} error={errors.lastName?.message} autoCapitalize="words" returnKeyType="next" />
          )} />
        );
      case 'ssn':
        return (
          <Controller key={fieldKey} control={control} name="ssn" render={({ field: { value, onChange, onBlur } }) => (
            <FormField label="National ID / SSN" value={value} editable={!locked} onChangeText={onChange} onBlur={onBlur} error={errors.ssn?.message} returnKeyType="next" />
          )} />
        );
      case 'phoneNumber':
        return (
          <View key={fieldKey} style={styles.phoneRow}>
            <View style={styles.countryCode}>
              <Controller control={control} name="countryCode" render={({ field: { onChange } }) => (
                <SelectField
                  label="Country code"
                  placeholder="Select country"
                  value={countryIso}
                  options={countryCallingCodeOptions}
                  open={countryOpen}
                  disabled={locked}
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
                <FormField label="Mobile number" value={value} editable={!locked} onChangeText={onChange} onBlur={onBlur} error={errors.phoneNumber?.message} keyboardType="phone-pad" textContentType="telephoneNumber" autoComplete="tel" returnKeyType="next" />
              )} />
            </View>
          </View>
        );
      case 'email':
        return (
          <Controller key={fieldKey} control={control} name="email" render={({ field: { value, onChange, onBlur } }) => (
            <FormField label="Email" placeholder="name@example.com" value={value} editable={!locked} onChangeText={onChange} onBlur={onBlur} error={errors.email?.message} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textContentType="emailAddress" autoComplete="email" returnKeyType="next" />
          )} />
        );
      case 'gender':
        return (
          <Controller key={fieldKey} control={control} name="gender" render={({ field: { value, onChange } }) => (
            <CompactSelectField
              label="Gender"
              placeholder="Select gender"
              value={value}
              options={[
                { label: 'Male', value: 'Male' },
                { label: 'Female', value: 'Female' },
                { label: 'Other', value: 'Other' },
                { label: 'Unknown', value: 'Unknown' },
              ]}
              error={errors.gender?.message}
              disabled={locked}
              onChange={onChange}
            />
          )} />
        );
      case 'dateOfBirth':
        return (
          <Controller key={fieldKey} control={control} name="dateOfBirth" render={({ field: { value, onChange } }) => (
            <DateField
              label="Date of birth"
              value={value}
              error={errors.dateOfBirth?.message}
              disabled={locked}
              open={dateOpen}
              onOpen={() => setDateOpen(true)}
              onClose={() => setDateOpen(false)}
              onChange={onChange}
            />
          )} />
        );
      case 'address':
        return (
          <Controller key={fieldKey} control={control} name="address" render={({ field: { value, onChange, onBlur } }) => (
            <FormField label="Address" value={value} editable={!locked} onChangeText={onChange} onBlur={onBlur} error={errors.address?.message} autoCapitalize="sentences" returnKeyType="next" />
          )} />
        );
      case 'emergencyContactNumber':
        return (
          <View key={fieldKey} style={styles.phoneRow}>
            <View style={styles.countryCode}>
              <Controller control={control} name="emergencyCountryCode" render={({ field: { onChange } }) => (
                <SelectField
                  label="Country code"
                  placeholder="Select country"
                  value={emergencyCountryIso}
                  options={countryCallingCodeOptions}
                  open={emergencyCountryOpen}
                  disabled={locked}
                  error={errors.emergencyCountryCode?.message}
                  emptyMessage="No countries match your search."
                  searchable
                  searchPlaceholder="Search country or code"
                  onOpen={() => setEmergencyCountryOpen(true)}
                  onClose={() => setEmergencyCountryOpen(false)}
                  onChange={(nextIso) => {
                    if (!nextIso) return;
                    const country = getCountryCallingCode(nextIso);
                    if (!country) return;
                    setEmergencyCountryIso(country.iso2);
                    onChange(country.callingCode);
                  }}
                />
              )} />
            </View>
            <View style={styles.mobileNumber}>
              <Controller control={control} name="emergencyContactNumber" render={({ field: { value, onChange, onBlur } }) => (
                <FormField label="Emergency contact" value={value} editable={!locked} onChangeText={onChange} onBlur={onBlur} error={errors.emergencyContactNumber?.message} keyboardType="phone-pad" returnKeyType="next" />
              )} />
            </View>
          </View>
        );
      case 'weightKg':
        return (
          <Controller key={fieldKey} control={control} name="weightKg" render={({ field: { value, onChange, onBlur } }) => (
            <FormField label="Weight (kg)" placeholder="kg" value={value} onChangeText={onChange} onBlur={onBlur} error={errors.weightKg?.message} keyboardType="decimal-pad" returnKeyType="next" />
          )} />
        );
      case 'heightCm':
        return (
          <Controller key={fieldKey} control={control} name="heightCm" render={({ field: { value, onChange, onBlur } }) => (
            <FormField label="Height (cm)" placeholder="cm" value={value} onChangeText={onChange} onBlur={onBlur} error={errors.heightCm?.message} keyboardType="decimal-pad" returnKeyType="next" />
          )} />
        );
      default:
        return null;
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

              {fieldConfigurationsQuery.isPending ? (
                <View style={styles.prerequisitesLoading}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={[styles.prerequisitesMessage, { color: colors.textMuted }]}>Loading reservation requirements...</Text>
                </View>
              ) : fieldConfigurationsQuery.isError ? (
                <View style={styles.lookupError}>
                  <Text style={[styles.lookupErrorText, { color: colors.danger }]}>Reservation requirements could not be loaded.</Text>
                  <AppButton label="Try again" variant="outline" onPress={() => void fieldConfigurationsQuery.refetch()} />
                </View>
              ) : (
                requiredFieldConfigurations.map((field) => renderPatientField(field.fieldKey))
              )}
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
                      setPrerequisitesOpen(true);
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

              <BookingAttachmentsField
                attachments={attachments}
                disabled={Boolean(completedBooking) || isSubmitting || mutation.isPending || retryingUploads}
                onChange={setAttachments}
                onBusyChange={setAttachmentPickerBusy}
              />

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
                    || fieldConfigurationsQuery.isPending
                    || fieldConfigurationsQuery.isError
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
