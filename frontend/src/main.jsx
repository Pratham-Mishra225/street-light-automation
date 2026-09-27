import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const DEFAULT_STATE = {
  source: 'waiting-for-8086',
  ambient: 3,
  vehicle: 1,
  position: 3,
  lights: [1, 2, 2, 2, 1],
  power: 220,
  conventional: 300,
  energySavedPercent: 27,
  mode: 'FULL',
  sequence: 0,
  timestamp: null,
  rawState: '',
};

const AMBIENT = {
  1: { label: 'Day', icon: 'sun', subtitle: 'High ambient light' },
  2: { label: 'Dusk', icon: 'sunset', subtitle: 'Transition period' },
  3: { label: 'Night', icon: 'moon', subtitle: 'Low ambient light' },
};

const LIGHT = {
  0: { label: 'OFF', className: 'off', color: 'red', watts: 0 },
  1: { label: 'DIM', className: 'dim', color: 'yellow', watts: 20 },
  2: { label: 'FULL', className: 'full', color: 'green', watts: 60 },
};

function Icon({ name, size = 18, strokeWidth = 1.8 }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
  };

  const paths = {
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></>,
    sunset: <><path d="M3 18h18"/><path d="M5 14h14"/><path d="m7 10 5-5 5 5"/><path d="M12 5v9"/><path d="M4 18a8 8 0 0 1 16 0"/></>,
    moon: <path d="M20.8 15.2A8.5 8.5 0 1 1 8.8 3.2 6.8 6.8 0 0 0 20.8 15.2Z"/>,
    car: <><path d="m5 16 1.3-5.2A2 2 0 0 1 8.24 9h7.52a2 2 0 0 1 1.94 1.8L19 16"/><path d="M4 16h16v3H4z"/><circle cx="7" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/><path d="M8 12h8"/></>,
    bolt: <path d="m13 2-9 12h7l-1 8 9-12h-7l1-8Z"/>,
    cpu: <><rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3"/><path d="M15 1v3"/><path d="M9 20v3"/><path d="M15 20v3"/><path d="M20 9h3"/><path d="M20 14h3"/><path d="M1 9h3"/><path d="M1 14h3"/></>,
    activity: <><path d="M3 12h4l2.2-7 4.6 14L16 12h5"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    alert: <><path d="M10.3 3.3 2.6 17a2 2 0 0 0 1.75 3h15.3A2 2 0 0 0 21.4 17L13.7 3.3a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></>,
    radio: <><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8a6 6 0 0 1 0 8.4"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4"/><path d="M19 5a10 10 0 0 1 0 14"/><path d="M5 5a10 10 0 0 0 0 14"/></>,
    refresh: <><path d="M20 11a8.1 8.1 0 0 0-14.9-4.3L3 9"/><path d="M3 4v5h5"/><path d="M4 13a8.1 8.1 0 0 0 14.9 4.3L21 15"/><path d="M21 20v-5h-5"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 10v6"/><path d="M12 7h.01"/></>,
  };

  return <svg {...common}>{paths[name]}</svg>;
}

function ambientLabel(value) {
  return AMBIENT[value]?.label ?? 'Unknown';
}

function createDemoState(ambient, vehicle, position) {
  const lights = new Array(5).fill(0);
  if (ambient >= 2) lights.fill(1);

  if (ambient === 3 && vehicle === 1) {
    const center = position - 1;
    for (const index of [center - 1, center, center + 1]) {
      if (index >= 0 && index < 5) lights[index] = 2;
    }
  }

  const power = lights.reduce((sum, level) => sum + LIGHT[level].watts, 0);
  const mode = lights.includes(2) ? 'FULL' : lights.includes(1) ? 'DIM' : 'OFF';

  return {
    ...DEFAULT_STATE,
    source: 'frontend-demo',
    ambient,
    vehicle,
    position: vehicle ? position : 0,
    lights,
    power,
    energySavedPercent: Math.round(((300 - power) / 300) * 100),
    mode,
    sequence: 0,
    timestamp: new Date().toISOString(),
    rawState: [
      `AMBIENT=${ambient}`,
      `VEHICLE=${vehicle}`,
      `POSITION=${vehicle ? position : 0}`,
      `LIGHTS=${lights.join('')}`,
      `POWER=${String(power).padStart(3, '0')}`,
      `MODE=${mode}`,
      'SEQ=0000',
      'END',
    ].join('\n'),
  };
}

