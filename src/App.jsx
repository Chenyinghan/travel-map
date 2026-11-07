import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadRegions, GROUPS } from './lib/geo.js';
import { useTravelData, uid, placeStats, plural } from './lib/store.js';
import { uploadPhoto, deletePhotoFiles, createDisplayCopy } from './lib/photos.js';
import { STATIC_SITE, SITE_TITLE } from './config.js';
import GlobeView from './components/GlobeView.jsx';
import FlatMapView from './components/FlatMapView.jsx';
import Sidebar from './components/Sidebar.jsx';
import Gallery from './components/Gallery.jsx';
import Lightbox from './components/Lightbox.jsx';
import Starfield from './components/Starfield.jsx';
import Spotlight from './components/Spotlight.jsx';

const VIEWS = [
  { key: 'globe', label: 'Globe' },
  { key: 'flat', label: 'Flat map' },
  { key: 'gallery', label: 'Gallery' },
];

function readPref(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

export default function App() {
  const [regions, setRegions] = useState(null);
  const [geoError, setGeoError] = useState(null);
  const { data, update, status, error } = useTravelData();
  const [view, setView] = useState(() => readPref('view', 'globe'));
  const lastMapView = useRef(view === 'flat' ? 'flat' : 'globe');
  const [selectedId, setSelectedId] = useState(null);
  const [focus, setFocus] = useState(null);
  const [lightMode, setLightMode] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [uploads, setUploads] = useState({});
  const [toasts, setToasts] = useState([]);
  const [spotlightId, setSpotlightId] = useState(null);
  // The local editor can switch to "Visitor view" to preview the site; the static site is always read-only
  const [visitorView, setVisitorView] = useState(false);
  const readOnly = STATIC_SITE || visitorView;

  useEffect(() => {
    loadRegions()
      .then(setRegions)
      .catch((e) => setGeoError(e.message));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('view', view);
    } catch {}
    if (view !== 'gallery') lastMapView.current = view;
  }, [view]);

  const litSet = useMemo(() => new Set(data ? Object.keys(data.places) : []), [data]);

  const toast = useCallback((msg, kind = 'info') => {
    const id = uid();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);

  const nameOf = (id) => regions?.byId.get(id)?.n || id;

  // Photos without a display copy (uploaded early, or the file went missing): recreate them when the
  // local editor opens; the published site needs them
  const backfilled = useRef(false);
  useEffect(() => {
    if (STATIC_SITE || !data || backfilled.current) return;
    backfilled.current = true;
    const all = [];
    for (const [placeId, place] of Object.entries(data.places))
      for (const v of place.visits || []) for (const p of v.photos || []) all.push({ placeId, visitId: v.id, photo: p });
    if (!all.length) return;
    (async () => {
      const todo = [];
      for (let k = 0; k < all.length; k += 8) {
        const batch = all.slice(k, k + 8);
        const ok = await Promise.all(
          batch.map((t) =>
            t.photo.disp
              ? fetch(`/photos/${t.photo.id}_disp.jpg`, { method: 'HEAD' }).then((r) => r.ok, () => true)
              : false
          )
        );
        batch.forEach((t, j) => !ok[j] && todo.push(t));
      }
      if (!todo.length) return;
      toast(`Preparing ${plural(todo.length, 'photo')} for the website…`);
      let failed = 0;
      for (const t of todo) {
        try {
          await createDisplayCopy(t.photo);
          update((d) => {
            const ph = d.places[t.placeId]?.visits.find((x) => x.id === t.visitId)?.photos.find((x) => x.id === t.photo.id);
            if (ph) ph.disp = true;
          });
        } catch {
          failed++;
        }
      }
      if (failed) toast(`${plural(failed, 'photo')} couldn't be prepared for the website`, 'error');
    })();
  }, [data, update, toast]);

  // ---------- data operations ----------
  const toggleLit = (id) => {
    const place = data.places[id];
    if (place) {
      const st = placeStats(place);
      if (st.visits > 0) {
        const what = st.photos
          ? `${plural(st.visits, 'trip')} and ${plural(st.photos, 'photo')}`
          : plural(st.visits, 'trip');
        const msg = `Turning off ${nameOf(id)} will also delete its ${what}. Continue?`;
        if (!window.confirm(msg)) return;
      }
      const photoIds = place.visits.flatMap((v) => (v.photos || []).map((p) => p.id));
      update((d) => {
        delete d.places[id];
      });
      if (photoIds.length) deletePhotoFiles(photoIds);
    } else {
      update((d) => {
        d.places[id] = { litAt: new Date().toISOString(), visits: [] };
      });
    }
  };

  const addVisit = (placeId) => {
    const now = new Date();
    const visit = { id: uid(), year: now.getFullYear(), month: now.getMonth() + 1, note: '', photos: [] };
    update((d) => {
      if (!d.places[placeId]) d.places[placeId] = { litAt: now.toISOString(), visits: [] };
      d.places[placeId].visits.push(visit);
    });
  };

  const updateVisit = (placeId, visitId, patch) => {
    update((d) => {
      const v = d.places[placeId]?.visits.find((x) => x.id === visitId);
      if (v) Object.assign(v, patch);
    });
  };

  const deleteVisit = (placeId, visitId) => {
    const v = data.places[placeId]?.visits.find((x) => x.id === visitId);
    if (!v) return;
    const n = v.photos?.length || 0;
    if ((n || v.note) && !window.confirm(n ? `Delete this trip and its ${plural(n, 'photo')}?` : 'Delete this trip?')) return;
    update((d) => {
      const p = d.places[placeId];
      if (p) p.visits = p.visits.filter((x) => x.id !== visitId);
    });
    if (n) deletePhotoFiles(v.photos.map((p) => p.id));
  };

  const addPhotos = async (placeId, visitId, files) => {
    setUploads((u) => ({ ...u, [visitId]: (u[visitId] || 0) + files.length }));
    for (const file of files) {
      try {
        const photo = await uploadPhoto(file);
        let attached = false;
        update((d) => {
          const v = d.places[placeId]?.visits.find((x) => x.id === visitId);
          if (v) {
            v.photos = v.photos || [];
            v.photos.push(photo);
            attached = true;
          }
        });
        if (!attached) deletePhotoFiles([photo.id]);
      } catch (e) {
        toast(e.message || `Couldn't upload "${file.name}"`, 'error');
      } finally {
        setUploads((u) => ({ ...u, [visitId]: Math.max(0, (u[visitId] || 1) - 1) }));
      }
    }
  };

  const deletePhoto = (placeId, visitId, photoId) => {
    if (!window.confirm('Delete this photo?')) return;
    update((d) => {
      const v = d.places[placeId]?.visits.find((x) => x.id === visitId);
      if (v) v.photos = v.photos.filter((p) => p.id !== photoId);
    });
    deletePhotoFiles([photoId]);
  };

  // ---------- selection / navigation ----------
  // Map click: a lit place → fly there and open the close-up with flags; an unvisited place → show it in the sidebar
  const onPick = (id) => {
    if (lightMode && !readOnly) {
      toggleLit(id);
      return;
    }
    setSelectedId(id);
    if (litSet.has(id)) {
      setSpotlightId(id);
      setFocus({ id, t: Date.now() });
    } else {
      setSpotlightId(null);
    }
  };

  const choose = (id) => {
    setSelectedId(id);
    setFocus({ id, t: Date.now() });
    setSpotlightId(litSet.has(id) ? id : null);
  };

  const openSpotlight = (id) => {
    if (view === 'gallery') setView(lastMapView.current);
    setSelectedId(id);
    setSpotlightId(id);
    setFocus({ id, t: Date.now() });
  };

  const openTrip = (placeId, visit) => {
    const items = (visit.photos || []).map((p) => ({ placeId, visitId: visit.id, photo: p }));
    if (items.length) setLightbox({ items, index: 0 });
  };

  const goToPlace = (id) => {
    setLightbox(null);
    if (view === 'gallery') setView(lastMapView.current);
    choose(id);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || lightbox) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      if (spotlightId) setSpotlightId(null);
      else if (lightMode) setLightMode(false);
      else setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox, lightMode, spotlightId]);

  // Turn off Quick light when switching to Visitor view
  useEffect(() => {
    if (readOnly) setLightMode(false);
  }, [readOnly]);

  useEffect(() => {
    document.title = SITE_TITLE;
  }, []);

  const closeLightbox = useCallback(() => setLightbox(null), []);

  // ---------- stats ----------
  const stats = useMemo(() => {
    let cn = 0;
    let us = 0;
    let w = 0;
    let photos = 0;
    const continents = new Set();
    if (regions && data) {
      for (const id of litSet) {
        const r = regions.byId.get(id);
        if (!r) continue;
        if (r.g === 'cn') cn++;
        else if (r.g === 'us') us++;
        else w++;
        continents.add(r.c);
        photos += placeStats(data.places[id]).photos;
      }
    }
    return { cn, us, countries: w + (cn ? 1 : 0) + (us ? 1 : 0), continents: continents.size, photos };
  }, [regions, data, litSet]);

  // ---------- render ----------
  if (geoError || (status === 'error' && !data)) {
    return (
      <div className="app">
        <Starfield />
        <div className="boot">
          <div className="boot-title">Something went wrong</div>
          <div className="boot-sub">{geoError || error}</div>
        </div>
      </div>
    );
  }
  if (!regions || !data) {
    return (
      <div className="app">
        <Starfield />
        <div className="boot">
          <span className="spinner big" />
          <div className="boot-sub">Unfolding the map…</div>
        </div>
      </div>
    );
  }

  const mapProps = { data, litSet, selectedId, onPick, focus, lightMode: lightMode && !readOnly, readOnly };
  const spotRegion = spotlightId && litSet.has(spotlightId) && view !== 'gallery' ? regions.byId.get(spotlightId) : null;

  return (
    <div className="app">
      <Starfield />
      <header className="topbar">
        <div className="brand">
          <span className="logo">✦</span>
          <span>{SITE_TITLE}</span>
        </div>
        <nav className="seg" aria-label="View">
          {VIEWS.map((v) => (
            <button key={v.key} className={view === v.key ? 'on' : ''} onClick={() => setView(v.key)}>
              {v.label}
            </button>
          ))}
        </nav>
        <div className="stats">
          <Stat value={stats.countries} label="Countries" />
          <Stat value={stats.cn} total={GROUPS.cn.total} label="China provinces" />
          <Stat value={stats.us} total={GROUPS.us.total} label="US states" />
          <Stat value={stats.continents} label="Continents" />
          <Stat value={stats.photos} label="Photos" />
        </div>
        {!STATIC_SITE && (
          <div className="mode-box">
            {!visitorView && <SaveStatus status={status} error={error} />}
            <button
              className={'chip-btn mode-btn' + (visitorView ? ' on' : '')}
              onClick={() => setVisitorView((v) => !v)}
              title={visitorView ? 'Back to editing' : 'Preview what visitors of your website will see'}
            >
              {visitorView ? '✎ Back to editing' : '👁 Visitor view'}
            </button>
          </div>
        )}
      </header>

      <div className={'main' + (view === 'gallery' ? ' full' : '')}>
        <div className="stage">
          <div className={'layer' + (view === 'globe' ? ' active' : '')}>
            <GlobeView features={regions.lo} active={view === 'globe'} {...mapProps} />
          </div>
          <div className={'layer' + (view === 'flat' ? ' active' : '')}>
            <FlatMapView features={regions.hi} active={view === 'flat'} {...mapProps} />
          </div>

          {view !== 'gallery' && (
            <>
              <div className="map-overlay">
                {!readOnly && (
                  <button
                    className={'light-toggle' + (lightMode ? ' on' : '')}
                    onClick={() => setLightMode((v) => !v)}
                    title="When on, clicking the map lights places up or turns them off"
                  >
                    <span className="bulb">✦</span>
                    {lightMode ? 'Quick light: on' : 'Quick light'}
                  </button>
                )}
                <div className="legend">
                  <span>
                    <i className="sw lit" />
                    Visited
                  </span>
                  <span>
                    <i className="sw" />
                    Not yet
                  </span>
                </div>
              </div>
              {lightMode && !readOnly && (
                <div className="light-banner">
                  Quick light: click any region to light it up or turn it off
                  <button onClick={() => setLightMode(false)}>Done</button>
                </div>
              )}
            </>
          )}

          {spotRegion && (
            <Spotlight
              key={spotRegion.id}
              region={spotRegion}
              features={regions.hi}
              litSet={litSet}
              place={data.places[spotRegion.id]}
              onClose={() => setSpotlightId(null)}
              onOpenTrip={(visit) => openTrip(spotRegion.id, visit)}
              onSwitch={openSpotlight}
            />
          )}

          {view === 'gallery' && (
            <Gallery
              regions={regions}
              data={data}
              onOpenPhoto={(items, index) => setLightbox({ items, index })}
              onGoToPlace={goToPlace}
            />
          )}
        </div>

        {view !== 'gallery' && (
          <Sidebar
            regions={regions}
            data={data}
            litSet={litSet}
            selectedId={selectedId}
            uploads={uploads}
            readOnly={readOnly}
            onChoose={choose}
            onClose={() => {
              setSelectedId(null);
              setSpotlightId(null);
            }}
            onOpenSpotlight={openSpotlight}
            onToggleLit={toggleLit}
            onAddVisit={addVisit}
            onUpdateVisit={updateVisit}
            onDeleteVisit={deleteVisit}
            onAddPhotos={addPhotos}
            onDeletePhoto={deletePhoto}
            onOpenPhoto={(items, index) => setLightbox({ items, index })}
          />
        )}
      </div>

      {lightbox && (
        <Lightbox
          key={lightbox.items[lightbox.index]?.photo.id}
          items={lightbox.items}
          index={lightbox.index}
          regions={regions}
          data={data}
          readOnly={readOnly}
          onClose={closeLightbox}
          onDelete={deletePhoto}
          onGoToPlace={goToPlace}
        />
      )}

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={'toast ' + t.kind}>
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ value, total, label }) {
  return (
    <div className="stat">
      <div className="stat-v">
        {value}
        {total ? <span className="stat-t">/{total}</span> : null}
      </div>
      <div className="stat-l">{label}</div>
    </div>
  );
}

function SaveStatus({ status, error }) {
  const text = { saving: 'Saving…', saved: 'Saved', error: error || 'Save failed', loading: '' }[status];
  return (
    <div className={'save-status ' + status} title={status === 'saved' ? 'Your data is saved in the data/ folder' : ''}>
      <i />
      {text}
    </div>
  );
}
