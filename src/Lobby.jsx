import { Suspense, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Clone, Html, OrbitControls, useGLTF } from '@react-three/drei'
import './Lobby.css'
import { cleanRoomCode, createRoomCode } from './multiplayerProtocol'

const characters = ['الهادئ', 'الواثق', 'المخضرم', 'الغامض']
const defaultPlayers = [{ name: 'أنت', avatar: 1 }, { name: 'آدم', avatar: 2 }, { name: 'رامي', avatar: 3 }, { name: 'سامي', avatar: 4 }]

function Character({ avatar }) {
  const { scene } = useGLTF(`/models/avatar${avatar}-preview.glb`)
  return <Clone object={scene} scale={1.65} rotation={[0, -.18, 0]} />
}

export function LandscapeNotice() {
  return <div className="landscape-notice" role="status" dir="rtl"><span aria-hidden="true">▯ ↻ ▭</span><h2>اقلب الهاتف وقرّب الكرسي</h2><p>الطاولة أجمل بالوضع الأفقي.</p></div>
}

export function Lobby({ onStart, onMultiplayer, initial }) {
  const [screen, setScreen] = useState(initial ? 'lobby' : 'home')
  const [players, setPlayers] = useState(initial ? [...initial.players, ...defaultPlayers.slice(initial.players.length)] : defaultPlayers)
  const [count, setCount] = useState(initial?.playerCount ?? 4)
  const [help, setHelp] = useState(false)
  const [roomCode, setRoomCode] = useState('')
  const selected = players[0].avatar
  const updatePlayer = (id, change) => setPlayers(current => current.map((p, i) => i === id ? { ...p, ...change } : p))
  const start = () => {
    const roster = players.slice(0, count).map((p, i) => ({ ...p, avatar: (selected - 1 + i) % 4 + 1, name: p.name.trim().slice(0, 20) || defaultPlayers[i].name }))
    onStart({ playerCount: count, players: roster })
  }
  return <main className="lobby-shell" dir="rtl">
    <header className="lobby-header"><a href="#" className="lobby-brand" onClick={e => { e.preventDefault(); setScreen('home') }} aria-label="الشاشة الرئيسية"><span>♠</span> تكذب</a><span className="edition">طاولة الخداع · جلسة محلية</span><button className="quiet-button" onClick={() => setHelp(true)}>طريقة اللعب ؟</button></header>
    <section className={`character-stage ${screen !== 'avatar' ? 'card-stage' : ''}`} aria-label={screen === 'avatar' ? 'معاينة الشخصية ثلاثية الأبعاد' : 'طاولة الخداع'}>
      <div className="stage-orbit" /><div className="stage-word" aria-hidden="true">♠</div>
      {screen === 'avatar' ? <Canvas dpr={[1, 1.5]} camera={{ position: [1.85, 1.65, 3.1], fov: 35 }} aria-label={`شخصية ${characters[selected - 1]} ثلاثية الأبعاد، اسحب لتدويرها`}>
        <ambientLight intensity={1.5} /><directionalLight position={[3, 5, 4]} intensity={3} color="#ffe6be" /><pointLight position={[-3, 2, 1]} intensity={12} color="#7cc9bd" />
        <Suspense fallback={<Html center><span className="preview-loading">نحضّر شخصيتك…</span></Html>}><Character key={selected} avatar={selected} /></Suspense>
        <OrbitControls target={[0, .86, .12]} enablePan={false} enableZoom={false} minPolarAngle={1.05} maxPolarAngle={1.6} minAzimuthAngle={-.8} maxAzimuthAngle={.8} />
      </Canvas> : <div className="title-art" aria-hidden="true"><div className="art-halo" /><div className="art-card art-back">♦</div><div className="art-card art-front"><small>A</small><strong>♠</strong><small>A</small></div><div className="art-chip">تكذب</div><p>ورقك لا يقول كل شيء.</p></div>}
      {screen === 'avatar' && <div className="character-caption"><span>شخصيتك على الطاولة</span><h2>{characters[selected - 1]}</h2><small>اسحب لتدور حول الشخصية</small></div>}

    </section>
    <section className="lobby-panel">
      {screen === 'home' ? <div className="home-content">
        <div className="eyebrow"><i /> الورق في يدك. السر في وجهك.</div>
        <h1>تكذب<span>خلّهم يصدّقونك.</span></h1>
        <p className="home-description">ادّعِ بثقة. اكشف الخدعة.<br />واخرج من الطاولة بلا أوراق.</p>
        <button className="gold-button" onClick={() => setScreen('lobby')}><span>إنشاء طاولة محلية<small>أنت + خصوم آليون · من 2 إلى 4 لاعبين</small></span><b aria-hidden="true">←</b></button>
        <div className="home-secondary-actions">
          <button className="home-avatar-button" onClick={() => setScreen('avatar')}><span>اختيار الشخصية<small>{characters[selected - 1]}</small></span><em aria-hidden="true">♠</em></button>
          <button className="online-soon" onClick={() => setScreen('online')}><span>اللعب مع الأصدقاء<small>طاولة مباشرة + محادثة صوتية</small></span><em>متصل</em></button>
        </div>
        <div className="home-footnote">52 ورقة <span>◇</span> 4 شخصيات <span>◇</span> وجه واحد لا يكذب؟</div>
      </div> : screen === 'avatar' ? <div className="avatar-content">
        <span className="eyebrow">اختر وجهك على الطاولة</span><h1>شخصيتك.</h1><p className="home-description">أربع شخصيات. اختر من يمثّلك.</p>
        <div className="avatar-options" role="group" aria-label="اختر شخصيتك">{characters.map((name, index) => <button key={name} aria-pressed={selected === index + 1} onClick={() => updatePlayer(0, { avatar: index + 1 })}><span>{['♠','♦','♣','♥'][index]}</span><b>{name}</b><small>{selected === index + 1 ? 'تم الاختيار ✓' : String(index + 1).padStart(2,'0')}</small></button>)}</div>
        <button className="gold-button" onClick={() => setScreen('home')}><span>اعتماد الشخصية<small>{characters[selected - 1]}</small></span><b>✓</b></button>
      </div> : screen === 'online' ? <form className="online-entry" onSubmit={event => { event.preventDefault(); if (roomCode.length >= 4) onMultiplayer({ room: roomCode, name: players[0].name, avatar: selected }) }}>
        <div className="setup-heading"><div><span className="eyebrow">طاولة مباشرة</span><h1>العب مع أصدقائك.</h1></div><button type="button" className="quiet-button" onClick={() => setScreen('home')}>رجوع ↗</button></div>
        <label className="online-name"><span>اسمك</span><input value={players[0].name} maxLength={20} onChange={event => updatePlayer(0, { name: event.target.value })} /></label>
        <button type="button" className="gold-button" onClick={() => onMultiplayer({ room: createRoomCode(), name: players[0].name, avatar: selected })}><span>إنشاء طاولة جديدة<small>سيظهر لك رمز لدعوة أصدقائك</small></span><b>＋</b></button>
        <div className="online-divider"><span>أو انضم برمز</span></div>
        <div className="join-code"><input dir="ltr" aria-label="رمز الطاولة" autoComplete="off" inputMode="text" placeholder="ABC123" maxLength={6} value={roomCode} onChange={event => setRoomCode(cleanRoomCode(event.target.value))} /><button disabled={roomCode.length < 4}>انضم ←</button></div>
        <p className="online-note">من 2 إلى 4 لاعبين · مزامنة مباشرة · صوت اختياري</p>
      </form> : <div className="setup-content">
        <div className="setup-heading"><div><span className="eyebrow">جهّز جلستك</span><h1>طاولتك، على كيفك.</h1></div><button className="quiet-button" onClick={() => setScreen('home')}>رجوع ↗</button></div>
        <div className="count-row"><span>عدد اللاعبين <small>يشملك أنت</small></span><div role="group" aria-label="عدد اللاعبين">{[2, 3, 4].map(n => <button key={n} aria-pressed={count === n} onClick={() => setCount(n)}>{n}</button>)}</div></div>
        <div className="roster">{players.slice(0, count).map((player, i) => <label key={i} className={`roster-row ${i === 0 ? 'human-seat' : ''}`}><span className="seat-number">{String(i + 1).padStart(2, '0')}</span><span className="roster-name"><small>{i === 0 ? 'أنت · المضيف' : 'خصم آلي'}</small><input aria-label={i === 0 ? 'اسمك في اللعبة' : `اسم الخصم ${i}`} maxLength={20} value={player.name} onChange={e => updatePlayer(i, { name: e.target.value })} /></span><span className="ready-label">جاهز ✓</span></label>)}</div>
        <button className="gold-button start-button" onClick={start}><span>ابدأ اللعب<small>{count} لاعبين · جولة محلية</small></span><b aria-hidden="true">←</b></button>
        <p className="setup-note">كل المقاعد الأخرى خصوم آليون. الإنترنت قريبًا.</p>
      </div>}
    </section>
    <footer className="lobby-footer"><span>لعبة ورق. قراءة وجوه.</span></footer>
    {help && <div className="help-backdrop" onClick={() => setHelp(false)}><section className="help-sheet" role="dialog" aria-modal="true" aria-label="طريقة اللعب" onClick={e => e.stopPropagation()}><button autoFocus className="quiet-button" onClick={() => setHelp(false)}>إغلاق ×</button><h2>العبها بوجه ثابت.</h2><ol><li>اختر رتبة الجولة، ثم ضع من ورقة إلى ثلاث مقلوبة.</li><li>الرتبة تبقى نفسها. يمكنك قول الحقيقة أو الخداع.</li><li>قل «أنت تكذب!» لكشف الأوراق. الخاسر يسحب الطاولة.</li><li>تخلّص من أوراقك أولًا لتفوز.</li></ol></section></div>}
    <LandscapeNotice />
  </main>
}
