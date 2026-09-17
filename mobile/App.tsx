import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ImageBackground, Platform, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

const localGameUrl = Platform.OS === 'android' ? 'http://10.0.2.2:5173' : 'http://localhost:5173';
const gameUrl = process.env.EXPO_PUBLIC_GAME_URL?.trim() || localGameUrl;

export default function App() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('نحضّر الطاولة…');

  useEffect(() => {
    if (!Updates.isEnabled) return;

    void (async () => {
      try {
        const update = await Updates.checkForUpdateAsync();
        if (!update.isAvailable) return;
        setStatus('يوجد تحديث جديد…');
        await Updates.fetchUpdateAsync();
        await Updates.reloadAsync();
      } catch {
        setStatus('نحضّر الطاولة…');
      }
    })();
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      <WebView
        source={{ uri: gameUrl }}
        style={styles.webview}
        originWhitelist={['https://*', 'http://*']}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"
        setSupportMultipleWindows={false}
        onLoadEnd={() => setLoading(false)}
        onError={() => setStatus('تعذّر الاتصال بالطاولة. تحقّق من الإنترنت.')}
      />
      {loading && (
        <ImageBackground source={require('./assets/splash-screen.png')} resizeMode="cover" style={styles.splash}>
          <View style={styles.loadingBadge}>
            <ActivityIndicator color="#e6c46a" />
            <Text style={styles.status}>{status}</Text>
          </View>
        </ImageBackground>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#061a13' },
  webview: { flex: 1, backgroundColor: '#061a13' },
  splash: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 28 },
  loadingBadge: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 22, backgroundColor: '#061a13d9' },
  status: { color: '#f7edce', fontSize: 13, fontWeight: '600' },
});
