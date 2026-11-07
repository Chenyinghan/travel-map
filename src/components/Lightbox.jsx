import { useEffect, useRef, useState } from 'react';
import { photoUrl } from '../lib/photos.js';
import { formatVisit } from '../lib/store.js';

// Swipeable photo viewer: touch swipe, mouse drag, trackpad swipe, or the ← → keys
export default function Lightbox({ items, index, regions, data, readOnly, onClose, onDelete, onGoToPlace }) {
  // the list gets shorter when photos are deleted
  const live = items.filter((it) => {
    const v = data.places[it.placeId]?.visits.find((x) => x.id === it.visitId);
    return v && v.photos.some((p) => p.id === it.photo.id);
  });
  const [i, setI] = useState(index);
  const cur = Math.max(0, Math.min(i, live.length - 1));
  const [dx, setDx] = useState(0);
  const [anim, setAnim] = useState(false);
  const stageRef = useRef(null);
  const drag = useRef(null);
  const wheel = useRef({ acc: 0, until: 0 });

  const go = (n) => {
    setAnim(true);
    setI(Math.max(0, Math.min(live.length - 1, n)));
    setDx(0);
  };

  useEffect(() => {
    if (!live.length) onClose();
  }, [live.length, onClose]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') go(cur + 1);
      if (e.key === 'ArrowLeft') go(cur - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!live.length) return null;
  const item = live[cur];
  const r = regions.byId.get(item.placeId);
  const visit = data.places[item.placeId]?.visits.find((v) => v.id === item.visitId);

  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('button, a')) return;
    drag.current = { x: e.clientX, t: performance.now() };
    stageRef.current.setPointerCapture(e.pointerId);
    setAnim(false);
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    let d = e.clientX - drag.current.x;
    if ((cur === 0 && d > 0) || (cur === live.length - 1 && d < 0)) d *= 0.3; // resistance at both ends
    setDx(d);
  };
  const onPointerUp = (e) => {
    if (!drag.current) return;
    const d = e.clientX - drag.current.x;
    const v = d / Math.max(1, performance.now() - drag.current.t);
    drag.current = null;
    const w = stageRef.current.clientWidth;
    if (d < -w * 0.15 || (v < -0.45 && d < -20)) go(cur + 1);
    else if (d > w * 0.15 || (v > 0.45 && d > 20)) go(cur - 1);
    else go(cur);
  };
  const onWheel = (e) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    const wv = wheel.current;
    const now = performance.now();
    if (now < wv.until) return;
    wv.acc += e.deltaX;
    if (Math.abs(wv.acc) > 40) {
      go(cur + (wv.acc > 0 ? 1 : -1));
      wv.acc = 0;
      wv.until = now + 450;
    }
  };

  return (
    <div className="lightbox">
      <div className="lb-top">
        <div className="lb-caption">
          <button className="lb-place" onClick={() => onGoToPlace(item.placeId)} title="Show on map">
            {r?.n}
          </button>
          <span className="lb-date">{visit ? formatVisit(visit) : ''}</span>
          <span className="lb-count">
            {cur + 1} / {live.length}
          </span>
        </div>
        <div className="lb-actions">
          {!readOnly && (
            <>
              <a className="chip-btn" href={photoUrl.original(item.photo)} target="_blank" rel="noreferrer">
                Original
              </a>
              <button className="chip-btn danger" onClick={() => onDelete(item.placeId, item.visitId, item.photo.id)}>
                Delete
              </button>
            </>
          )}
          <button className="chip-btn" onClick={onClose} aria-label="Close">
            Close ✕
          </button>
        </div>
      </div>

      <div
        className="lb-stage"
        ref={stageRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        <div
          className={'lb-track' + (anim ? ' anim' : '')}
          style={{ transform: `translateX(calc(${-cur * 100}% + ${dx}px))` }}
          onTransitionEnd={() => setAnim(false)}
        >
          {live.map((it, k) => (
            <Slide key={it.photo.id} photo={it.photo} near={Math.abs(k - cur) <= 1} />
          ))}
        </div>
        {cur > 0 && (
          <button className="lb-nav prev" onClick={() => go(cur - 1)} aria-label="Previous photo">
            ‹
          </button>
        )}
        {cur < live.length - 1 && (
          <button className="lb-nav next" onClick={() => go(cur + 1)} aria-label="Next photo">
            ›
          </button>
        )}
      </div>

      <div className="lb-bottom">
        {visit?.note && <div className="lb-note">{visit.note}</div>}
        {live.length > 1 && live.length <= 24 && (
          <div className="lb-dots">
            {live.map((it, k) => (
              <button
                key={it.photo.id}
                className={k === cur ? 'on' : ''}
                onClick={() => go(k)}
                aria-label={`Photo ${k + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Slide({ photo, near }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="lb-slide">
      <img className={'lb-img thumb' + (loaded ? ' hide' : '')} src={photoUrl.thumb(photo)} alt="" draggable={false} loading="lazy" />
      {near && (
        <img
          className={'lb-img full' + (loaded ? ' on' : '')}
          src={photoUrl.full(photo)}
          alt={photo.name || ''}
          draggable={false}
          onLoad={() => setLoaded(true)}
        />
      )}
    </div>
  );
}
