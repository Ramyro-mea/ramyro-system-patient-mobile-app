import { Modal, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { AppButton } from '@/src/components/ui/app-button';
import { buildVisitRegistrationUrl } from '@/src/lib/registration';
import { useAppTheme } from '@/src/providers/theme-provider';

interface VisitRegistrationQrProps {
  visitId: number;
  size?: number;
}

export function VisitRegistrationQr({ visitId, size = 196 }: VisitRegistrationQrProps) {
  const { colors } = useAppTheme();
  const url = buildVisitRegistrationUrl(visitId);

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Registration QR code for visit ${visitId}`}
      style={styles.qrDetails}
    >
      <View style={styles.qrSurface}>
        <QRCode
          value={url}
          size={size}
          color="#111827"
          backgroundColor="#FFFFFF"
          quietZone={12}
          ecl="M"
          testID="visit-registration-qr"
        />
      </View>
      <Text style={[styles.visitId, { color: colors.text }]}>Visit ID: {visitId}</Text>
    </View>
  );
}

interface VisitRegistrationQrModalProps {
  visitId: number | null;
  onClose: () => void;
}

export function VisitRegistrationQrModal({ visitId, onClose }: VisitRegistrationQrModalProps) {
  const { colors } = useAppTheme();

  return (
    <Modal
      transparent
      visible={visitId !== null}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <View
          accessibilityViewIsModal
          style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Text style={[styles.title, { color: colors.text }]}>Registration QR code</Text>
          <Text style={[styles.help, { color: colors.textMuted }]}>Scan this code to open the registration page for this visit.</Text>
          {visitId !== null ? <VisitRegistrationQr visitId={visitId} size={220} /> : null}
          <AppButton label="Close" variant="ghost" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  qrDetails: { alignItems: 'center', gap: 10 },
  qrSurface: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 2 },
  visitId: { fontSize: 13, fontWeight: '800' },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalCard: {
    width: '100%',
    maxWidth: 480,
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    gap: 14,
  },
  title: { fontSize: 20, fontWeight: '800' },
  help: { fontSize: 13, lineHeight: 19 },
});
