import { useMemo, useState } from 'react';
import { CONTINENT_ORDER, GROUPS, searchRegions, groupLabel } from '../lib/geo.js';
import { formatVisit, placeStats, plural, sortVisits } from '../lib/store.js';
import { photoUrl } from '../lib/photos.js';
import PlacePanel from './PlacePanel.jsx';

export default function Sidebar(props) {
  const { regions, data, litSet, selectedId, onChoose, onClose } = props;
  const [q, setQ] = useState('');
  const results = useMemo(() => searchRegions(regions.list, q), [regions, q]);
  const selected = selectedId ? regions.byId.get(selectedId) : null;

  return (
    <aside className="sidebar">
      <div className="search">
        <svg viewBox="0 0 24 24" className="search-icon" aria-hidden="true">
          <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M20 20l-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search countries, provinces, states…"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results[0]) {
              onChoose(results[0].id);
              setQ('');
            }
            if (e.key === 'Escape') setQ('');
          }}
        />
        {q && (
          <button className="icon-btn" onClick={() => setQ('')} aria-label="Clear search">
            ×
          </button>
        )}
        {q && (
          <div className="search-results">
            {results.length === 0 && <div className="empty-small">No matches for “{q}”</div>}
            {results.map((r) => (
              <button
                key={r.id}
                className="result"
                onClick={() => {
                  onChoose(r.id);
                  setQ('');
                }}
              >
                <span className={'dot-mark' + (litSet.has(r.id) ? ' on' : '')} />
                <span className="result-name">{r.n}</span>
                <span className="result-meta">{groupLabel(r)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="sidebar-body">
        {selected ? (
          <PlacePanel key={selected.id} region={selected} {...props} onBack={onClose} />
        ) : (
          <Overview {...props} />
        )}
      </div>
    </aside>
  );
}

function coverOf(place) {
  for (const v of sortVisits(place.visits || [])) if (v.photos?.length) return v.photos[0];
  return null;
}

function Overview({ regions, data, litSet, onChoose, onToggleLit, readOnly }) {
  const [tab, setTab] = useState('mine');
  const lit = [...litSet].map((id) => regions.byId.get(id)).filter(Boolean);

  const sections = useMemo(() => {
    const out = [];
    const cn = lit.filter((r) => r.g === 'cn');
    const us = lit.filter((r) => r.g === 'us');
    if (cn.length) out.push({ key: 'cn', title: 'China', count: `${cn.length}/${GROUPS.cn.total}`, items: cn });
    if (us.length) out.push({ key: 'us', title: 'United States', count: `${us.length}/${GROUPS.us.total}`, items: us });
    for (const c of CONTINENT_ORDER) {
      const items = lit.filter((r) => r.g === 'w' && r.c === c);
      if (items.length) out.push({ key: c, title: c, count: String(items.length), items });
    }
    for (const s of out) {
      s.items.sort((a, b) => {
        const va = sortVisits(data.places[a.id]?.visits || [])[0];
        const vb = sortVisits(data.places[b.id]?.visits || [])[0];
        const ka = va ? va.year * 100 + (va.month || 0) : 0;
        const kb = vb ? vb.year * 100 + (vb.month || 0) : 0;
        return kb - ka || a.n.localeCompare(b.n, 'en');
      });
    }
    return out;
  }, [lit, data]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="overview">
      {readOnly ? (
        <div className="tabs">
          <button className="on">Places I've been</button>
        </div>
      ) : (
        <div className="tabs">
          <button className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>
            My places
          </button>
          <button className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>
            All regions
          </button>
        </div>
      )}

      {(tab === 'mine' || readOnly) &&
        (sections.length === 0 ? (
          readOnly ? (
            <div className="empty">
              <div className="empty-title">No places yet</div>
              <p>Check back soon.</p>
            </div>
          ) : (
            <div className="empty">
              <div className="empty-title">Nothing lit up yet</div>
              <p>Click a country, province or state on the map — or search above — to start lighting up the places you've been.</p>
              <p>
                Lots to add? Tick them off in <b>All regions</b>, or turn on <b>Quick light</b> at the bottom left of the
                map.
              </p>
            </div>
          )
        ) : (
          sections.map((s) => (
            <section key={s.key} className="ov-section">
              <h3>
                {s.title} <span className="count">{s.count}</span>
              </h3>
              <div className="place-rows">
                {s.items.map((r) => {
                  const place = data.places[r.id];
                  const st = placeStats(place);
                  const cover = coverOf(place);
                  const last = sortVisits(place.visits || [])[0];
                  return (
                    <button key={r.id} className="place-row" onClick={() => onChoose(r.id)}>
                      {cover ? (
                        <img className="row-cover" src={photoUrl.thumb(cover)} alt="" loading="lazy" />
                      ) : (
                        <span className="row-cover none" />
                      )}
                      <span className="row-text">
                        <span className="row-name">{r.n}</span>
                        <span className="row-meta">
                          {last ? formatVisit(last) : 'Visited'}
                          {st.visits > 1 ? ` · ${plural(st.visits, 'trip')}` : ''}
                          {st.photos ? ` · ${plural(st.photos, 'photo')}` : ''}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))
        ))}

      {tab === 'all' && !readOnly && <Checklist regions={regions} litSet={litSet} onToggleLit={onToggleLit} onChoose={onChoose} />}
    </div>
  );
}

function Checklist({ regions, litSet, onToggleLit, onChoose }) {
  const groups = useMemo(() => {
    const g = [
      { key: 'cn', title: 'China', items: regions.list.filter((r) => r.g === 'cn') },
      { key: 'us', title: 'United States', items: regions.list.filter((r) => r.g === 'us') },
      ...CONTINENT_ORDER.map((c) => ({ key: c, title: c, items: regions.list.filter((r) => r.g === 'w' && r.c === c) })),
    ];
    return g.filter((x) => x.items.length);
  }, [regions]);
  const [open, setOpen] = useState(() => new Set(['cn', 'us']));

  return (
    <div className="checklist">
      <p className="hint">Click to light up or turn off · right-click for details</p>
      {groups.map((g) => {
        const n = g.items.filter((r) => litSet.has(r.id)).length;
        const isOpen = open.has(g.key);
        return (
          <section key={g.key} className="ck-section">
            <button
              className="ck-head"
              onClick={() =>
                setOpen((s) => {
                  const t = new Set(s);
                  t.has(g.key) ? t.delete(g.key) : t.add(g.key);
                  return t;
                })
              }
            >
              <span className={'caret' + (isOpen ? ' open' : '')}>›</span>
              {g.title}
              <span className="count">
                {n}/{g.items.length}
              </span>
            </button>
            {isOpen && (
              <div className="chips">
                {g.items.map((r) => (
                  <button
                    key={r.id}
                    className={'chip' + (litSet.has(r.id) ? ' on' : '')}
                    title={`${r.n} · ${groupLabel(r)}`}
                    onClick={() => onToggleLit(r.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      onChoose(r.id);
                    }}
                  >
                    {r.n}
                  </button>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
