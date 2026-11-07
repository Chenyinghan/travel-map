import { useEffect, useMemo, useRef, useState } from 'react';
import Globe from 'globe.gl';
import { COLORS, tooltipHtml } from '../lib/theme.js';

const ALT = { base: 0.006, lit: 0.016, selected: 0.03 };

export default function GlobeView({ features, data, litSet, selectedId, onPick, focus, active, lightMode, readOnly }) {
  const wrapRef = useRef(null);
  const globeRef = useRef(null);
  const [hoverId, setHoverId] = useState(null);

  // latest values for the callbacks
  const live = useRef({});
  live.current = { data, litSet, selectedId, onPick, lightMode };

  const rotateTimer = useRef(null);
  const tipRef = useRef(null);
  const mouse = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const placeTip = () => {
    const tip = tipRef.current;
    if (!tip || tip.style.display === 'none') return;
    const { x, y, w, h } = mouse.current;
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    tip.style.left = `${Math.min(x + 14, w - tw - 8)}px`;
    tip.style.top = `${y + th + 20 > h ? y - th - 12 : y + 16}px`;
  };
  const byId = useMemo(() => new Map(features.map((f) => [f.properties.id, f.properties])), [features]);

  // setup
  useEffect(() => {
    const el = wrapRef.current;
    const globe = new Globe(el, { animateIn: true, rendererConfig: { antialias: true, alpha: true } })
      .backgroundColor('rgba(0,0,0,0)')
      .showAtmosphere(true)
      .atmosphereColor(COLORS.atmosphere)
      .atmosphereAltitude(0.17)
      .showGraticules(true)
      .polygonCapCurvatureResolution(4)
      .polygonsTransitionDuration(350)
      .polygonLabel(() => '')
      .onPolygonHover((f) => {
        const id = f && f.properties.selectable ? f.properties.id : null;
        setHoverId(id);
        el.style.cursor = id ? 'pointer' : 'grab';
      })
      .onPolygonClick((f) => {
        if (f.properties.selectable) live.current.onPick(f.properties.id);
      })
      .pointLat('lat')
      .pointLng('lng')
      .pointAltitude(0.02)
      .pointRadius(0.28)
      .pointResolution(16)
      .pointColor(() => COLORS.lit)
      .pointLabel(() => '')
      .onPointHover((d) => {
        setHoverId(d ? d.r.id : null);
        el.style.cursor = d ? 'pointer' : 'grab';
      })
      .onPointClick((d) => live.current.onPick(d.r.id))
      .ringLat('lat')
      .ringLng('lng')
      .ringColor(() => (t) => `rgba(255, 214, 140, ${Math.max(0, 1 - t) * 0.9})`)
      .ringMaxRadius('r')
      .ringPropagationSpeed('speed')
      .ringRepeatPeriod(1400)
      .ringAltitude(0.032);

    const mat = globe.globeMaterial();
    mat.color.set(COLORS.ocean);
    mat.emissive?.set(COLORS.oceanEmissive);
    mat.shininess = 8;

    globe.pointOfView({ lat: 30, lng: 105, altitude: 2.3 });

    const controls = globe.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.35;
    controls.enableDamping = true;
    controls.minDistance = 101 + 12;
    controls.maxDistance = 600;
    const stop = () => {
      controls.autoRotate = false;
      clearTimeout(rotateTimer.current);
    };
    const resume = () => {
      clearTimeout(rotateTimer.current);
      rotateTimer.current = setTimeout(() => {
        if (!live.current.selectedId) controls.autoRotate = true;
      }, 30000);
    };
    controls.addEventListener('start', stop);
    controls.addEventListener('end', resume);

    // Our own tooltip: follows the mouse and updates live with the data (globe.gl's built-in one only
    // refreshes when the hovered region changes)
    const onMove = (e) => {
      const r = el.getBoundingClientRect();
      mouse.current = { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
      placeTip();
    };
    const onLeave = () => setHoverId(null);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);

    const ro = new ResizeObserver(() => {
      const { clientWidth: w, clientHeight: h } = el;
      if (w > 0 && h > 0) globe.width(w).height(h);
    });
    ro.observe(el);

    globeRef.current = globe;
    return () => {
      ro.disconnect();
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      clearTimeout(rotateTimer.current);
      controls.removeEventListener('start', stop);
      controls.removeEventListener('end', resume);
      globe._destructor?.();
      el.innerHTML = '';
    };
  }, []);

  useEffect(() => {
    globeRef.current?.polygonsData(features);
  }, [features]);

  // colors / altitudes
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;
    const state = (p) => {
      if (!p.selectable) return 'filler';
      const lit = litSet.has(p.id);
      if (p.id === selectedId) return lit ? 'litSelected' : 'selected';
      if (p.id === hoverId) return lit ? 'litHover' : 'hover';
      return lit ? 'lit' : 'base';
    };
    globe
      .polygonCapColor((f) => COLORS.cap[state(f.properties)])
      .polygonSideColor((f) => COLORS.side[state(f.properties)])
      .polygonStrokeColor((f) => COLORS.stroke[state(f.properties)])
      .polygonAltitude((f) => {
        const p = f.properties;
        if (p.id === selectedId) return ALT.selected;
        return litSet.has(p.id) ? ALT.lit : ALT.base;
      });
  }, [features, litSet, selectedId, hoverId]);

  // extra dots for lit tiny regions
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;
    const pts = [];
    for (const f of features) {
      const p = f.properties;
      if (p.tiny && litSet.has(p.id)) pts.push({ lat: p.ly, lng: p.lx, r: p });
    }
    globe.pointsData(pts);
  }, [features, litSet]);

  // rings around the selected region
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;
    const f = selectedId && features.find((x) => x.properties.id === selectedId);
    if (!f) {
      globe.ringsData([]);
      // after deselecting, resume auto-rotate once idle for a while
      clearTimeout(rotateTimer.current);
      rotateTimer.current = setTimeout(() => {
        if (!live.current.selectedId) globe.controls().autoRotate = true;
      }, 30000);
      return;
    }
    const p = f.properties;
    const r = Math.min(8, Math.max(1.5, p.span * 0.35));
    globe.ringsData([{ lat: p.ly, lng: p.lx, r, speed: r * 1.2 }]);
    globe.controls().autoRotate = false;
  }, [features, selectedId]);

  // Fly to a place: handle it once, only while the globe is visible; after switching views, follow only
  // if that place is still selected
  const handledFocus = useRef(null);
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe || !focus || !active || handledFocus.current === focus) return;
    handledFocus.current = focus;
    if (focus.id !== selectedId) return;
    const f = features.find((x) => x.properties.id === focus.id);
    if (!f) return;
    const p = f.properties;
    const altitude = Math.min(2.2, Math.max(0.45, p.span * 0.045 + 0.3));
    globe.controls().autoRotate = false;
    globe.pointOfView({ lat: p.ly, lng: p.lx, altitude }, 1300);
  }, [focus, features, active, selectedId]);

  useEffect(() => {
    const tip = tipRef.current;
    const r = hoverId && byId.get(hoverId);
    if (!tip) return;
    if (!r) {
      tip.style.display = 'none';
      return;
    }
    tip.innerHTML = tooltipHtml(r, data.places[r.id], litSet.has(r.id), lightMode, readOnly);
    tip.style.display = 'block';
    placeTip();
  }, [hoverId, byId, data, litSet, lightMode, readOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  // pause rendering while hidden
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;
    if (active) {
      globe.resumeAnimation();
      const el = wrapRef.current;
      if (el.clientWidth > 0) globe.width(el.clientWidth).height(el.clientHeight);
    } else globe.pauseAnimation();
  }, [active]);

  return (
    <>
      <div ref={wrapRef} className="globe-wrap" />
      <div ref={tipRef} className="map-tip" style={{ display: 'none' }} />
    </>
  );
}
