import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

const gameUrl = 'https://takdab-game.takdab-game.workers.dev/';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!Updates.isEnabled) return;

    void (async () => {
      try {
        const update = await Updates.checkForUpdateAsync();
        if (!update.isAvailable) return;
        await Updates.fetchUpdateAsync();
        await Updates.reloadAsync();
      } catch { /* The embedded shell remains usable when EAS is offline. */ }
    })();
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      <WebView
        key={retry}
        source={{ uri: gameUrl }}
        style={styles.webview}
        originWhitelist={['https://*', 'http://*']}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"
        setSupportMultipleWindows={false}
        cacheEnabled
        cacheMode="LOAD_DEFAULT"
        onLoadStart={() => { setLoading(true); setError(''); }}
        onLoadEnd={() => setLoading(false)}
        onError={event => {
          setLoading(false);
          setError(`تعذّر تحميل الطاولة (${event.nativeEvent.code}).`);
        }}
      />
      {(loading || error) && (
        <ImageBackground source={require('./assets/splash-screen.png')} resizeMode="cover" style={styles.splash}>
          <View style={styles.loadingBadge}>
            {loading ? <ActivityIndicator color="#e6c46a" /> : <Pressable onPress={() => setRetry(value => value + 1)} style={styles.retry}><Text style={styles.retryText}>إعادة المحاولة</Text></Pressable>}
            <Text style={styles.status}>{error || 'نحضّر الطاولة…'}</Text>
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
  retry: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#e6c46a' },
  retryText: { color: '#061a13', fontSize: 12, fontWeight: '800' },
});
