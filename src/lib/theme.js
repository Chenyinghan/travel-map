import { formatVisit, placeStats, plural, sortVisits } from './store.js';
import { groupLabel } from './geo.js';

// Map colors: places you haven't been stay dark; places you've been are "lit up"
export const COLORS = {
  ocean: '#0c1d40',
  oceanEmissive: '#050c1e',
  atmosphere: '#5b8cff',
  lit: '#f7b84b',
  cap: {
    base: '#1a2232',
    hover: '#2c3a55',
    selected: '#3a4b6e',
    lit: '#f7b84b',
    litHover: '#ffcc6e',
    litSelected: '#ffd27e',
    filler: '#151b27',
  },
  side: {
    base: 'rgba(12, 18, 30, 0.75)',
    hover: 'rgba(40, 55, 85, 0.8)',
    selected: 'rgba(80, 105, 150, 0.8)',
    lit: 'rgba(247, 184, 75, 0.55)',
    litHover: 'rgba(255, 210, 126, 0.6)',
    litSelected: 'rgba(255, 226, 168, 0.7)',
    filler: 'rgba(12, 18, 30, 0.75)',
  },
  stroke: {
    base: 'rgba(110, 130, 170, 0.28)',
    hover: 'rgba(170, 190, 230, 0.7)',
    selected: 'rgba(230, 238, 255, 0.95)',
    lit: 'rgba(255, 236, 200, 0.55)',
    litHover: 'rgba(255, 245, 225, 0.9)',
    litSelected: 'rgba(255, 255, 255, 1)',
    filler: 'rgba(110, 130, 170, 0.12)',
  },
};

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function tooltipHtml(r, place, lit, lightMode, readOnly) {
  let meta;
  if (lit) {
    const st = placeStats(place);
    const last = place && place.visits.length ? sortVisits(place.visits)[0] : null;
    const bits = ['Visited'];
    if (st.visits) bits.push(plural(st.visits, 'trip'));
    if (st.photos) bits.push(plural(st.photos, 'photo'));
    meta = `<div class="tt-meta lit">${bits.join(' · ')}</div>` + (last ? `<div class="tt-sub">Last: ${formatVisit(last)}</div>` : '');
  } else {
    meta = `<div class="tt-meta">Not visited yet</div>`;
  }
  let hint = '';
  if (lightMode) hint = lit ? 'Click to turn off' : 'Click to light up';
  else if (lit) hint = 'Click to see trips';
  else if (!readOnly) hint = 'Click for details';
  return `<div class="tt">
    <div class="tt-name">${esc(r.n)}</div>
    <div class="tt-en">${esc(groupLabel(r))}</div>
    ${meta}
    ${hint ? `<div class="tt-hint">${hint}</div>` : ''}
  </div>`;
}
