import { useRef, useState } from 'react';
import { groupLabel } from '../lib/geo.js';
import { MONTH_NAMES, formatVisit, placeStats, plural, sortVisits } from '../lib/store.js';
import { photoUrl } from '../lib/photos.js';

const NOW = new Date();
const YEARS = Array.from({ length: NOW.getFullYear() - 1949 }, (_, i) => NOW.getFullYear() - i);
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export default function PlacePanel({
  region,
  data,
  litSet,
  onBack,
  onToggleLit,
  onAddVisit,
  onUpdateVisit,
  onDeleteVisit,
  onAddPhotos,
  onDeletePhoto,
  onOpenPhoto,
  onOpenSpotlight,
  uploads,
  readOnly,
}) {
  const place = data.places[region.id];
  const lit = litSet.has(region.id);
  const visits = sortVisits(place?.visits || []);
  const st = placeStats(place);

  const openPhoto = (visitId, photoId) => {
    const items = [];
    for (const v of visits) for (const p of v.photos || []) items.push({ placeId: region.id, visitId: v.id, photo: p });
    const idx = items.findIndex((x) => x.visitId === visitId && x.photo.id === photoId);
    onOpenPhoto(items, Math.max(0, idx));
  };

  return (
    <div className="place-panel">
      <button className="back" onClick={onBack}>
        ‹ Back to overview
      </button>

      <div className={'place-hero' + (lit ? ' lit' : '')}>
        <div className="place-group">{groupLabel(region)}</div>
        <h2>{region.n}</h2>
        <div className="place-actions">
          {lit ? (
            <>
              <span className="lit-badge">✦ Visited</span>
              <button className="secondary" onClick={() => onOpenSpotlight(region.id)}>
                See flags
              </button>
              {!readOnly && (
                <button className="link-btn" onClick={() => onToggleLit(region.id)}>
                  Turn off
                </button>
              )}
            </>
          ) : readOnly ? (
            <span className="not-yet">Not visited yet</span>
          ) : (
            <button className="primary" onClick={() => onToggleLit(region.id)}>
              ✦ Light it up
            </button>
          )}
        </div>
        {lit && (st.visits > 0 || st.photos > 0) && (
          <div className="place-stats">
            {plural(st.visits, 'trip')} · {plural(st.photos, 'photo')}
          </div>
        )}
      </div>

      {readOnly ? (
        lit && (
          <>
            <div className="visits-head">
              <h3>Trips</h3>
            </div>
            {visits.length === 0 && <div className="empty-small">Been here — no trip details yet.</div>}
            {visits.map((v) => (
              <TripCard key={v.id} visit={v} onOpenPhoto={(pid) => openPhoto(v.id, pid)} />
            ))}
          </>
        )
      ) : (
        <>
          <div className="visits-head">
            <h3>Trips</h3>
            <button className="secondary" onClick={() => onAddVisit(region.id)}>
              + Add trip
            </button>
          </div>

          {visits.length === 0 && (
            <div className="empty-small">
              {lit
                ? 'Add the month and year you were here — and some photos.'
                : 'Been here? Light it up, or add a trip directly (that lights it up too).'}
            </div>
          )}

          {visits.map((v) => (
            <VisitCard
              key={v.id}
              visit={v}
              uploading={uploads[v.id]}
              onChange={(patch) => onUpdateVisit(region.id, v.id, patch)}
              onDelete={() => onDeleteVisit(region.id, v.id)}
              onAddPhotos={(files) => onAddPhotos(region.id, v.id, files)}
              onDeletePhoto={(pid) => onDeletePhoto(region.id, v.id, pid)}
              onOpenPhoto={(pid) => openPhoto(v.id, pid)}
            />
          ))}
        </>
      )}
    </div>
  );
}

// Read-only trip card (static site / Visitor view)
function TripCard({ visit, onOpenPhoto }) {
  return (
    <div className="visit-card readonly">
      <div className="trip-date">
        <span className={'trip-kind ' + (visit.year ? 'flag' : 'pin')} />
        {visit.year ? formatVisit(visit) : 'Date unknown'}
        {visit.photos?.length ? <span className="trip-count">{plural(visit.photos.length, 'photo')}</span> : null}
      </div>
      {visit.note && <p className="trip-text">{visit.note}</p>}
      {visit.photos?.length > 0 && (
        <div className="photo-grid">
          {visit.photos.map((p) => (
            <div key={p.id} className="thumb">
              <img src={photoUrl.thumb(p)} alt="" loading="lazy" onClick={() => onOpenPhoto(p.id)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function VisitCard({ visit, uploading, onChange, onDelete, onAddPhotos, onDeletePhoto, onOpenPhoto }) {
  const fileRef = useRef(null);
  const [drag, setDrag] = useState(false);
  const [note, setNote] = useState(visit.note || '');
  const noteTimer = useRef(null);

  const setNoteDebounced = (val) => {
    setNote(val);
    clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => onChange({ note: val }), 500);
  };

  const pickFiles = (list) => {
    const files = [...list].filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
    if (files.length) onAddPhotos(files);
  };

  return (
    <div
      className={'visit-card' + (drag ? ' drag' : '')}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        pickFiles(e.dataTransfer.files);
      }}
    >
      <div className="visit-row">
        <select
          value={visit.year || ''}
          onChange={(e) => onChange({ year: e.target.value ? Number(e.target.value) : null })}
          aria-label="Year"
        >
          <option value="">Year unknown</option>
          {YEARS.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select
          value={visit.month || ''}
          onChange={(e) => onChange({ month: e.target.value ? Number(e.target.value) : null })}
          aria-label="Month"
        >
          <option value="">Month —</option>
          {MONTHS.map((m) => (
            <option key={m} value={m}>
              {MONTH_NAMES[m - 1]}
            </option>
          ))}
        </select>
        <button className="icon-btn danger" onClick={onDelete} title="Delete this trip" aria-label="Delete this trip">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M4 7h16M9 7V5h6v2M7 7l1 12h8l1-12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
      <textarea
        value={note}
        rows={note ? Math.min(6, note.split('\n').length + 1) : 1}
        placeholder="Notes… (cities, who you went with, highlights — optional)"
        onChange={(e) => setNoteDebounced(e.target.value)}
        onBlur={() => {
          clearTimeout(noteTimer.current);
          if (note !== (visit.note || '')) onChange({ note });
        }}
      />
      <div className="photo-grid">
        {(visit.photos || []).map((p) => (
          <div key={p.id} className="thumb">
            <img src={photoUrl.thumb(p)} alt={p.name} loading="lazy" onClick={() => onOpenPhoto(p.id)} />
            <button
              className="thumb-del"
              onClick={() => onDeletePhoto(p.id)}
              title="Delete photo"
              aria-label="Delete photo"
            >
              ×
            </button>
          </div>
        ))}
        {uploading > 0 && (
          <div className="thumb uploading">
            <span className="spinner" />
            <span>Uploading {uploading}…</span>
          </div>
        )}
        <button className="thumb add" onClick={() => fileRef.current?.click()}>
          <span className="plus">+</span>
          <span>Add photos</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          hidden
          onChange={(e) => {
            pickFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      {drag && <div className="drop-hint">Drop to add photos</div>}
    </div>
  );
}