function App() {
  const [liveState, setLiveState] = useState(DEFAULT_STATE);
  const [connected, setConnected] = useState(false);
  const [mode, setMode] = useState('live');
  const [demoAmbient, setDemoAmbient] = useState(3);
  const [demoVehicle, setDemoVehicle] = useState(1);
  const [demoPosition, setDemoPosition] = useState(3);
  const [lastUpdate, setLastUpdate] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let timer;

    const poll = async () => {
      try {
        const response = await fetch('http://localhost:5178/api/state', { cache: 'no-store' });
        if (!response.ok) throw new Error('Bridge unavailable');
        const data = await response.json();
        if (!cancelled) {
          setLiveState(data);
          const isConnected = data.source === '8086emu' && !data.error;
          setConnected(isConnected);
          if (isConnected) setLastUpdate(new Date());
        }
      } catch {
        if (!cancelled) setConnected(false);
      } finally {
        if (!cancelled) timer = window.setTimeout(poll, 700);
      }
    };

    poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  const demoState = useMemo(
    () => createDemoState(demoAmbient, demoVehicle, demoPosition),
    [demoAmbient, demoVehicle, demoPosition]
  );

  const state = mode === 'demo' ? demoState : liveState;
  const ambient = AMBIENT[state.ambient];
  const lights = Array.isArray(state.lights) && state.lights.length === 5 ? state.lights : [0, 0, 0, 0, 0];
  const fullCount = lights.filter((light) => light === 2).length;
  const dimCount = lights.filter((light) => light === 1).length;
  const activeCount = lights.filter(Boolean).length;
  const powerPercent = Math.round((state.power / state.conventional) * 100);

  return (
    <div className={`app ambient-${state.ambient || 3}`}>
      <header className="header shell">
        <div className="brand">
          <div className="brand-mark"><Icon name="cpu" size={21} /></div>
          <div>
            <div className="kicker">8086 MICROPROCESSOR MINI PROJECT</div>
            <h1>Smart Street Light Automation</h1>
            <p>Ambient + vehicle-aware adaptive lighting</p>
          </div>
        </div>

        <div className="header-status">
          <div className={`link-status ${connected && mode === 'live' ? 'online' : 'offline'}`}>
            <span className="status-dot" />
            {mode === 'demo' ? 'FRONTEND DEMO' : connected ? '8086 LINKED' : 'WAITING FOR 8086'}
          </div>
          <div className="seq-chip">SEQ {String(state.sequence || 0).padStart(4, '0')}</div>
        </div>
      </header>

      <main className="shell content">
        <section className="hero-grid">
          <div className="hero-copy">
            <div className="hero-tag"><span /><span /> SOFTWARE SIMULATION</div>
            <h2>Let the 8086 decide.<br /><em>See the road respond.</em></h2>
            <p className="hero-description">
              EMU8086 processes the ambient condition and vehicle position, then writes the lighting decision to <code>STATE.TXT</code>. This interface visualizes that decision in real time.
            </p>
            <div className="source-line">
              <Icon name="radio" size={15} />
              <span>{mode === 'live' ? 'Live state from Node bridge' : 'Local frontend demonstration'}</span>
            </div>
          </div>

          <div className="hero-state card">
            <div className="section-heading compact">
              <div>
                <span className="section-eyebrow">CURRENT CONDITION</span>
                <h3>{ambientLabel(state.ambient)}</h3>
              </div>
              <div className="ambient-icon"><Icon name={ambient?.icon || 'moon'} size={25} /></div>
            </div>
            <div className="condition-grid">
              <div className="condition-cell">
                <span>Vehicle</span>
                <strong>{state.vehicle ? 'Detected' : 'Clear road'}</strong>
                <small>{state.vehicle ? `Zone L${state.position}` : 'No activation zone'}</small>
              </div>
              <div className="condition-cell">
                <span>Lighting mode</span>
                <strong className={`mode-text ${String(state.mode).toLowerCase()}`}>{state.mode}</strong>
                <small>{fullCount} full · {dimCount} dim</small>
              </div>
            </div>
          </div>
        </section>

        <section className="toolbar card">
          <div className="toolbar-copy">
            <span className="section-eyebrow">DEMONSTRATION MODE</span>
            <strong>{mode === 'live' ? 'Live EMU8086 state' : 'Interactive frontend simulation'}</strong>
          </div>
          <div className="segmented">
            <button className={mode === 'live' ? 'selected' : ''} onClick={() => setMode('live')}>
              <Icon name="radio" size={15} /> Live
            </button>
            <button className={mode === 'demo' ? 'selected' : ''} onClick={() => setMode('demo')}>
              <Icon name="activity" size={15} /> Demo
            </button>
          </div>
        </section>

        {mode === 'demo' && (
          <section className="demo-controls card">
            <div className="demo-group">
              <span className="section-eyebrow">AMBIENT</span>
              <div className="control-row">
                {[1, 2, 3].map((value) => (
                  <button key={value} onClick={() => setDemoAmbient(value)} className={demoAmbient === value ? 'active' : ''}>
                    <Icon name={AMBIENT[value].icon} size={15} /> {AMBIENT[value].label}
                  </button>
                ))}
              </div>
            </div>
            <div className="demo-group">
              <span className="section-eyebrow">VEHICLE</span>
              <div className="control-row">
                <button onClick={() => setDemoVehicle(0)} className={demoVehicle === 0 ? 'active' : ''}>No vehicle</button>
                <button onClick={() => setDemoVehicle(1)} className={demoVehicle === 1 ? 'active' : ''}><Icon name="car" size={15} /> Detected</button>
              </div>
            </div>
            {demoVehicle === 1 && (
              <div className="demo-group">
                <span className="section-eyebrow">VEHICLE POSITION</span>
                <div className="position-controls">
                  {[1, 2, 3, 4, 5].map((position) => (
                    <button key={position} onClick={() => setDemoPosition(position)} className={demoPosition === position ? 'active' : ''}>L{position}</button>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        <section className="scene-card card">
          <div className="section-heading">
            <div>
              <span className="section-eyebrow">LIVE ROAD VIEW</span>
              <h3>Adaptive lighting zone</h3>
            </div>
            <div className="legend">
              {Object.entries(LIGHT).map(([level, meta]) => (
                <span key={level}><i className={`legend-light ${meta.className}`} /> {meta.label}</span>
              ))}
            </div>
          </div>

          <div className="scene">
            <div className="stars" />
            <div className="buildings" />
            <div className="horizon-glow" />
            <div className="road-surface">
              <div className="road-edge top" />
              <div className="road-edge bottom" />
              <div className="road-dashes" />
            </div>

            {state.vehicle === 1 && (
              <div className="vehicle-track" style={{ left: `${8 + Math.max(0, Math.min(4, state.position - 1)) * 21}%` }}>
                <div className="vehicle-zone-line" />
                <div className="vehicle-car">
                  <div className="car-light front" />
                  <div className="car-body"><Icon name="car" size={27} strokeWidth={1.65} /></div>
                  <div className="car-light rear" />
                </div>
                <span className="vehicle-label">VEHICLE · L{state.position}</span>
              </div>
            )}

            <div className="lamps-row">
              {lights.map((level, index) => {
                const meta = LIGHT[level] || LIGHT[0];
                const isVehicleZone = state.vehicle === 1 && state.ambient === 3 && Math.abs((index + 1) - state.position) <= 1;
                return (
                  <div className={`lamp ${meta.className} ${isVehicleZone ? 'zone-active' : ''}`} key={index}>
                    <div className="lamp-light-beam" />
                    <div className="lamp-arm" />
                    <div className="lamp-head"><span /></div>
                    <div className="lamp-pole" />
                    <div className="lamp-base" />
                    <div className="lamp-caption">
                      <strong>L{index + 1}</strong>
                      <span>{meta.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="scene-footer">
              <span>Ambient: {ambient?.label || '—'}</span>
              <span>{state.vehicle ? `Vehicle zone: L${state.position}` : 'Road clear'}</span>
              <span>Output: {state.mode}</span>
            </div>
          </div>
        </section>

        <section className="metric-grid">
          <Metric label="Current power" value={`${state.power} W`} note={`${activeCount} active lamps`} progress={powerPercent} icon="bolt" />
          <Metric label="Conventional load" value={`${state.conventional} W`} note="5 lamps at full power" progress={100} icon="activity" />
          <Metric label="Energy saved" value={`${state.energySavedPercent}%`} note="versus conventional" progress={state.energySavedPercent} icon="check" />
          <Metric label="8086 link" value={mode === 'demo' ? 'DEMO' : connected ? 'LIVE' : 'OFFLINE'} note={mode === 'demo' ? 'local simulation' : 'STATE.TXT bridge'} icon="cpu" />
        </section>

        <section className="logic-grid">
          <div className="card logic-card">
            <div className="section-heading">
              <div>
                <span className="section-eyebrow">DECISION LOGIC</span>
                <h3>What the 8086 is doing</h3>
              </div>
              <Icon name="cpu" size={20} />
            </div>
            <div className="logic-chain">
              <LogicStep number="01" title="Read ambient" value={ambientLabel(state.ambient)} />
              <LogicStep number="02" title="Read vehicle" value={state.vehicle ? `Detected @ L${state.position}` : 'No vehicle'} />
              <LogicStep number="03" title="Set 5 lamp states" value={lights.map((l) => LIGHT[l]?.label).join(' · ')} />
              <LogicStep number="04" title="Calculate power" value={`${state.power} W`} last />
            </div>
          </div>

          <div className="card state-card">
            <div className="section-heading">
              <div>
                <span className="section-eyebrow">8086 OUTPUT</span>
                <h3>STATE.TXT</h3>
              </div>
              <div className={`mini-status ${connected || mode === 'demo' ? 'good' : 'muted'}`}><span /> {mode === 'demo' ? 'DEMO' : connected ? 'READING' : 'WAITING'}</div>
            </div>
            <pre>{state.rawState || formatRawState(state)}</pre>
            <div className="state-foot">
              <span><Icon name="refresh" size={13} /> Polling every 700 ms</span>
              <span>{lastUpdate ? `Last live update ${lastUpdate.toLocaleTimeString()}` : 'Awaiting live update'}</span>
            </div>
          </div>
        </section>

        <section className="explain card">
          <div className="explain-icon"><Icon name="info" size={20} /></div>
          <div>
            <strong>Project principle</strong>
            <p>Ambient light controls the baseline. At night, the 8086 raises the vehicle's current lamp and its immediate neighbours to FULL while the remaining lamps stay DIM, reducing unnecessary power consumption.</p>
          </div>
        </section>
      </main>

      <footer className="footer shell">
        <span>8086-Based Ambient + Vehicle-Aware Street Light Automation</span>
        <span>Software-only demonstration · EMU8086 + React</span>
      </footer>
    </div>
  );
}

function Metric({ label, value, note, progress, icon }) {
  return (
    <div className="card metric-card">
      <div className="metric-top">
        <span>{label}</span>
        <div className="metric-icon"><Icon name={icon} size={16} /></div>
      </div>
      <strong className="metric-value">{value}</strong>
      <small>{note}</small>
      {typeof progress === 'number' && (
        <div className="progress-track"><span style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} /></div>
      )}
    </div>
  );
}

function LogicStep({ number, title, value, last }) {
  return (
    <div className={`logic-step ${last ? 'last' : ''}`}>
      <div className="logic-number">{number}</div>
      <div className="logic-text"><span>{title}</span><strong>{value}</strong></div>
    </div>
  );
}

function formatRawState(state) {
  return [
    `AMBIENT=${state.ambient}`,
    `VEHICLE=${state.vehicle}`,
    `POSITION=${state.position}`,
    `LIGHTS=${(state.lights || [0, 0, 0, 0, 0]).join('')}`,
    `POWER=${String(state.power || 0).padStart(3, '0')}`,
    `MODE=${state.mode || 'OFF'}`,
    `SEQ=${String(state.sequence || 0).padStart(4, '0')}`,
    'END',
  ].join('\n');
}

createRoot(document.getElementById('root')).render(<App />);
