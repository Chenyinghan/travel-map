// Builds the map data: every country (except China and the US) + China's provinces + US states.
// Source: Natural Earth 1:10m (public domain)
//   ne_10m_admin_0_countries.geojson
//   ne_10m_admin_1_states_provinces.geojson
// Usage: node scripts/build-geo.mjs <admin0.geojson> <admin1.geojson>
//
// Properties of each region:
//   id      unique code (ISO A3 for countries, ISO 3166-2 for provinces / states)
//   g       group: w world / cn China / us United States / x non-selectable fragment
//   n       name (shown in the UI)
//   c       continent
//   lx, ly  label point (longitude, latitude)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import mapshaper from 'mapshaper';
import { geoCentroid } from 'd3-geo';

const [admin0Path, admin1Path] = process.argv.slice(2);
if (!admin0Path || !admin1Path) {
  console.error('Usage: node scripts/build-geo.mjs <admin0.geojson> <admin1.geojson>');
  process.exit(1);
}

const admin0 = JSON.parse(fs.readFileSync(admin0Path, 'utf8'));
const admin1 = JSON.parse(fs.readFileSync(admin1Path, 'utf8'));

const CONTINENT = {
  Asia: 'Asia',
  Europe: 'Europe',
  Africa: 'Africa',
  'North America': 'North America',
  'South America': 'South America',
  Oceania: 'Oceania',
  Antarctica: 'Antarctica',
  'Seven seas (open ocean)': 'Oceania',
};

// Natural Earth puts remote islands in "Seven seas"; assign them to the nearest continent
const CONTINENT_FIX = {
  SYC: 'Africa',
  MUS: 'Africa',
  SHN: 'Africa',
  ATF: 'Africa',
  MDV: 'Asia',
  IOT: 'Asia',
  SGS: 'South America',
  HMD: 'Oceania',
};

// Uninhabited, disputed or leased fragments: kept on the map so there are no holes, but not selectable
const FILLERS = new Set([
  'BRI', 'CNM', 'KAS', 'SPI', 'BRT', 'USG', 'KAB', 'ESB', 'WSB',
  'CSI', 'PGA', 'CLP', 'ATC', 'BJN', 'SER', 'SCR',
]);

// Regions listed in the China group (ISO 3166-2 codes)
const CN_EXTRA = {
  TWN: { id: 'CN-TW', n: 'Taiwan' },
  HKG: { id: 'CN-HK', n: 'Hong Kong' },
  MAC: { id: 'CN-MO', n: 'Macau' },
};

// Name fixes
const EN_FIX = {
  CYN: 'Northern Cyprus',
  CIV: "Côte d'Ivoire",
  TLS: 'Timor-Leste',
  IOA: 'Christmas & Cocos Islands',
  'CN-NM': 'Inner Mongolia',
  'US-DC': 'Washington, D.C.',
};

// Natural Earth merges some overseas territories into the mainland shape (lighting up France would
// also light up French Guiana in South America). Split them out by bounding box: [west, south, east, north]
const SPLITS = {
  FRA: [
    { id: 'GUF', n: 'French Guiana', c: 'South America', box: [-55, 1.5, -51, 6.5] },
    { id: 'GLP', n: 'Guadeloupe', c: 'North America', box: [-62, 15.8, -60.9, 16.6] },
    { id: 'MTQ', n: 'Martinique', c: 'North America', box: [-61.4, 14.3, -60.7, 15] },
    { id: 'REU', n: 'Réunion', c: 'Africa', box: [55, -21.5, 56, -20.8] },
    { id: 'MYT', n: 'Mayotte', c: 'Africa', box: [44.8, -13.2, 45.4, -12.5] },
  ],
  NLD: [{ id: 'BES', n: 'Caribbean Netherlands', c: 'North America', box: [-69, 11.5, -62, 18.5] }],
  NOR: [{ id: 'SJM', n: 'Svalbard & Jan Mayen', c: 'Europe', box: [-10, 70.5, 36, 81.5] }],
};

const inBox = (poly, [w, s, e, n]) => {
  const [x, y] = poly[0][0];
  return x >= w && x <= e && y >= s && y <= n;
};

