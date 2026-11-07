import { useEffect, useMemo, useRef, useState } from 'react';
import { geoNaturalEarth1, geoPath, geoGraticule10 } from 'd3-geo';
import { select } from 'd3-selection';
import { zoom as d3zoom, zoomIdentity } from 'd3-zoom';
import 'd3-transition';
import { COLORS, tooltipHtml } from '../lib/theme.js';

const SPHERE = { type: 'Sphere' };
const GRATICULE = geoGraticule10();
const DOT_R = 4.5; // on-screen radius of the dots marking tiny regions (px)

export default function FlatMapView({ features, data, litSet, selectedId, onPick, focus, active, lightMode, readOnly }) {
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const gRef = useRef(null);
  const tipRef = useRef(null);
  const zoomRef = useRef(null);
  const kRef = useRef(1);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hoverId, setHoverId] = useState(null);
  const [pacific, setPacific] = useState(() => {
    try {
      return localStorage.getItem('flat-center') !== 'atlantic';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('flat-center', pacific ? 'pacific' : 'atlantic');
    } catch {}
  }, [pacific]);

  useEffect(() => {
    const el = wrapRef.current;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { path, shapes } = useMemo(() => {
    if (!size.w) return { path: null, shapes: [] };
    // Pacific-centered view: centered near 150°E
    const projection = geoNaturalEarth1()
      .rotate([pacific ? -150 : -10, 0])
      .fitExtent(
        [
          [16, 16],
          [size.w - 16, size.h - 16],
        ],
        SPHERE
      );
    const path = geoPath(projection);
    const shapes = features.map((f) => {
      const p = f.properties;
      const c = projection([p.lx, p.ly]);
      return { f, p, d: path(f), cx: c?.[0], cy: c?.[1] };
    });
    return { path, shapes };
  }, [features, size, pacific]);

  // zoom / pan
  useEffect(() => {
    if (!size.w) return;
    const svg = select(svgRef.current);
    const z = d3zoom()
      .scaleExtent([1, 60])
      .translateExtent([
        [0, 0],
        [size.w, size.h],
      ])
      .clickDistance(5)
      .on('zoom', (e) => {
        kRef.current = e.transform.k;
        select(gRef.current).attr('transform', e.transform);
        select(gRef.current)
          .selectAll('circle.dot')
          .attr('r', DOT_R / e.transform.k);
        svgRef.current.style.setProperty('--k', e.transform.k);
      });
    svg.call(z).on('dblclick.zoom', null);
    zoomRef.current = z;
    svg.call(z.transform, zoomIdentity);
    return () => svg.on('.zoom', null);
  }, [size, pacific]);

  const zoomToFeature = (id, duration = 900) => {
    const s = shapes.find((x) => x.p.id === id);
    if (!s || !path || !zoomRef.current) return;
    let [[x0, y0], [x1, y1]] = path.bounds(s.f);
    // Regions that cross the map edge (e.g. Russia in the Atlantic-centered view): center on the label point
    if (x1 - x0 > size.w * 0.6 && s.cx != null) {
      x0 = s.cx - 60;
      x1 = s.cx + 60;
    }
    const dx = Math.max(x1 - x0, 6);
    const dy = Math.max(y1 - y0, 6);
    const k = Math.max(1, Math.min(14, 0.38 / Math.max(dx / size.w, dy / size.h)));
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    select(svgRef.current)
      .transition()
      .duration(duration)
      .call(zoomRef.current.transform, zoomIdentity.translate(size.w / 2 - k * cx, size.h / 2 - k * cy).scale(k));
  };

  // Handle each "fly to" once, only while the map is visible; after switching views, follow only if
  // that place is still selected
  const handledFocus = useRef(null);
  useEffect(() => {
    if (!focus || !active || !shapes.length || handledFocus.current === focus) return;
    handledFocus.current = focus;
    if (focus.id === selectedId) zoomToFeature(focus.id);
  }, [focus, active, shapes, selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetZoom = () => {
    select(svgRef.current).transition().duration(700).call(zoomRef.current.transform, zoomIdentity);
  };

  const showTip = (e, p) => {
    const tip = tipRef.current;
    if (!tip) return;
    const rect = wrapRef.current.getBoundingClientRect();
    tip.innerHTML = tooltipHtml(p, data.places[p.id], litSet.has(p.id), lightMode, readOnly);
    tip.style.display = 'block';
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    tip.style.left = `${Math.min(x + 14, rect.width - tw - 8)}px`;
    tip.style.top = `${y + th + 20 > rect.height ? y - th - 12 : y + 16}px`;
  };
  const hideTip = () => {
    if (tipRef.current) tipRef.current.style.display = 'none';
  };

  const fillOf = (p) => {
    if (!p.selectable) return COLORS.cap.filler;
    const lit = litSet.has(p.id);
    if (p.id === selectedId) return lit ? COLORS.cap.litSelected : COLORS.cap.selected;
    if (p.id === hoverId) return lit ? COLORS.cap.litHover : COLORS.cap.hover;
    return lit ? COLORS.cap.lit : COLORS.cap.base;
  };

  const litShapes = shapes.filter((s) => litSet.has(s.p.id));
  const selected = shapes.find((s) => s.p.id === selectedId);
  const hovered = hoverId && hoverId !== selectedId ? shapes.find((s) => s.p.id === hoverId) : null;
  const dots = shapes.filter((s) => s.p.tiny && s.cx != null && (litSet.has(s.p.id) || s.p.id === selectedId));

  return (
    <div ref={wrapRef} className="flat-wrap">
      <svg ref={svgRef} width={size.w} height={size.h} className="flat-svg">
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
          <radialGradient id="ocean" cx="50%" cy="45%" r="65%">
            <stop offset="0%" stopColor="#0f2142" />
            <stop offset="100%" stopColor="#081226" />
          </radialGradient>
        </defs>
        <g ref={gRef}>
          {path && <path d={path(SPHERE)} fill="url(#ocean)" className="sphere" />}
          {path && <path d={path(GRATICULE)} className="graticule" />}
          <g className="glow-layer" filter="url(#glow)">
            {litShapes.map((s) => (
              <path key={s.p.id} d={s.d} fill={COLORS.lit} />
            ))}
          </g>
          <g className="regions">
            {shapes.map((s) => (
              <path
                key={s.p.id}
                d={s.d}
                fill={fillOf(s.p)}
                className={s.p.selectable ? (litSet.has(s.p.id) ? 'region lit' : 'region') : 'region filler'}
                onMouseEnter={s.p.selectable ? () => setHoverId(s.p.id) : undefined}
                onMouseMove={s.p.selectable ? (e) => showTip(e, s.p) : undefined}
                onMouseLeave={
                  s.p.selectable
                    ? () => {
                        setHoverId((h) => (h === s.p.id ? null : h));
                        hideTip();
                      }
                    : undefined
                }
                onClick={s.p.selectable ? () => onPick(s.p.id) : undefined}
              />
            ))}
          </g>
          {hovered && <path d={hovered.d} className="outline hover" />}
          {selected && <path d={selected.d} className="outline selected" />}
          {dots.map((s) => (
            <circle
              key={s.p.id}
              className={'dot' + (s.p.id === selectedId ? ' selected' : '')}
              cx={s.cx}
              cy={s.cy}
              r={DOT_R / kRef.current}
              onMouseEnter={() => setHoverId(s.p.id)}
              onMouseMove={(e) => showTip(e, s.p)}
              onMouseLeave={() => {
                setHoverId(null);
                hideTip();
              }}
              onClick={() => onPick(s.p.id)}
            />
          ))}
        </g>
      </svg>
      <div ref={tipRef} className="map-tip" />
      <div className="flat-controls">
        <button
          className="chip-btn"
          onClick={() => setPacific((v) => !v)}
          title={pacific ? 'Switch to an Atlantic-centered map' : 'Switch to a Pacific-centered map'}
        >
          ⇄ {pacific ? 'Pacific-centered' : 'Atlantic-centered'}
        </button>
        <button className="chip-btn" onClick={resetZoom}>
          Reset view
        </button>
      </div>
    </div>
  );
}
