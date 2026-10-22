import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatAttachmentSize } from '@/src/lib/booking-attachments';
import { useAppTheme } from '@/src/providers/theme-provider';
import { supportAttachmentUrl } from '@/src/services/support';
import type { SupportAttachment, SupportMessage } from '@/src/types/support';

function AttachmentPreview({
  attachment,
  authToken,
  isPatient,
  onOpen,
}: {
  attachment: SupportAttachment;
  authToken: string;
  isPatient: boolean;
  onOpen: () => void;
}) {
  const { colors } = useAppTheme();
  const [imageFailed, setImageFailed] = useState(false);
  const isImage = attachment.mimeType.toLowerCase().startsWith('image/');
  const showImage = isImage && !imageFailed;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${attachment.originalFileName}`}
      onPress={onOpen}
      style={({ pressed }) => [
        styles.attachment,
        showImage ? styles.imageAttachment : styles.fileAttachment,
        {
          backgroundColor: isPatient ? 'rgba(255,255,255,0.14)' : colors.surface,
          borderColor: isPatient ? 'rgba(255,255,255,0.25)' : colors.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}>
      {showImage ? (
        <Image
          accessibilityLabel={`Preview ${attachment.originalFileName}`}
          source={{
            uri: supportAttachmentUrl(attachment.id),
            headers: { Authorization: `Bearer ${authToken}` },
          }}
          cachePolicy="memory"
          contentFit="cover"
          transition={150}
          onError={() => setImageFailed(true)}
          style={styles.imagePreview}
        />
      ) : null}
      <View style={[styles.attachmentDetails, showImage && styles.imageAttachmentDetails]}>
        <Ionicons
          name={isImage ? 'image-outline' : 'document-attach-outline'}
          size={18}
          color={isPatient ? colors.white : colors.primary}
        />
        <View style={styles.attachmentText}>
          <Text numberOfLines={1} style={[styles.attachmentName, { color: isPatient ? colors.white : colors.text }]}>
            {attachment.originalFileName}
          </Text>
          <Text style={[styles.attachmentSize, { color: isPatient ? 'rgba(255,255,255,0.72)' : colors.textMuted }]}>
            {formatAttachmentSize(attachment.sizeBytes)}
          </Text>
        </View>
        <Ionicons name="share-outline" size={17} color={isPatient ? colors.white : colors.textMuted} />
      </View>
    </Pressable>
  );
}

export function SupportMessageBubble({
  message,
  authToken,
  onOpenAttachment,
}: {
  message: SupportMessage;
  authToken: string;
  onOpenAttachment: (attachment: SupportAttachment) => void;
}) {
  const { colors } = useAppTheme();
  const isPatient = message.senderKind === 'Patient';
  const isSystem = message.senderKind === 'System';

  if (isSystem) {
    return (
      <View style={styles.systemRow}>
        <Text style={[styles.systemText, { color: colors.textMuted, backgroundColor: colors.surfaceMuted }]}>
          {message.body || 'Support request updated'}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.row, isPatient ? styles.patientRow : styles.staffRow]}>
      <View style={[
        styles.bubble,
        isPatient
          ? { backgroundColor: colors.primaryDark }
          : { backgroundColor: colors.surfaceMuted, borderColor: colors.border, borderWidth: 1 },
      ]}>
        {!isPatient ? (
          <Text style={[styles.sender, { color: colors.primary }]}>
            {message.senderDisplayName || 'Support'}
          </Text>
        ) : null}
        {message.body ? (
          <Text style={[styles.body, { color: isPatient ? colors.white : colors.text }]}>
            {message.body}
          </Text>
        ) : null}
        {message.attachments.map((attachment) => (
          <AttachmentPreview
            key={attachment.id}
            attachment={attachment}
            authToken={authToken}
            isPatient={isPatient}
            onOpen={() => onOpenAttachment(attachment)}
          />
        ))}
        <Text style={[styles.time, { color: isPatient ? 'rgba(255,255,255,0.7)' : colors.textMuted }]}>
          {new Date(message.createdAtUtc).toLocaleString([], {
            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
          })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { width: '100%', marginVertical: 5, flexDirection: 'row' },
  patientRow: { justifyContent: 'flex-end' },
  staffRow: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '86%', borderRadius: 18, paddingHorizontal: 13, paddingVertical: 10, gap: 5 },
  sender: { fontSize: 12, fontWeight: '800' },
  body: { fontSize: 15, lineHeight: 21 },
  time: { fontSize: 10, textAlign: 'right', marginTop: 2 },
  systemRow: { alignItems: 'center', marginVertical: 7 },
  systemText: { overflow: 'hidden', borderRadius: 12, paddingHorizontal: 11, paddingVertical: 6, fontSize: 11, textAlign: 'center' },
  attachment: { minWidth: 210, width: 238, maxWidth: '100%', borderWidth: 1, borderRadius: 11, overflow: 'hidden' },
  fileAttachment: { padding: 9 },
  imageAttachment: { padding: 0 },
  imagePreview: { width: '100%', height: 158, backgroundColor: 'rgba(0,0,0,0.08)' },
  attachmentDetails: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  imageAttachmentDetails: { padding: 9 },
  attachmentText: { flex: 1 },
  attachmentName: { fontSize: 12, fontWeight: '700' },
  attachmentSize: { fontSize: 10, marginTop: 2 },
});
