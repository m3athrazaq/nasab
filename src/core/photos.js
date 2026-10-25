// People's photos: cropped square and made smaller on the phone (720 px, JPEG), kept in IndexedDB.
import { idbGet, idbPut, idbDel, idbKeys } from './idb.js';
import { uid } from './util.js';

const SIZE = 720, Q = 0.86;
const urls = new Map();

function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
    img.decoding = 'async';
    img.src = url;
  });
}
/** a picked image → a square JPEG Blob of the middle of the picture (the browser applies the camera's rotation) */
export async function squareJpeg(blob, size = SIZE, q = Q) {
  const { img, url } = await loadImage(blob);
  try {
    const w0 = img.naturalWidth, h0 = img.naturalHeight;
    if (!w0 || !h0) throw new Error('image');
    const side = Math.min(w0, h0);
    // faces are usually in the upper part of a portrait: crop a little above the middle
    const sx = (w0 - side) / 2, sy = h0 > w0 ? Math.max(0, (h0 - side) * 0.3) : (h0 - side) / 2;
    const out = Math.min(size, side);
    const c = document.createElement('canvas');
    c.width = out; c.height = out;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, out, out);
    ctx.drawImage(img, sx, sy, side, side, 0, 0, out, out);
    const res = await new Promise(r => c.toBlob(r, 'image/jpeg', q));
    if (!res) throw new Error('image');
    return res;
  } finally { URL.revokeObjectURL(url); }
}
/** saves a picked image file → photo id */
export async function addPhoto(file) {
  if (!file || (file.type && !file.type.startsWith('image/'))) throw new Error('image');
  const blob = await squareJpeg(file);
  const id = uid();
  await idbPut('photos', id, blob);
  return id;
}
export async function photoURL(id) {
  if (!id) return '';
  if (urls.has(id)) return urls.get(id);
  const b = await idbGet('photos', id).catch(() => null);
  if (!b) return '';
  const u = URL.createObjectURL(b);
  urls.set(id, u);
  return u;
}
export const photoBlob = id => idbGet('photos', id);
export async function deletePhoto(id) {
  if (!id) return;
  if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); }
  await idbDel('photos', id).catch(() => {});
}
export async function putPhotoBlob(id, blob) {
  if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); }
  await idbPut('photos', id, blob);
}
export const allPhotoIds = () => idbKeys('photos').catch(() => []);
/** photos nobody uses any more (a deleted person, a replaced backup) */
export async function tidyPhotos(state) {
  const keep = new Set(Object.values(state.people).map(p => p.photo).filter(Boolean));
  for (const id of await allPhotoIds()) if (!keep.has(id)) await deletePhoto(id);
}
/** a smaller JPEG of a photo, as bytes (for PDFs, images and shared files) */
export async function photoJpegBytes(id, size = 300) {
  const b = await photoBlob(id).catch(() => null);
  if (!b) return null;
  const small = await squareJpeg(b, size, 0.84);
  return new Uint8Array(await small.arrayBuffer());
}
export async function photoImage(id, size = 300) {
  const b = await photoBlob(id).catch(() => null);
  if (!b) return null;
  const small = size ? await squareJpeg(b, size, 0.9) : b;
  const { img } = await loadImage(small);
  return img;
}
