import { useEffect, useRef, useState } from 'react'
import { LandscapeNotice } from './Lobby'
import './MultiplayerUI.css'

function RemoteAudio({ stream }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!ref.current) return
    ref.current.srcObject = stream
    const play = () => ref.current?.play().then(() => window.removeEventListener('pointerdown', play, true)).catch(() => {})
    window.addEventListener('pointerdown', play, true)
    play()
    return () => window.removeEventListener('pointerdown', play, true)
  }, [stream])
  return <audio ref={ref} autoPlay playsInline />
}

export function VoiceControls({ voice, players, inGame = false }) {
  const active = players.filter(player => player.micOn).length
  const label = voice.mic === 'on' ? 'إغلاق الميكروفون' : voice.mic === 'requesting' ? 'جارٍ فتح الميكروفون' : 'فتح الميكروفون'
  return <div className={`voice-controls ${inGame ? 'voice-in-game' : ''}`}>
    {[...voice.remoteStreams].map(([id, stream]) => <RemoteAudio key={id} stream={stream} />)}
    <button onClick={voice.toggleMic} disabled={voice.mic === 'requesting'} aria-pressed={voice.mic === 'on'} aria-label={label}>
      <span aria-hidden="true">{voice.mic === 'on' ? '🎙' : '🎤'}</span><b>{voice.mic === 'on' ? 'الميكروفون مفتوح' : 'فتح الميكروفون'}</b><small>{active ? `${active} يتحدثون` : voice.connectedPeers ? 'الصوت متصل' : players.length > 1 ? 'جارٍ توصيل الصوت…' : 'صوت مباشر'}</small>
    </button>
    {voice.voiceError && <p role="alert">{voice.voiceError}</p>}
  </div>
}

export function OnlineLobby({ room, voice, onExit }) {
  const [copied, setCopied] = useState(false)
  const snapshot = room.snapshot
  const players = snapshot?.players ?? []
  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.room)
      setCopied(true); setTimeout(() => setCopied(false), 1600)
    } catch { setCopied(false) }
  }
  return <main className="online-room-shell" dir="rtl">
    <header><div className="online-brand"><span>♠</span><b>تكذب</b><small>طاولة مباشرة</small></div><button onClick={onExit}>خروج ↗</button></header>
    <section className="online-room-card">
      <div className="room-code-block"><span>رمز الطاولة</span><strong dir="ltr">{room.room}</strong><button onClick={copyCode}>{copied ? 'تم النسخ ✓' : 'نسخ الرمز'}</button></div>
      <div className={`connection-state ${room.connection}`}><i />{room.connection === 'connected' ? 'متصل بالخادم' : room.connection === 'reconnecting' ? 'نعيد الاتصال…' : room.connection === 'closed' ? 'تعذر الدخول إلى الطاولة' : 'جارٍ الاتصال…'}</div>
      {room.error && <p className="room-error" role="alert">{room.error}</p>}
      <div className="online-roster">{players.map((player, index) => <article key={player.id} className={!player.connected ? 'offline' : ''}>
        <span className="online-avatar">{['♠','♦','♣','♥'][player.avatar - 1]}</span><div><b>{player.name}</b><small>{index === 0 ? `أنت${player.isHost ? ' · المضيف' : ''}` : player.isHost ? 'المضيف' : `لاعب ${index + 1}`}</small></div>
        <em>{player.micOn ? '🎙' : player.connected ? 'جاهز ✓' : 'منقطع'}</em>
      </article>)}</div>
      {players.length < 4 && <p className="waiting-copy">شارك الرمز مع أصدقائك · {players.length}/4</p>}
      <VoiceControls voice={voice} players={players} />
      {snapshot?.isHost ? <button className="online-start" disabled={players.length < 2 || players.some(player => !player.connected)} onClick={room.start}>ابدأ الجولة <small>{players.length < 2 ? 'بانتظار لاعب آخر' : `${players.length} لاعبين متصلين`}</small></button>
        : <div className="host-wait">بانتظار المضيف لبدء الجولة…</div>}
    </section>
    <footer><span>المزامنة محمية من الخادم</span><span>VOICE + REALTIME</span></footer>
    <LandscapeNotice />
  </main>
}