function splitOverseas(a3, geometry) {
  const rules = SPLITS[a3];
  if (!rules) return { geometry, parts: [] };
  let polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const parts = [];
  for (const r of rules) {
    const mine = polys.filter((pl) => inBox(pl, r.box));
    if (!mine.length) throw new Error(`No polygons found when splitting ${r.id} from ${a3}`);
    polys = polys.filter((pl) => !mine.includes(pl));
    const g = { type: 'MultiPolygon', coordinates: mine };
    const [lx, ly] = geoCentroid({ type: 'Feature', geometry: g });
    parts.push({ type: 'Feature', geometry: g, properties: { id: r.id, g: 'w', n: r.n, c: r.c, lx, ly } });
  }
  return { geometry: { type: 'MultiPolygon', coordinates: polys }, parts };
}

const features = [];

for (const f of admin0.features) {
  const p = f.properties;
  const a3 = p.ADM0_A3;
  if (a3 === 'CHN' || a3 === 'USA') continue;
  if (CN_EXTRA[a3]) {
    const x = CN_EXTRA[a3];
    features.push({
      type: 'Feature',
      geometry: f.geometry,
      properties: { id: x.id, g: 'cn', n: x.n, c: 'Asia', lx: p.LABEL_X, ly: p.LABEL_Y },
    });
    continue;
  }
  const { geometry, parts } = splitOverseas(a3, f.geometry);
  features.push(...parts);
  features.push({
    type: 'Feature',
    geometry,
    properties: {
      id: a3,
      g: FILLERS.has(a3) ? 'x' : 'w',
      n: EN_FIX[a3] || p.NAME_EN || p.NAME,
      c: CONTINENT_FIX[a3] || CONTINENT[p.CONTINENT] || 'Other',
      lx: p.LABEL_X,
      ly: p.LABEL_Y,
    },
  });
}

// China's provinces; the Paracel Islands are merged into Hainan
const cnFeatures = admin1.features.filter((f) => f.properties.adm0_a3 === 'CHN');
const toMulti = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
const paracel = cnFeatures.find((f) => f.properties.iso_3166_2 === 'CN-X01~');
for (const f of cnFeatures) {
  const p = f.properties;
  const id = p.iso_3166_2;
  if (id === 'CN-X01~') continue;
  let geometry = f.geometry;
  if (id === 'CN-HI' && paracel) {
    geometry = { type: 'MultiPolygon', coordinates: [...toMulti(geometry), ...toMulti(paracel.geometry)] };
  }
  features.push({
    type: 'Feature',
    geometry,
    properties: {
      id,
      g: 'cn',
      n: EN_FIX[id] || p.name_en || p.name,
      c: 'Asia',
      lx: p.longitude,
      ly: p.latitude,
    },
  });
}

// US: 50 states + Washington, D.C.
for (const f of admin1.features.filter((f) => f.properties.adm0_a3 === 'USA')) {
  const p = f.properties;
  const id = p.iso_3166_2;
  features.push({
    type: 'Feature',
    geometry: f.geometry,
    properties: {
      id,
      g: 'us',
      n: EN_FIX[id] || p.name_en || p.name,
      c: 'North America',
      lx: p.longitude,
      ly: p.latitude,
    },
  });
}

// Sanity checks
const ids = new Set();
for (const f of features) {
  if (ids.has(f.properties.id)) throw new Error('Duplicate id: ' + f.properties.id);
  ids.add(f.properties.id);
  if (!f.properties.n) throw new Error('Missing name: ' + f.properties.id);
}
const count = (g) => features.filter((f) => f.properties.g === g).length;
console.log(`World: ${count('w')}  China: ${count('cn')}  US: ${count('us')}  Non-selectable: ${count('x')}`);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'travel-geo-'));
const combined = path.join(tmp, 'regions.geojson');
fs.writeFileSync(combined, JSON.stringify({ type: 'FeatureCollection', features }));

const outDir = path.resolve('public/geo');
fs.mkdirSync(outDir, { recursive: true });

// Two detail levels: hi for the flat map (zoomable), lo for the globe (faster to triangulate)
const levels = [
  { file: 'regions-hi.json', pct: '5%' },
  { file: 'regions-lo.json', pct: '1.5%' },
];
for (const l of levels) {
  const out = path.join(outDir, l.file);
  await mapshaper.runCommands(
    `-i "${combined}" name=regions ` +
      `-simplify ${l.pct} weighted keep-shapes ` +
      `-clean allow-overlaps ` +
      `-o "${out}" format=topojson quantization=100000 force`
  );
  console.log(l.file, (fs.statSync(out).size / 1024).toFixed(0) + ' KB');
}
fs.rmSync(tmp, { recursive: true, force: true });
