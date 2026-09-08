import * as Clipboard from 'expo-clipboard';
import { Modal, Share, StyleSheet, Text, View } from 'react-native';
import { AppButton } from '@/src/components/ui/app-button';
import { useAppTheme } from '@/src/providers/theme-provider';

export function ShareLinkModal({ url, onClose }: { url: string | null; onClose: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Modal transparent visible={Boolean(url)} animationType="fade" onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>Share study link</Text>
          <Text style={[styles.help, { color: colors.textMuted }]}>Anyone with this link can open the shared study in the existing web portal until it expires.</Text>
          <View style={[styles.urlBox, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}><Text selectable style={[styles.url, { color: colors.text }]}>{url}</Text></View>
          <AppButton label="Copy link" icon="copy-outline" variant="outline" onPress={() => { if (url) void Clipboard.setStringAsync(url); }} />
          <AppButton label="Share link" icon="share-social-outline" onPress={() => { if (url) void Share.share({ message: url }, { dialogTitle: 'Share study link' }); }} />
          <AppButton label="Close" variant="ghost" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({ overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }, card: { width: '100%', maxWidth: 480, borderWidth: 1, borderRadius: 20, padding: 20, gap: 13 }, title: { fontSize: 20, fontWeight: '800' }, help: { fontSize: 13, lineHeight: 19 }, urlBox: { borderWidth: 1, borderRadius: 12, padding: 12 }, url: { fontSize: 12, lineHeight: 18 } });
