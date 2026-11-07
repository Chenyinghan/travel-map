// Static-site build plugin: copies a snapshot of data/travel.json plus each photo's thumbnail and
// display copy into site/. Originals are never copied, and only the fields the site needs are kept
// (no original file names or upload times).
import fs from 'node:fs';
import path from 'node:path';
import { dataDir as defaultDataDir } from './site-config.js';

export function siteData({ dataDir = defaultDataDir() } = {}) {
  return {
    name: 'travel-site-data',
    apply: 'build',
    writeBundle(options) {
      const out = options.dir;
      const src = path.join(dataDir, 'travel.json');
      const data = fs.existsSync(src) ? JSON.parse(fs.readFileSync(src, 'utf8')) : { version: 1, places: {} };
      const photoDir = path.join(dataDir, 'photos');
      const outPhotos = path.join(out, 'photos');
      fs.mkdirSync(outPhotos, { recursive: true });
      fs.mkdirSync(path.join(out, 'data'), { recursive: true });

      let copied = 0;
      const missingThumb = [];
      const missingDisp = [];
      const places = {};
      for (const [id, place] of Object.entries(data.places || {})) {
        const visits = (place.visits || []).map((v) => ({
          id: v.id,
          year: v.year ?? null,
          month: v.month ?? null,
          note: v.note || '',
          photos: (v.photos || []).flatMap((p) => {
            const thumb = path.join(photoDir, `${p.id}_thumb.jpg`);
            const disp = path.join(photoDir, `${p.id}_disp.jpg`);
            if (!fs.existsSync(thumb)) {
              missingThumb.push(p.id);
              return [];
            }
            fs.copyFileSync(thumb, path.join(outPhotos, `${p.id}_thumb.jpg`));
            copied++;
            const hasDisp = fs.existsSync(disp);
            if (hasDisp) {
              fs.copyFileSync(disp, path.join(outPhotos, `${p.id}_disp.jpg`));
              copied++;
            } else {
              missingDisp.push(p.id); // the site falls back to the thumbnail
            }
            return [{ id: p.id, w: p.w, h: p.h, disp: hasDisp }];
          }),
        }));
        places[id] = { visits };
      }
      fs.writeFileSync(path.join(out, 'data', 'travel.json'), JSON.stringify({ version: data.version || 1, places }));
      fs.writeFileSync(path.join(out, '.nojekyll'), ''); // GitHub Pages: serve files as-is, skip Jekyll

      console.log(`\n  [site] ${Object.keys(places).length} places, ${copied} photo files copied`);
      if (missingThumb.length) console.warn(`  [site] ⚠ ${missingThumb.length} photo(s) have no thumbnail and were skipped`);
      if (missingDisp.length)
        console.warn(`  [site] ⚠ ${missingDisp.length} photo(s) have no display copy; the site will show the thumbnail (open npm run dev once to create them)`);
    },
  };
}
