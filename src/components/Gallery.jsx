import { useMemo, useState } from 'react';
import { formatVisit, plural, visitSortKey } from '../lib/store.js';
import { photoUrl } from '../lib/photos.js';
import { groupLabel } from '../lib/geo.js';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'cn', label: 'China' },
  { key: 'us', label: 'US' },
  { key: 'w', label: 'Rest of world' },
];

export default function Gallery({ regions, data, onOpenPhoto, onGoToPlace }) {
  const [filter, setFilter] = useState('all');
  const [order, setOrder] = useState('desc');
  const [q, setQ] = useState('');

  const { years, items, totals } = useMemo(() => {
    const s = q.trim().toLowerCase();
    const entries = [];
    let photoCount = 0;
    const placeSet = new Set();
    for (const [placeId, place] of Object.entries(data.places)) {
      const r = regions.byId.get(placeId);
      if (!r) continue;
      if (filter !== 'all' && r.g !== filter) continue;
      const nameHit = !s || r.n.toLowerCase().includes(s);
      for (const v of place.visits || []) {
        if (!v.photos?.length) continue;
        // match on the place name or the note
        if (!nameHit && !(v.note || '').toLowerCase().includes(s)) continue;
        entries.push({ r, v, placeId });
        photoCount += v.photos.length;
        placeSet.add(placeId);
      }
    }
    entries.sort((a, b) => {
      const d = visitSortKey(a.v) - visitSortKey(b.v);
      return order === 'desc' ? -d : d;
    });
    const years = [];
    const items = [];
    for (const e of entries) {
      const y = e.v.year || 'Date unknown';
      let yr = years[years.length - 1];
      if (!yr || yr.year !== y) {
        yr = { year: y, entries: [] };
        years.push(yr);
      }
      e.start = items.length;
      for (const p of e.v.photos) items.push({ placeId: e.placeId, visitId: e.v.id, photo: p });
      yr.entries.push(e);
    }
    return { years, items, totals: { photos: photoCount, places: placeSet.size } };
  }, [regions, data, filter, order, q]);

  return (
    <div className="gallery">
      <div className="gallery-head">
        <div>
          <h2>Gallery</h2>
          <div className="sub">
            {plural(totals.photos, 'photo')} · {plural(totals.places, 'place')}
          </div>
        </div>
        <div className="gallery-tools">
          <div className="seg small">
            {FILTERS.map((f) => (
              <button key={f.key} className={filter === f.key ? 'on' : ''} onClick={() => setFilter(f.key)}>
                {f.label}
              </button>
            ))}
          </div>
          <div className="seg small">
            <button className={order === 'desc' ? 'on' : ''} onClick={() => setOrder('desc')}>
              Newest
            </button>
            <button className={order === 'asc' ? 'on' : ''} onClick={() => setOrder('asc')}>
              Oldest
            </button>
          </div>
          <input className="gallery-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search places or notes" />
        </div>
      </div>

      {years.length === 0 ? (
        <div className="empty gallery-empty">
          <div className="empty-title">{q || filter !== 'all' ? 'No photos match' : 'Your gallery is empty'}</div>
          <p>Pick a place on the map, add a trip, then drop your photos into it.</p>
        </div>
      ) : (
        years.map((yr) => (
          <section key={yr.year} className="year-block">
            <h3 className="year">{yr.year}</h3>
            {yr.entries.map((e) => (
              <div key={e.v.id} className="trip">
                <button className="trip-head" onClick={() => onGoToPlace(e.placeId)} title="Show on map">
                  <span className="trip-place">{e.r.n}</span>
                  <span className="trip-meta">
                    {formatVisit(e.v)} · {groupLabel(e.r)} · {plural(e.v.photos.length, 'photo')}
                  </span>
                </button>
                {e.v.note && <p className="trip-note">{e.v.note}</p>}
                <div className="masonry">
                  {e.v.photos.map((p, i) => (
                    <button key={p.id} className="m-item" onClick={() => onOpenPhoto(items, e.start + i)}>
                      <img
                        src={photoUrl.thumb(p)}
                        alt={p.name}
                        loading="lazy"
                        style={p.w && p.h ? { aspectRatio: `${p.w} / ${p.h}` } : undefined}
                      />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))
      )}
    </div>
  );
}
