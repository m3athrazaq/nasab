// Bundled into vendor/qr.js (window.NasabQR), loaded only on the screen that links another device:
// drawing the link as a QR code (qrcode-generator, MIT) and reading one from the camera (jsQR, Apache-2.0).
import qrcode from 'qrcode-generator';
import jsQR from 'jsqr';

/** the QR code of a text: rows of '1' (dark) and '0' */
export function matrix(text) {
  const q = qrcode(0, 'M');
  q.addData(text, 'Byte');
  q.make();
  const n = q.getModuleCount(), rows = [];
  for (let r = 0; r < n; r++) { let row = ''; for (let c = 0; c < n; c++) row += q.isDark(r, c) ? '1' : '0'; rows.push(row); }
  return rows;
}
/** the text of a QR code in a camera frame (RGBA pixels), or '' */
export function read(rgba, width, height) {
  const r = jsQR(rgba, width, height, { inversionAttempts: 'attemptBoth' });
  return r ? r.data : '';
}
