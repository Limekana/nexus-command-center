/* ─── Nexus Command Center — minimal screens to demo the unlock ─── */
const { useState, useEffect, useRef } = React;

const C = {
  bg:        '#05080D',
  surface:   '#0E141C',
  surface2:  '#141C26',
  border:    '#1F2A37',
  borderHi:  '#22D3EE33',
  primary:   '#22D3EE',
  primaryD:  '#0891B2',
  text:      '#E6EDF3',
  textMuted: '#7D8590',
  success:   '#3FB950',
  warning:   '#FFB800',
  danger:    '#FF6B6B',
};

/* ── LOCK SCREEN ─────────────────────────────────────────────── */
function LockScreen({ onUnlock }) {
  const [pin, setPin] = useState('');
  const [shake, setShake] = useState(false);
  const press = (v) => {
    if (v === 'bio') return onUnlock('bio');
    if (v === 'del') return setPin(p => p.slice(0, -1));
    if (pin.length >= 6) return;
    const next = pin + v;
    setPin(next);
    if (next.length === 6) {
      setTimeout(() => onUnlock('pin'), 120);
    }
  };

  const Pip = ({ filled }) => (
    <div style={{
      width: 14, height: 14, borderRadius: 99,
      border: `1.5px solid ${filled ? C.primary : '#3A4654'}`,
      background: filled ? C.primary : 'transparent',
      boxShadow: filled ? `0 0 10px ${C.primary}` : 'none',
      transition: 'all .15s',
    }} />
  );

  const Key = ({ label, sub, onClick }) => (
    <button
      onClick={onClick}
      style={{
        height: 64, borderRadius: 14,
        background: C.surface, border: `1px solid ${C.border}`,
        color: C.text, fontSize: 26, fontWeight: 300,
        fontFamily: '"Space Grotesk", system-ui, sans-serif',
        letterSpacing: '-0.02em', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {sub ? <span style={{ fontSize: 12, fontWeight: 500, letterSpacing: '.08em', color: C.textMuted }}>{label}</span> : label}
    </button>
  );

  return (
    <div
      data-screen="lock"
      style={{
      position: 'absolute', inset: 0,
      background: C.bg, color: C.text,
      display: 'flex', flexDirection: 'column',
      padding: '60px 28px 24px', boxSizing: 'border-box',
      fontFamily: '"Inter", system-ui, sans-serif',
    }}>
      {/* Heading */}
      <div style={{ textAlign: 'center', marginTop: 40 }}>
        <div style={{
          fontSize: 11, letterSpacing: '.32em', color: C.textMuted,
          fontFamily: '"Space Grotesk", system-ui, sans-serif', fontWeight: 500,
        }}>
          NEXUS COMMAND CENTER
        </div>
        <div style={{
          fontSize: 30, fontWeight: 600, marginTop: 10,
          fontFamily: '"Space Grotesk", system-ui, sans-serif',
          letterSpacing: '-0.02em',
        }}>
          Secure Access
        </div>
        <div style={{
          fontSize: 12, color: C.textMuted, marginTop: 6,
          letterSpacing: '.08em',
        }}>
          AES-256 · TLS 1.3
        </div>
      </div>

      {/* Bio target */}
      <div style={{
        margin: '34px auto 26px',
        width: 96, height: 96, borderRadius: 99,
        border: `2px solid ${C.primary}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `radial-gradient(circle, ${C.primary}20 0%, transparent 70%)`,
        boxShadow: `0 0 32px ${C.primary}40, inset 0 0 14px ${C.primary}33`,
        cursor: 'pointer',
        animation: 'pulseRing 2.4s ease-in-out infinite',
      }}
        onClick={() => onUnlock('bio')}
      >
        <span style={{ fontSize: 36 }}>👆</span>
      </div>

      <div style={{ textAlign: 'center', fontSize: 13, color: C.textMuted, marginBottom: 28 }}>
        Tap fingerprint or enter PIN
      </div>

      {/* PIN pips */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginBottom: 22 }}>
        {[0, 1, 2, 3, 4, 5].map(i => <Pip key={i} filled={i < pin.length} />)}
      </div>

      {/* Keypad */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 10, marginTop: 'auto',
      }}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
          <Key key={n} label={n} onClick={() => press(String(n))} />
        ))}
        <Key label="Bio" sub onClick={() => press('bio')} />
        <Key label="0" onClick={() => press('0')} />
        <Key label="⌫" onClick={() => press('del')} />
      </div>

      <div style={{ textAlign: 'center', fontSize: 11, color: C.textMuted, marginTop: 18, letterSpacing: '.04em' }}>
        Forgot PIN? Reset in Settings → Clear All Data
      </div>
    </div>
  );
}

/* ── DASHBOARD (Home tab — matches the screenshot vocabulary) ── */
function Dashboard({ revealed, onLockAgain, onReplay }) {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: C.bg, color: C.text,
      display: 'flex', flexDirection: 'column',
      padding: '52px 16px 0', boxSizing: 'border-box',
      fontFamily: '"Inter", system-ui, sans-serif',
      opacity: revealed ? 1 : 0,
      transition: `opacity 500ms ease-out ${DEFAULTS_REVEAL_DELAY}ms`,
      transform: revealed ? 'scale(1)' : 'scale(1.012)',
      transitionProperty: 'opacity, transform',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 18,
      }}>
        <div style={{
          fontFamily: '"Space Grotesk", system-ui, sans-serif',
          fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em',
        }}>
          NEXUS HQ
        </div>
        <div style={{
          width: 32, height: 32, borderRadius: 99,
          background: 'transparent', border: `1.5px solid ${C.primary}`,
          color: C.primary, fontSize: 11, fontWeight: 600,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          letterSpacing: '.04em',
        }}>EH</div>
      </div>

      {/* Sync chip */}
      <div style={{
        border: `1px solid ${C.success}66`, borderRadius: 10,
        padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 8,
        fontSize: 12, color: C.success, marginBottom: 16,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: 99, background: C.success, boxShadow: `0 0 8px ${C.success}` }} />
        Local · synced 18:07 · offline-capable
      </div>

      <div style={{ fontSize: 10, letterSpacing: '.2em', color: C.textMuted, margin: '4px 0 8px' }}>
        OVERVIEW
      </div>

      {/* 2x2 stat grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 18 }}>
        <StatCard accent val="0,00 €" lbl="BUDGET LEFT" sub="No budgets set" subColor={C.success} />
        <StatCard val="—" lbl="GPA" sub="No imports yet" />
        <StatCard val="0×" lbl="WORKOUTS/WK" sub="Push harder" />
        <StatCard val="0" lbl="TASKS TODAY" sub="All on track" />
      </div>

      <div style={{ fontSize: 10, letterSpacing: '.2em', color: C.textMuted, margin: '0 0 8px' }}>
        MODULES
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 80 }}>
        <ModuleCard icon="💰" name="Finance" badge="IDLE" rows={['No budgets yet', 'No portfolio holdings']} />
        <ModuleCard icon="📚" name="Studies" badge="IDLE" rows={['No courses yet', 'Add or import to track GPA']} />
        <ModuleCard icon="💪" name="Fitness" badge="IDLE" rows={['No workouts logged', 'Tap to log your first set']} />
      </div>

      {/* Replay row — outside the design vocab so it's clearly a demo affordance */}
      <div style={{
        position: 'absolute', left: 16, right: 16, bottom: 70,
        display: 'flex', gap: 8,
      }}>
        <button onClick={onLockAgain} style={demoBtn}>↻ Lock & replay</button>
        <button onClick={onReplay} style={{ ...demoBtn, color: C.warning, borderColor: `${C.warning}66` }}>
          ⚡ Force cold-start
        </button>
      </div>

      {/* Bottom nav */}
      <BottomNav active="home" />
    </div>
  );
}

const demoBtn = {
  flex: 1, padding: '10px 12px', borderRadius: 10,
  background: C.surface, border: `1px solid ${C.borderHi}`,
  color: C.primary, fontSize: 12, fontWeight: 500,
  fontFamily: '"Inter", system-ui, sans-serif',
  cursor: 'pointer', letterSpacing: '.02em',
};

function StatCard({ val, lbl, sub, subColor, accent }) {
  return (
    <div style={{
      background: accent ? `${C.primary}0F` : C.surface,
      border: `1px solid ${accent ? C.primary + '66' : C.border}`,
      borderRadius: 12, padding: '14px 14px 12px',
      boxShadow: accent ? `0 0 24px ${C.primary}22, inset 0 0 12px ${C.primary}11` : 'none',
    }}>
      <div style={{
        fontFamily: '"Space Grotesk", system-ui, sans-serif',
        fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em',
        lineHeight: 1,
      }}>{val}</div>
      <div style={{
        fontSize: 10, letterSpacing: '.14em',
        color: C.textMuted, marginTop: 8,
      }}>{lbl}</div>
      {sub && <div style={{ fontSize: 11, color: subColor || C.textMuted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function ModuleCard({ icon, name, badge, rows }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 14, padding: '14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{
          fontFamily: '"Space Grotesk", system-ui, sans-serif',
          fontSize: 17, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 18 }}>{icon}</span> {name}
        </div>
        <div style={{
          fontSize: 10, letterSpacing: '.12em', color: C.primary,
          border: `1px solid ${C.primary}55`, borderRadius: 6, padding: '2px 8px',
        }}>{badge}</div>
      </div>
      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ fontSize: 12, color: C.textMuted, fontStyle: 'italic' }}>{r}</div>
        ))}
      </div>
    </div>
  );
}

function BottomNav({ active }) {
  const items = [
    { id: 'home', icon: '⊞', label: 'Home' },
    { id: 'finance', icon: '💰', label: 'Finance' },
    { id: 'studies', icon: '📚', label: 'Studies' },
    { id: 'fitness', icon: '💪', label: 'Fitness' },
    { id: 'tasks', icon: '✅', label: 'Tasks' },
  ];
  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, bottom: 0,
      background: C.bg, borderTop: `1px solid ${C.border}`,
      display: 'flex', justifyContent: 'space-around',
      padding: '8px 0 14px',
    }}>
      {items.map(it => (
        <div key={it.id} style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
          color: active === it.id ? C.primary : C.textMuted,
          fontSize: 10,
        }}>
          <div style={{
            width: 36, height: 32, borderRadius: 10,
            border: active === it.id ? `1px solid ${C.primary}` : `1px solid transparent`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16,
          }}>{it.icon}</div>
          <div style={{ letterSpacing: '.04em', fontWeight: 500 }}>{it.label}</div>
        </div>
      ))}
    </div>
  );
}

// Make accessible from the unlock-flow file:
const DEFAULTS_REVEAL_DELAY = 220;
window.LockScreen = LockScreen;
window.Dashboard = Dashboard;
window.NexusColors = C;
