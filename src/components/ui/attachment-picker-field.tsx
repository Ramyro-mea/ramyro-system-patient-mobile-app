import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/src/components/ui/app-button';
import { formatAttachmentSize } from '@/src/lib/booking-attachments';
import { useAppTheme } from '@/src/providers/theme-provider';
import type { PendingAttachment } from '@/src/types/attachments';

interface AttachmentPickerFieldProps<T extends PendingAttachment> {
  attachments: T[];
  title: string;
  description: string;
  maxFiles: number;
  documentTypes: string[];
  allowCamera?: boolean;
  cameraLabel?: string;
  filesLabel?: string;
  limitMessage?: string;
  uploadedLabel?: string;
  disabled?: boolean;
  onChange: (attachments: T[]) => void;
  onBusyChange?: (busy: boolean) => void;
  resolveMimeType: (fileName: string, mimeType?: string | null) => string;
  validate: (
    fileName: string,
    mimeType: string | null | undefined,
    sizeBytes: number | null | undefined,
  ) => string | null;
  canRemove?: (attachment: T) => boolean;
}

function attachmentId(source: PendingAttachment['source']) {
  return `${source}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function AttachmentPickerField<T extends PendingAttachment>({
  attachments,
  title,
  description,
  maxFiles,
  documentTypes,
  allowCamera = true,
  cameraLabel = 'Take photo',
  filesLabel = 'Choose files',
  limitMessage,
  uploadedLabel = 'Ready to send',
  disabled,
  onChange,
  onBusyChange,
  resolveMimeType,
  validate,
  canRemove = (attachment) => attachment.status !== 'uploading',
}: AttachmentPickerFieldProps<T>) {
  const { colors } = useAppTheme();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const limitReached = attachments.length >= maxFiles;

  const setPickerBusy = (value: boolean) => {
    setBusy(value);
    onBusyChange?.(value);
  };

  const append = (items: T[]) => {
    const remaining = maxFiles - attachments.length;
    const accepted: T[] = [];
    let nextMessage: string | null = null;

    for (const item of items) {
      if (accepted.length >= remaining) {
        nextMessage = limitMessage || `You can attach up to ${maxFiles} files.`;
        break;
      }
      const validationMessage = validate(item.fileName, item.mimeType, item.sizeBytes);
      if (validationMessage) {
        nextMessage = validationMessage;
        continue;
      }
      accepted.push(item);
    }

    if (accepted.length > 0) onChange([...attachments, ...accepted]);
    setMessage(nextMessage);
  };

  const scanDocument = async () => {
    setMessage(null);
    setPickerBusy(true);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        const buttons = permission.canAskAgain || Platform.OS === 'web'
          ? [{ text: 'OK' }]
          : [
              { text: 'Cancel', style: 'cancel' as const },
              { text: 'Open Settings', onPress: () => void Linking.openSettings() },
            ];
        Alert.alert(
          'Camera permission required',
          'Allow camera access to capture a document. You can still choose an existing file.',
          buttons,
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        cameraType: ImagePicker.CameraType.back,
        quality: 1,
      });
      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      const fileName = asset.fileName || `document-${Date.now()}.jpg`;
      append([{
        id: attachmentId('camera'),
        uri: asset.uri,
        fileName,
        mimeType: resolveMimeType(fileName, asset.mimeType),
        sizeBytes: asset.fileSize ?? null,
        source: 'camera',
        status: 'pending',
        error: null,
        webFile: asset.file,
      } as T]);
    } catch {
      setMessage('The camera could not be opened. You can choose an existing file instead.');
    } finally {
      setPickerBusy(false);
    }
  };

  const chooseFiles = async () => {
    setMessage(null);
    setPickerBusy(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: documentTypes,
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      append(result.assets.map((asset) => ({
        id: attachmentId('file'),
        uri: asset.uri,
        fileName: asset.name,
        mimeType: resolveMimeType(asset.name, asset.mimeType),
        sizeBytes: asset.size ?? null,
        source: 'file',
        status: 'pending',
        error: null,
        webFile: asset.file,
      } as T)));
    } catch {
      setMessage('Files could not be opened. Please try again.');
    } finally {
      setPickerBusy(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
      <View style={styles.heading}>
        <View style={styles.headingText}>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.description, { color: colors.textMuted }]}>{description}</Text>
        </View>
        <Text style={[styles.count, { color: colors.textMuted }]}>{attachments.length}/{maxFiles}</Text>
      </View>

      <View style={styles.actions}>
        {allowCamera ? (
          <AppButton
            style={styles.action}
            label={cameraLabel}
            icon="camera-outline"
            variant="outline"
            disabled={disabled || busy || limitReached}
            onPress={() => void scanDocument()}
          />
        ) : null}
        <AppButton
          style={styles.action}
          label={filesLabel}
          icon="document-attach-outline"
          variant="outline"
          disabled={disabled || busy || limitReached}
          onPress={() => void chooseFiles()}
        />
      </View>

      {attachments.map((attachment) => (
        <View key={attachment.id} style={[styles.file, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons
            name={attachment.mimeType.startsWith('image/') ? 'image-outline' : 'document-text-outline'}
            size={22}
            color={attachment.status === 'failed' ? colors.danger : colors.primary}
          />
          <View style={styles.fileText}>
            <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>{attachment.fileName}</Text>
            <Text style={[styles.fileMeta, { color: attachment.status === 'failed' ? colors.danger : colors.textMuted }]}>
              {attachment.status === 'uploading'
                ? 'Uploading…'
                : attachment.status === 'uploaded'
                  ? uploadedLabel
                  : attachment.status === 'failed'
                    ? attachment.error || 'Upload failed'
                    : `${formatAttachmentSize(attachment.sizeBytes)} · ${attachment.source === 'camera' ? 'Camera' : 'File'}`}
            </Text>
          </View>
          {!disabled && canRemove(attachment) ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove ${attachment.fileName}`}
              hitSlop={10}
              onPress={() => onChange(attachments.filter((item) => item.id !== attachment.id))}>
              <Ionicons name="close-circle-outline" size={24} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      ))}

      {message ? <Text style={[styles.error, { color: colors.danger }]}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderWidth: 1, borderRadius: 14, padding: 13, gap: 12 },
  heading: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headingText: { flex: 1, gap: 3 },
  title: { fontSize: 15, fontWeight: '800' },
  description: { fontSize: 12, lineHeight: 17 },
  count: { fontSize: 12, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  action: { flexGrow: 1, minWidth: 145 },
  file: { minHeight: 58, borderWidth: 1, borderRadius: 12, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  fileText: { flex: 1, gap: 2 },
  fileName: { fontSize: 13, fontWeight: '700' },
  fileMeta: { fontSize: 11, lineHeight: 15 },
  error: { fontSize: 12, lineHeight: 17 },
});
