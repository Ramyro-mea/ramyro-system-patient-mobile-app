import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SupportMessageBubble } from '@/src/components/support/support-message-bubble';
import { AppButton } from '@/src/components/ui/app-button';
import { AttachmentPickerField } from '@/src/components/ui/attachment-picker-field';
import { WebScreenHeader } from '@/src/components/web-screen-header';
import { flattenSupportMessages, useSupportMessages, useSupportTickets } from '@/src/hooks/use-support';
import { ApiError, errorMessages } from '@/src/lib/api-client';
import {
  MAX_SUPPORT_ATTACHMENTS,
  SUPPORT_ATTACHMENT_DOCUMENT_TYPES,
  supportAttachmentError,
  supportAttachmentMimeType,
} from '@/src/lib/support-attachments';
import { useAuth } from '@/src/providers/auth-provider';
import { useSupportRealtime } from '@/src/providers/support-realtime-provider';
import { useAppTheme } from '@/src/providers/theme-provider';
import { supportKeys, supportService, uploadPendingSupportAttachments } from '@/src/services/support';
import type { PendingSupportAttachment, SupportAttachment, SupportTicket } from '@/src/types/support';

function positiveTicketId(value: string | string[] | undefined) {
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function existingTicketId(error: unknown) {
  if (!(error instanceof ApiError) || error.status !== 409 || !error.data || typeof error.data !== 'object') {
    return null;
  }
  const value = (error.data as { existingTicketId?: unknown }).existingTicketId;
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

export default function SupportScreen() {
  const params = useLocalSearchParams<{ ticketId?: string | string[] }>();
  const routeTicketId = positiveTicketId(params.ticketId);
  const { token } = useAuth();
  const { colors } = useAppTheme();
  const { status: connectionStatus } = useSupportRealtime();
  const queryClient = useQueryClient();
  const activeQuery = useSupportTickets(false);
  const closedQuery = useSupportTickets(true);
  const [ticketSelection, setTicketSelection] = useState<number | null | undefined>(
    routeTicketId ?? undefined,
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<PendingSupportAttachment[]>([]);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [screenErrors, setScreenErrors] = useState<string[]>([]);
  const listRef = useRef<FlatList>(null);
  const readMessageIds = useRef(new Set<number>());
  const activeTicket = activeQuery.data?.items[0] ?? null;
  const selectedTicketId = ticketSelection === undefined
    ? routeTicketId ?? activeTicket?.id ?? null
    : ticketSelection;
  const tickets = useMemo(
    () => [...(activeQuery.data?.items ?? []), ...(closedQuery.data?.items ?? [])],
    [activeQuery.data?.items, closedQuery.data?.items],
  );
  const selectedTicket = tickets.find((ticket) => ticket.id === selectedTicketId) ?? null;
  const messageQuery = useSupportMessages(selectedTicketId);
  const messages = useMemo(
    () => flattenSupportMessages(messageQuery.data?.pages),
    [messageQuery.data?.pages],
  );
  const lastMessage = messages.at(-1);

  useEffect(() => {
    if (!selectedTicketId || !lastMessage || !token || readMessageIds.current.has(lastMessage.id)) return;
    readMessageIds.current.add(lastMessage.id);
    void supportService.read(token, selectedTicketId, lastMessage.id)
      .then(() => queryClient.invalidateQueries({ queryKey: supportKeys.tickets(false) }))
      .catch(() => readMessageIds.current.delete(lastMessage.id));
  }, [lastMessage, queryClient, selectedTicketId, token]);

  useEffect(() => {
    if (!lastMessage) return;
    const timer = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(timer);
  }, [lastMessage]);

  const openAttachment = async (attachment: SupportAttachment) => {
    if (!token) return;
    let downloadedUri: string | null = null;
    try {
      downloadedUri = await supportService.download(token, attachment);
      if (!downloadedUri) return;
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Sharing unavailable', 'This device cannot open the native share sheet.');
        return;
      }
      await Sharing.shareAsync(downloadedUri, {
        dialogTitle: attachment.originalFileName,
        mimeType: attachment.mimeType,
      });
    } catch (error) {
      Alert.alert('Download failed', errorMessages(error, 'The attachment could not be downloaded.').join('\n'));
    } finally {
      if (downloadedUri) supportService.removeDownload(downloadedUri);
    }
  };

  const submit = async () => {
    const trimmedBody = body.trim();
    if (!token || busy || (!trimmedBody && attachments.length === 0)) return;
    setBusy(true);
    setScreenErrors([]);
    try {
      const uploaded = await uploadPendingSupportAttachments(token, attachments, setAttachments);
      const attachmentIds = uploaded.map((item) => item.remoteId!).filter(Boolean);
      if (selectedTicketId && selectedTicket?.status !== 'Closed') {
        await supportService.send(token, selectedTicketId, trimmedBody || null, attachmentIds);
      } else {
        const created = await supportService.create(token, trimmedBody || null, attachmentIds);
        setTicketSelection(created.ticket.id);
        setHistoryOpen(false);
      }
      setBody('');
      setAttachments([]);
      setAttachmentsOpen(false);
      await queryClient.invalidateQueries({ queryKey: supportKeys.all });
    } catch (error) {
      const conflictTicketId = existingTicketId(error);
      setScreenErrors(errorMessages(error, 'The message could not be sent.'));
      if (conflictTicketId) {
        setTicketSelection(conflictTicketId);
        setHistoryOpen(false);
        await queryClient.invalidateQueries({ queryKey: supportKeys.all });
      }
    } finally {
      setBusy(false);
    }
  };

  const startNewRequest = () => {
    setTicketSelection(activeTicket?.id ?? null);
    setHistoryOpen(false);
    setScreenErrors([]);
  };

  const renderHistoryTicket = ({ item }: { item: SupportTicket }) => (
    <Pressable
      accessibilityRole="button"
      onPress={() => { setTicketSelection(item.id); setHistoryOpen(false); }}
      style={({ pressed }) => [styles.historyItem, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
      <View style={styles.historyHeading}>
        <Text style={[styles.historyTitle, { color: colors.text }]}>Request #{item.id}</Text>
        <Text style={[styles.historyDate, { color: colors.textMuted }]}>
          {new Date(item.closedAtUtc || item.createdAtUtc).toLocaleDateString()}
        </Text>
      </View>
      <Text numberOfLines={2} style={[styles.historyPreview, { color: colors.textMuted }]}>
        {item.lastMessagePreview || 'No message preview'}
      </Text>
    </Pressable>
  );

  const initialLoading = activeQuery.isLoading || (routeTicketId ? closedQuery.isLoading : false);
  const ticketLoadError = activeQuery.error || closedQuery.error;
  const isClosed = selectedTicket?.status === 'Closed';
  const canCompose = !selectedTicketId || !isClosed;

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <WebScreenHeader
        title="Technical support"
        right={(
          <Pressable accessibilityRole="button" accessibilityLabel="Closed request history" onPress={() => setHistoryOpen(true)} style={styles.headerAction}>
            <Ionicons name="time-outline" size={23} color={colors.text} />
          </Pressable>
        )}
      />

      <View style={[styles.connection, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
        <View style={[styles.connectionDot, { backgroundColor: connectionStatus === 'connected' ? colors.success : colors.warning }]} />
        <Text style={[styles.connectionText, { color: colors.textMuted }]}>
          {connectionStatus === 'connected' ? 'Connected' : 'Reconnecting — messages can still be sent'}
        </Text>
        {selectedTicketId ? <Text style={[styles.ticketNumber, { color: colors.textMuted }]}>#{selectedTicketId}</Text> : null}
      </View>

      {initialLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /><Text style={{ color: colors.textMuted }}>Loading support…</Text></View>
      ) : ticketLoadError && !activeQuery.data ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={38} color={colors.textMuted} />
          <Text style={[styles.centerTitle, { color: colors.text }]}>Support could not be loaded</Text>
          <AppButton label="Try again" icon="refresh-outline" onPress={() => void activeQuery.refetch()} />
        </View>
      ) : (
        <>
          <FlatList
            ref={listRef}
            style={styles.transcript}
            contentContainerStyle={[styles.transcriptContent, messages.length === 0 && styles.emptyTranscript]}
            data={messages}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => <SupportMessageBubble message={item} onOpenAttachment={(attachment) => void openAttachment(attachment)} />}
            ListHeaderComponent={messageQuery.hasNextPage ? (
              <AppButton
                label="Load older messages"
                variant="ghost"
                loading={messageQuery.isFetchingNextPage}
                onPress={() => void messageQuery.fetchNextPage()}
              />
            ) : null}
            ListEmptyComponent={messageQuery.isLoading ? (
              <ActivityIndicator color={colors.primary} />
            ) : messageQuery.isError ? (
              <View style={styles.center}>
                <Text style={[styles.centerTitle, { color: colors.text }]}>Messages could not be loaded</Text>
                <AppButton label="Retry" icon="refresh-outline" onPress={() => void messageQuery.refetch()} />
              </View>
            ) : (
              <View style={styles.center}>
                <Ionicons name="chatbubbles-outline" size={44} color={colors.primary} />
                <Text style={[styles.centerTitle, { color: colors.text }]}>How can we help?</Text>
                <Text style={[styles.centerCopy, { color: colors.textMuted }]}>Describe the issue and our support team will reply here.</Text>
              </View>
            )}
          />

          {screenErrors.length > 0 ? (
            <View style={[styles.errorBox, { backgroundColor: colors.dangerSurface, borderColor: colors.danger }]}>
              {screenErrors.map((message) => <Text key={message} style={[styles.errorText, { color: colors.danger }]}>{message}</Text>)}
            </View>
          ) : null}

          {isClosed ? (
            <SafeAreaView edges={['bottom']} style={[styles.closedFooter, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
              <Text style={[styles.closedText, { color: colors.textMuted }]}>This request is closed and read-only.</Text>
              <AppButton label={activeTicket ? 'Open active request' : 'Start new request'} onPress={startNewRequest} />
            </SafeAreaView>
          ) : canCompose ? (
            <SafeAreaView edges={['bottom']} style={[styles.composer, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
              {attachmentsOpen || attachments.length > 0 ? (
                <ScrollView style={styles.attachmentScroller} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                  <AttachmentPickerField
                  attachments={attachments}
                  title="Attachments"
                  description="Up to 10 files, 50 MiB each. Images, PDF, Office, TXT, and CSV."
                  maxFiles={MAX_SUPPORT_ATTACHMENTS}
                  documentTypes={SUPPORT_ATTACHMENT_DOCUMENT_TYPES}
                  allowCamera
                  disabled={busy}
                  onChange={setAttachments}
                  resolveMimeType={supportAttachmentMimeType}
                  validate={supportAttachmentError}
                  />
                </ScrollView>
              ) : null}
              <View style={styles.composerRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Add attachments"
                  disabled={busy}
                  onPress={() => setAttachmentsOpen((value) => !value)}
                  style={[styles.attachButton, { borderColor: colors.border }]}>
                  <Ionicons name="attach-outline" size={24} color={colors.text} />
                  {attachments.length > 0 ? <Text style={[styles.attachCount, { color: colors.primary }]}>{attachments.length}</Text> : null}
                </Pressable>
                <TextInput
                  accessibilityLabel="Support message"
                  multiline
                  maxLength={4000}
                  value={body}
                  editable={!busy}
                  onChangeText={setBody}
                  placeholder={selectedTicketId ? 'Write a message…' : 'Describe the problem…'}
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={selectedTicketId ? 'Send message' : 'Create support request'}
                  disabled={busy || (!body.trim() && attachments.length === 0)}
                  onPress={() => void submit()}
                  style={({ pressed }) => [styles.sendButton, { backgroundColor: colors.primaryDark, opacity: busy || (!body.trim() && attachments.length === 0) ? 0.4 : pressed ? 0.75 : 1 }]}>
                  {busy ? <ActivityIndicator color={colors.white} /> : <Ionicons name="send" size={20} color={colors.white} />}
                </Pressable>
              </View>
              <Text style={[styles.characterCount, { color: colors.textMuted }]}>{body.length}/4000</Text>
            </SafeAreaView>
          ) : null}
        </>
      )}

      <Modal visible={historyOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setHistoryOpen(false)}>
        <SafeAreaView style={[styles.historyModal, { backgroundColor: colors.background }]}>
          <View style={[styles.historyHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.historyModalTitle, { color: colors.text }]}>Closed requests</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close history" onPress={() => setHistoryOpen(false)} style={styles.headerAction}>
              <Ionicons name="close" size={26} color={colors.text} />
            </Pressable>
          </View>
          {closedQuery.isLoading ? <View style={styles.center}><ActivityIndicator color={colors.primary} /></View> : (
            <FlatList
              data={closedQuery.data?.items ?? []}
              keyExtractor={(item) => String(item.id)}
              renderItem={renderHistoryTicket}
              contentContainerStyle={styles.historyList}
              ListEmptyComponent={<Text style={[styles.emptyHistory, { color: colors.textMuted }]}>No closed support requests yet.</Text>}
            />
          )}
        </SafeAreaView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerAction: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  connection: { minHeight: 36, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 7 },
  connectionDot: { width: 8, height: 8, borderRadius: 4 },
  connectionText: { flex: 1, fontSize: 11 },
  ticketNumber: { fontSize: 11, fontWeight: '800' },
  transcript: { flex: 1 },
  transcriptContent: { paddingHorizontal: 14, paddingVertical: 12 },
  emptyTranscript: { flexGrow: 1 },
  center: { flex: 1, minHeight: 180, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  centerTitle: { fontSize: 17, fontWeight: '800', textAlign: 'center' },
  centerCopy: { maxWidth: 300, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  errorBox: { borderTopWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
  errorText: { fontSize: 12, lineHeight: 17 },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingTop: 10, gap: 8, maxHeight: '58%' },
  attachmentScroller: { maxHeight: 270 },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  attachButton: { width: 44, height: 44, borderWidth: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  attachCount: { position: 'absolute', top: 2, right: 4, fontSize: 9, fontWeight: '900' },
  input: { flex: 1, maxHeight: 110, minHeight: 44, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  sendButton: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  characterCount: { alignSelf: 'flex-end', fontSize: 10 },
  closedFooter: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingTop: 12, gap: 10 },
  closedText: { fontSize: 13, textAlign: 'center' },
  historyModal: { flex: 1 },
  historyHeader: { height: 58, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  historyModalTitle: { flex: 1, fontSize: 18, fontWeight: '800' },
  historyList: { padding: 14, gap: 10, flexGrow: 1 },
  historyItem: { borderWidth: 1, borderRadius: 14, padding: 13, gap: 5 },
  historyHeading: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  historyTitle: { fontSize: 14, fontWeight: '800' },
  historyDate: { fontSize: 11 },
  historyPreview: { fontSize: 12, lineHeight: 17 },
  emptyHistory: { textAlign: 'center', marginTop: 60, fontSize: 14 },
});
