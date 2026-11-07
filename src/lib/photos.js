import { uid } from './store.js';
import { STATIC_SITE, asset } from '../config.js';

const ALLOWED_EXT = /^(jpe?g|png|webp|gif|avif|heic|heif|tiff?|bmp)$/i;

// Each photo has three files:
//   <id>.<ext>       original (local only, never published)
//   <id>_thumb.jpg   720px thumbnail
//   <id>_disp.jpg    2048px display copy (used by the static site)
const THUMB_SIDE = 720;
const DISP_SIDE = 2048;

export const photoUrl = {
  thumb: (p) => asset(`photos/${p.id}_thumb.jpg`),
  full: (p) =>
    p.disp ? asset(`photos/${p.id}_disp.jpg`) : STATIC_SITE ? asset(`photos/${p.id}_thumb.jpg`) : asset(`photos/${p.id}.${p.ext}`),
  original: (p) => asset(`photos/${p.id}.${p.ext}`),
};

async function decode(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // some browsers (e.g. Safari) have limited createImageBitmap support; fall back to <img>
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function toJpeg(source, maxSide, quality) {
  const w0 = source.width || source.naturalWidth;
  const h0 = source.height || source.naturalHeight;
  const scale = Math.min(1, maxSide / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, w, h);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not resize the image'))), 'image/jpeg', quality)
  );
}

async function put(name, blob) {
  const r = await fetch(`/api/photos/${name}`, { method: 'PUT', body: blob });
  if (!r.ok) {
    let msg = 'Upload failed';
    try {
      msg = (await r.json()).error || msg;
    } catch {}
    throw new Error(msg);
  }
}

// Process and upload one photo: original + thumbnail + display copy
export async function uploadPhoto(file) {
  let img;
  try {
    img = await decode(file);
  } catch {
    throw new Error(`Couldn't read "${file.name}". If it's a HEIC photo, export it as JPG first.`);
  }
  const id = uid();
  let ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!ALLOWED_EXT.test(ext)) ext = 'jpg';
  const w = img.width || img.naturalWidth;
  const h = img.height || img.naturalHeight;

  const thumb = await toJpeg(img, THUMB_SIDE, 0.82);
  const disp = await toJpeg(img, DISP_SIDE, 0.86);
  if (img.close) img.close();

  await put(`${id}.${ext}`, file);
  await put(`${id}_thumb.jpg`, thumb);
  await put(`${id}_disp.jpg`, disp);

  return {
    id,
    ext,
    w,
    h,
    name: file.name,
    disp: true,
    taken: file.lastModified ? new Date(file.lastModified).toISOString() : null,
    addedAt: new Date().toISOString(),
  };
}

// For photos uploaded before display copies existed: create one from the original (the site needs it)
export async function createDisplayCopy(photo) {
  const r = await fetch(photoUrl.original(photo));
  if (!r.ok) throw new Error('Original not found');
  const blob = await r.blob();
  const img = await decode(blob);
  const disp = await toJpeg(img, DISP_SIDE, 0.86);
  if (img.close) img.close();
  await put(`${photo.id}_disp.jpg`, disp);
}

export async function deletePhotoFiles(ids) {
  await Promise.all(
    ids.map((id) => fetch(`/api/photos/${id}`, { method: 'DELETE' }).catch(() => {}))
  );
}
