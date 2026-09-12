import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewNavigation } from 'react-native-webview';

import { WebScreenHeader } from '@/src/components/web-screen-header';
import { env, portalOrigin } from '@/src/config/env';
import { useAuth } from '@/src/providers/auth-provider';
import { useAppTheme } from '@/src/providers/theme-provider';

export default function ViewerScreen() {
  const { studyInstanceUID } = useLocalSearchParams<{ studyInstanceUID?: string }>();
  const { token, expireSession } = useAuth();
  const { colors } = useAppTheme();
  const webView = useRef<WebView>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const viewerUrl = useMemo(() => {
    if (!studyInstanceUID) return null;
    const url = new URL('/patientPortal/viewer', env.webUrl);
    url.searchParams.set('studyInstanceUID', studyInstanceUID);
    url.searchParams.set('embedded', 'true');
    return url.toString();
  }, [studyInstanceUID]);

  const cookieScript = useMemo(() => {
    const tokenLiteral = JSON.stringify(token || '');
    return `(function(){document.cookie='patient_portal_auth_token='+encodeURIComponent(${tokenLiteral})+'; path=/; SameSite=Strict';true;})();`;
  }, [token]);

  const allowNavigation = (request: WebViewNavigation) => {
    if (request.url === 'about:blank') return true;
    try {
      const url = new URL(request.url);
      if (url.origin !== portalOrigin) return false;
      if (url.pathname.toLowerCase().includes('/login')) {
        void expireSession();
        return false;
      }
      return true;
    } catch { return false; }
  };

  if (!viewerUrl) return <View style={[styles.center, { backgroundColor: colors.background }]}><Text style={{ color: colors.danger }}>Study identifier is missing.</Text></View>;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <WebScreenHeader title="Study Viewer" right={<Pressable accessibilityRole="button" accessibilityLabel="Reload viewer" onPress={() => { setError(null); setLoading(true); setReloadKey((value) => value + 1); }} style={styles.reload}><Ionicons name="refresh" size={21} color={colors.text} /></Pressable>} />
      <WebView
        key={reloadKey}
        ref={webView}
        source={{ uri: viewerUrl }}
        style={styles.webView}
        incognito
        cacheEnabled
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled={false}
        thirdPartyCookiesEnabled={false}
        setSupportMultipleWindows={false}
        originWhitelist={['http://*', 'https://*']}
        injectedJavaScriptBeforeContentLoaded={cookieScript}
        onMessage={() => undefined}
        onShouldStartLoadWithRequest={allowNavigation}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onError={() => { setLoading(false); setError('Something went wrong. Please try again.'); }}
        onHttpError={({ nativeEvent }) => { if (nativeEvent.statusCode === 401) void expireSession(); }}
      />
      {loading ? <View pointerEvents="none" style={[styles.overlay, { backgroundColor: colors.background }]}><ActivityIndicator size="large" color={colors.primary} /><Text style={{ color: colors.textMuted }}>Loading viewer…</Text></View> : null}
      {error ? <View style={[styles.error, { backgroundColor: colors.dangerSurface }]}><Text style={{ color: colors.danger, flex: 1 }}>{error}</Text><Pressable onPress={() => setReloadKey((value) => value + 1)}><Text style={{ color: colors.primary, fontWeight: '800' }}>Retry</Text></Pressable></View> : null}
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 }, webView: { flex: 1, backgroundColor: '#020617' }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }, reload: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, overlay: { position: 'absolute', left: 0, right: 0, bottom: 0, top: 56, alignItems: 'center', justifyContent: 'center', gap: 12 }, error: { position: 'absolute', left: 12, right: 12, bottom: 20, borderRadius: 12, padding: 13, flexDirection: 'row', gap: 10 } });
