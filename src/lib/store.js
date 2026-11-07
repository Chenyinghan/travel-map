import { useCallback, useEffect, useRef, useState } from 'react';
import { STATIC_SITE, asset } from '../config.js';

// Data model
// {
//   version: 1,
//   places: {
//     "<regionId>": {
//       litAt: ISO timestamp,
//       visits: [{ id, year, month|null, note, photos: [{ id, ext, w, h, name, disp, addedAt }] }]
//     }
//   }
// }

const EMPTY = { version: 1, places: {} };

export function useTravelData() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | saved | saving | error | readonly
  const [error, setError] = useState(null);
  const dataRef = useRef(null);
  const pending = useRef(null);
  const timer = useRef(null);
  const saving = useRef(false);

  useEffect(() => {
    // The static site reads the snapshot bundled at build time; the local editor uses the local API
    const url = STATIC_SITE ? asset('data/travel.json') : '/api/data';
    fetch(url, { cache: 'no-cache' })
      .then((r) => {
        if (STATIC_SITE && r.status === 404) return EMPTY;
        if (!r.ok) throw new Error('Could not load your data');
        return r.json();
      })
      .then((d) => {
        const init = { ...EMPTY, ...d, places: d.places || {} };
        dataRef.current = init;
        setData(init);
        setStatus(STATIC_SITE ? 'readonly' : 'saved');
      })
      .catch((e) => {
        setError(
          STATIC_SITE
            ? e.message
            : e.message + ' — make sure the app was started with "npm run dev" or "npm start".'
        );
        setStatus('error');
      });
  }, []);

  const schedule = useCallback((ms) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => flushRef.current(), ms);
  }, []);

  const flushRef = useRef(null);
  flushRef.current = async () => {
    if (saving.current || !pending.current) return;
    const body = pending.current;
    pending.current = null;
    saving.current = true;
    setStatus('saving');
    let failed = false;
    try {
      const r = await fetch('/api/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error('Save failed');
      setError(null);
    } catch (e) {
      failed = true;
      if (!pending.current) pending.current = body; // keep the data and retry later
      setError('Save failed — retrying…');
      setStatus('error');
    } finally {
      saving.current = false;
      if (pending.current) schedule(failed ? 3000 : 200);
      else setStatus('saved');
    }
  };

  // update(draft => { ...mutate draft directly... })
  const update = useCallback(
    (fn) => {
      if (!dataRef.current || STATIC_SITE) return;
      const draft = structuredClone(dataRef.current);
      fn(draft);
      dataRef.current = draft;
      pending.current = draft;
      setData(draft);
      setStatus('saving');
      schedule(350);
    },
    [schedule]
  );

  useEffect(() => {
    const warn = (e) => {
      if (pending.current || saving.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  return { data, update, status, error };
}

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)).toLowerCase();

export function visitSortKey(v) {
  return (v.year || 0) * 100 + (v.month || 0);
}

export function sortVisits(visits) {
  return [...visits].sort((a, b) => visitSortKey(b) - visitSortKey(a));
}

export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatVisit(v) {
  if (!v.year) return 'Date unknown';
  return v.month ? `${MONTH_NAMES[v.month - 1]} ${v.year}` : String(v.year);
}

// plural(3, 'photo') -> "3 photos"
export function plural(n, word, pluralWord = word + 's') {
  return `${n} ${n === 1 ? word : pluralWord}`;
}

export function placeStats(place) {
  if (!place) return { visits: 0, photos: 0 };
  let photos = 0;
  for (const v of place.visits || []) photos += (v.photos || []).length;
  return { visits: (place.visits || []).length, photos };
}
