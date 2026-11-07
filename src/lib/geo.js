import { feature } from 'topojson-client';
import { geoArea, geoBounds } from 'd3-geo';
import { asset } from '../config.js';

export const GROUPS = {
  cn: { label: 'China', unit: 'provinces', total: 34 },
  us: { label: 'United States', unit: 'states', total: 51 },
  w: { label: 'World', unit: 'countries & regions' },
};

export const CONTINENT_ORDER = ['Asia', 'Europe', 'North America', 'South America', 'Africa', 'Oceania', 'Antarctica'];

// Regions smaller than this (in steradians, about 2,000 km²) also get a dot so they are easy to see and click
const TINY_AREA = 5e-5;

const byName = (a, b) => a.n.localeCompare(b.n, 'en');

async function loadTopo(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to load map data: ' + url);
  const topo = await res.json();
  return feature(topo, topo.objects.regions).features;
}

export async function loadRegions() {
  const [hi, lo] = await Promise.all([loadTopo(asset('geo/regions-hi.json')), loadTopo(asset('geo/regions-lo.json'))]);
  const byId = new Map();
  for (const f of hi) {
    const p = f.properties;
    const [[x0, y0], [x1, y1]] = geoBounds(f);
    const lonSpan = x1 >= x0 ? x1 - x0 : x1 + 360 - x0;
    byId.set(p.id, {
      ...p,
      selectable: p.g !== 'x',
      tiny: geoArea(f) < TINY_AREA,
      span: Math.min(Math.max(Math.abs(y1 - y0), lonSpan), 180),
    });
  }
  // both geometry sets share the same property objects, for easy lookup
  for (const f of hi) f.properties = byId.get(f.properties.id);
  for (const f of lo) f.properties = byId.get(f.properties.id);

  const list = [...byId.values()].filter((r) => r.selectable).sort(byName);
  return { hi, lo, byId, list };
}

// Search by name or code
export function searchRegions(list, q) {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const hits = [];
  for (const r of list) {
    const en = r.n.toLowerCase();
    const code = r.id.toLowerCase();
    let score = -1;
    if (en === s || code === s) score = 0;
    else if (en.startsWith(s)) score = 1;
    else if (en.split(/[\s,.&-]+/).some((w) => w.startsWith(s))) score = 2;
    else if (en.includes(s)) score = 3;
    if (score >= 0) hits.push([score, r]);
  }
  hits.sort((a, b) => a[0] - b[0] || byName(a[1], b[1]));
  return hits.slice(0, 30).map((h) => h[1]);
}

export function groupLabel(r) {
  if (r.g === 'cn') return 'China';
  if (r.g === 'us') return 'United States';
  return r.c;
}
