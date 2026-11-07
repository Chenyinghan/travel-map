import { useEffect, useMemo, useRef, useState } from 'react';
import { geoAzimuthalEqualArea, geoPath } from 'd3-geo';
import { formatVisit, plural, visitSortKey } from '../lib/store.js';
import { groupLabel } from '../lib/geo.js';

// Opens when you click a lit region: a close-up of its outline, with a flag for each dated trip and a
// pin for each trip without a date. Clicking a flag or pin opens that trip's photos.

const FLAG_H = 40; // flagpole height
const PAD = 30;

const timesText = (n) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);
const flagWidth = (label) => Math.round(label.length * 6.7 + 18);

export default function Spotlight({ region, features, litSet, place, onClose, onOpenTrip, onSwitch }) {
  const rootRef = useRef(null);
  const headRef = useRef(null);
  const footRef = useRef(null);
  const [size, setSize] = useState(null);
  const [hot, setHot] = useState(null);
  const [notice, setNotice] = useState(null);

  // The map fills the whole overlay, with the title and the trip strip floating on top; the outline is
  // fitted into the space between them
  useEffect(() => {
    const measure = () => {
      const el = rootRef.current;
      const w = el.clientWidth;
      const h = el.clientHeight;
      const top = headRef.current.offsetHeight;
      const bottom = footRef.current.offsetHeight;
      if (w > 40 && h > 40)
        setSize((s) => (s && s.w === w && s.h === h && s.top === top && s.bottom === bottom ? s : { w, h, top, bottom }));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(rootRef.current);
    ro.observe(footRef.current);
    measure();
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setHot(null);
    setNotice(null);
  }, [region.id]);

  // One marker per trip: with a year → flag (in date order, left to right); without a year → pin
  const markers = useMemo(() => {
    const visits = place?.visits || [];
    const dated = visits.filter((v) => v.year).sort((a, b) => visitSortKey(a) - visitSortKey(b));
    const undated = visits.filter((v) => !v.year);
    const list = [
      ...dated.map((v) => ({ id: v.id, kind: 'flag', label: formatVisit(v), visit: v })),
      ...undated.map((v) => ({ id: v.id, kind: 'pin', label: 'Date unknown', visit: v })),
    ];
    if (!list.length) list.push({ id: '_none', kind: 'pin', label: 'Visited', visit: null });
    return list;
  }, [place]);

  const geo = useMemo(() => {
    if (!size) return null;
    const { w, h, top, bottom } = size;
    const feature = features.find((f) => f.properties.id === region.id);
    if (!feature) return null;
    // Equal-area azimuthal projection centered on the region: no region is distorted or cut in two,
    // including ones that cross the 180° meridian
    const proj = geoAzimuthalEqualArea()
      .rotate([-region.lx, -region.ly])
      .clipAngle(90)
      .fitExtent(
        [
          [PAD, top + FLAG_H + 8],
          [w - PAD, h - bottom - 12],
        ],
        feature
      );
    proj.clipExtent([
      [0, 0],
      [w, h],
    ]);
    const path = geoPath(proj);
    const d = path(feature);
    const context = [];
    for (const f of features) {
      if (f === feature) continue;
      const cd = path(f);
      if (cd) context.push({ id: f.properties.id, d: cd, lit: litSet.has(f.properties.id), selectable: f.properties.selectable });
    }
    const anchor = proj([region.lx, region.ly]) || [w / 2, h / 2];
    const points = placeMarkers(d, w, markers.length, anchor, top + FLAG_H + 4, h - bottom - 6);
    return { d, context, points };
  }, [size, region, features, litSet, markers.length]);

  const visits = place?.visits || [];
  const photoTotal = visits.reduce((n, v) => n + (v.photos?.length || 0), 0);
  const hotMarker = markers.find((m) => m.id === hot);

  const open = (m) => {
    if (m.visit?.photos?.length) {
      onOpenTrip(m.visit);
      return;
    }
    setHot(m.id);
    setNotice(m.visit ? `No photos from ${m.kind === 'flag' ? m.label : 'this trip'} yet` : 'No trips recorded yet');
  };

  return (
    <div className="spotlight" role="dialog" aria-label={`${region.n} trips`} ref={rootRef}>
      <div className="sp-head" ref={headRef}>
        <div>
          <div className="sp-group">{groupLabel(region)}</div>
          <h2>{region.n}</h2>
          <div className="sp-sub">
            {visits.length ? `Visited ${timesText(visits.length)}` : 'Visited'}
            {photoTotal ? ` · ${plural(photoTotal, 'photo')}` : ''}
          </div>
        </div>
        <button className="sp-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      <div className="sp-map">
        {size && geo && (
          <svg width={size.w} height={size.h} className="sp-svg" key={region.id}>
            <defs>
              <radialGradient id="spOcean" cx="50%" cy="50%" r="75%">
                <stop offset="0%" stopColor="#0f2142" />
                <stop offset="100%" stopColor="#060c1a" />
              </radialGradient>
              <radialGradient id="spVignette" cx="50%" cy="50%" r="72%">
                <stop offset="0%" stopColor="#050913" stopOpacity="0" />
                <stop offset="62%" stopColor="#050913" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#050913" stopOpacity="0.92" />
              </radialGradient>
              <radialGradient id="spFill" cx="42%" cy="36%" r="80%">
                <stop offset="0%" stopColor="#ffe0a0" />
                <stop offset="55%" stopColor="#f7b84b" />
                <stop offset="100%" stopColor="#d98a1c" />
              </radialGradient>
              <filter id="spGlow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="14" />
              </filter>
            </defs>
            <rect className="sp-bg" width={size.w} height={size.h} fill="url(#spOcean)" onClick={onClose} />
            <g className="sp-context">
              {geo.context.map((c) => (
                <path
                  key={c.id}
                  d={c.d}
                  className={c.lit ? 'lit' : c.selectable ? '' : 'filler'}
                  onClick={c.lit ? () => onSwitch(c.id) : undefined}
                >
                  {c.lit && <title>Open this place</title>}
                </path>
              ))}
            </g>
            <rect className="sp-vignette" width={size.w} height={size.h} fill="url(#spVignette)" />
            <path d={geo.d} className="sp-glow" filter="url(#spGlow)" />
            <path d={geo.d} className="sp-region" fill="url(#spFill)" fillRule="evenodd" />
            <path d={geo.d} className="sp-outline" pathLength="1" />
            <g className="sp-markers">
              {markers.map((m, i) => (
                <Marker
                  key={m.id}
                  m={m}
                  at={geo.points[i]}
                  delay={0.55 + i * 0.09}
                  hot={hot === m.id}
                  onHover={(on) => setHot(on ? m.id : null)}
                  onOpen={() => open(m)}
                />
              ))}
            </g>
          </svg>
        )}
      </div>

      <div className="sp-foot" ref={footRef}>
        <div className="sp-note">
          {notice ||
            (hotMarker?.visit?.note ? (
              <>
                <b>{hotMarker.label}</b> — {hotMarker.visit.note}
              </>
            ) : (
              <span className="sp-legend">
                <span>
                  <FlagIcon /> trip with a date
                </span>
                <span>
                  <PinIcon /> been there, date unknown
                </span>
                <span className="sp-tip">Tap a flag to see its photos</span>
              </span>
            ))}
        </div>
        <div className="sp-trips">
          {markers.map((m) => {
            const n = m.visit?.photos?.length || 0;
            return (
              <button
                key={m.id}
                className={'sp-trip' + (hot === m.id ? ' hot' : '') + (n ? '' : ' empty')}
                onMouseEnter={() => setHot(m.id)}
                onMouseLeave={() => setHot(null)}
                onFocus={() => setHot(m.id)}
                onClick={() => open(m)}
              >
                {m.kind === 'flag' ? <FlagIcon /> : <PinIcon />}
                <span className="sp-trip-label">{m.label}</span>
                <span className="sp-trip-meta">{n ? plural(n, 'photo') : m.visit ? 'no photos' : 'no trips yet'}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Marker({ m, at, delay, hot, onHover, onOpen }) {
  const [x, y] = at;
  const n = m.visit?.photos?.length || 0;
  const title = `${m.label} · ${n ? plural(n, 'photo') : 'no photos'}`;
  const fw = flagWidth(m.label);
  return (
    <g
      transform={`translate(${x.toFixed(1)},${y.toFixed(1)})`}
      className={`marker ${m.kind}${hot ? ' hot' : ''}${n ? '' : ' empty'}`}
      role="button"
      tabIndex={0}
      aria-label={title}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <title>{title}</title>
      <g className="m-drop" style={{ animationDelay: `${delay}s` }}>
        <g className="m-lift">
          <ellipse className="m-shadow" rx="6" ry="2" />
          {m.kind === 'flag' ? (
            <>
              <rect className="m-hit" x={-8} y={-FLAG_H - 4} width={fw + 12} height={FLAG_H + 8} />
              <line className="m-pole" x1="0" y1="0" x2="0" y2={-FLAG_H} />
              <path
                className="m-cloth"
                d={`M0 ${-FLAG_H} H${fw} L${fw - 6} ${-FLAG_H + 9.5} L${fw} ${-FLAG_H + 19} H0 Z`}
              />
              <text className="m-text" x="6" y={-FLAG_H + 13.5}>
                {m.label}
              </text>
              <circle className="m-knob" cx="0" cy={-FLAG_H} r="2.4" />
            </>
          ) : (
            <>
              <rect className="m-hit" x={-12} y={-30} width={24} height={32} />
              <path className="m-pin" d="M0 0 C-2.6 -6.5 -9.5 -11 -9.5 -18 A9.5 9.5 0 1 1 9.5 -18 C9.5 -11 2.6 -6.5 0 0 Z" />
              <circle className="m-pin-dot" cx="0" cy="-18" r="3.6" />
            </>
          )}
        </g>
      </g>
    </g>
  );
}

const FlagIcon = () => (
  <svg viewBox="0 0 14 14" className="ico" aria-hidden="true">
    <line x1="2.5" y1="1" x2="2.5" y2="13.5" stroke="currentColor" strokeWidth="1.4" />
    <path d="M2.5 1.5H12L10 4.5L12 7.5H2.5Z" fill="#ff5a4e" />
  </svg>
);
const PinIcon = () => (
  <svg viewBox="0 0 14 14" className="ico" aria-hidden="true">
    <path d="M7 13.5C6 11 2 8.5 2 5.5A5 5 0 0 1 12 5.5C12 8.5 8 11 7 13.5Z" fill="#ff5a4e" />
    <circle cx="7" cy="5.5" r="1.8" fill="#fff" />
  </svg>
);

// Pick n well-spread spots inside the region's shape (farthest-point sampling), then sort them by x so
// time runs left to right
function placeMarkers(d, w, n, anchor, yMin, yMax) {
  const ctx = document.createElement('canvas').getContext('2d');
  const shape = new Path2D(d);
  const inside = (x, y) => ctx.isPointInPath(shape, x, y, 'evenodd');
  const step = Math.max(4, Math.min(w, yMax - yMin) / 44);
  const m = step * 0.9;
  const all = [];
  const interior = [];
  for (let y = yMin; y <= yMax; y += step) {
    for (let x = 12; x <= w - 64; x += step) {
      if (!inside(x, y)) continue;
      all.push([x, y]);
      if (inside(x - m, y) && inside(x + m, y) && inside(x, y - m) && inside(x, y + m)) interior.push([x, y]);
    }
  }
  const cands = interior.length >= n ? interior : all;
  if (!cands.length) {
    return Array.from({ length: n }, (_, i) => [anchor[0] + (i - (n - 1) / 2) * 26, anchor[1]]);
  }
  // Flags are wider than tall, so horizontal distance counts for less, which spreads markers out sideways
  const dist = (a, b) => Math.hypot((a[0] - b[0]) * 0.55, a[1] - b[1]);
  let first = cands[0];
  let best = Infinity;
  for (const c of cands) {
    const dd = Math.hypot(c[0] - anchor[0], c[1] - anchor[1]);
    if (dd < best) {
      best = dd;
      first = c;
    }
  }
  const chosen = [first];
  const minD = cands.map((c) => dist(c, first));
  while (chosen.length < n) {
    let bi = -1;
    let bv = 0;
    for (let i = 0; i < cands.length; i++) {
      if (minD[i] > bv) {
        bv = minD[i];
        bi = i;
      }
    }
    if (bi < 0) break;
    const c = cands[bi];
    chosen.push(c);
    for (let i = 0; i < cands.length; i++) minD[i] = Math.min(minD[i], dist(cands[i], c));
  }
  while (chosen.length < n) chosen.push([first[0] + chosen.length * 8, first[1] + chosen.length * 6]);
  return chosen.sort((a, b) => a[0] - b[0]);
}
