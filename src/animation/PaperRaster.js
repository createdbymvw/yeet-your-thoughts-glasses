/**
 * PaperRaster — draws a bitmap replica of the DOM paper (sheet + grain + text)
 * so the burn can consume the *actual* words. The DOM paper is hidden while
 * the raster burns; the two are styled to match.
 */

let grainTile = null;

function getGrainTile() {
  if (grainTile) return grainTile;
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = 150 + Math.random() * 105; // mostly light with darker specks
    d[i] = v; d[i + 1] = v * 0.97; d[i + 2] = v * 0.92; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  grainTile = c;
  return c;
}

function wrapLines(ctx, text, maxWidth) {
  const out = [];
  for (const para of String(text).split(/\r?\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) { out.push(''); continue; }
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width <= maxWidth || !line) line = test;
      else { out.push(line); line = word; }
    }
    out.push(line);
  }
  return out;
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * @param {object} o
 * @param {number} o.width    CSS px
 * @param {number} o.height   CSS px
 * @param {number} o.scale    backing-store scale (dpr × preview scale)
 * @param {string} o.text
 * @param {object} o.style    { fontFamily, fontSize, lineHeight, color, paper, padding }
 */
export function renderPaper({ width, height, scale, text, style }) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  // sheet
  roundedRect(ctx, 0, 0, width, height, 3);
  ctx.fillStyle = style.paper;
  ctx.fill();
  ctx.save();
  ctx.clip();

  // grain
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.12;
  const tile = getGrainTile();
  for (let y = 0; y < height; y += tile.height) {
    for (let x = 0; x < width; x += tile.width) ctx.drawImage(tile, x, y);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  // tonal shading (mirrors .paper::after)
  const g1 = ctx.createLinearGradient(0, 0, 0, height);
  g1.addColorStop(0, 'rgba(255,255,255,0.35)');
  g1.addColorStop(0.3, 'rgba(255,255,255,0)');
  g1.addColorStop(1, 'rgba(120,80,40,0.05)');
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, width, height);
  const g2 = ctx.createRadialGradient(width / 2, height * 1.1, 0, width / 2, height * 1.1, width * 0.7);
  g2.addColorStop(0, 'rgba(255,120,40,0.10)');
  g2.addColorStop(1, 'rgba(255,120,40,0)');
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, width, height);

  // text
  const pad = style.padding;
  ctx.fillStyle = style.color;
  ctx.font = `${style.fontSize}px ${style.fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lh = style.lineHeight;
  const maxLines = Math.max(1, Math.floor((height - pad * 2) / lh));
  const lines = wrapLines(ctx, text, width - pad * 2).slice(0, maxLines);
  const total = lines.length * lh;
  const y0 = height / 2 - total / 2 + lh / 2;
  lines.forEach((line, i) => ctx.fillText(line, width / 2, y0 + i * lh));

  ctx.restore();
  return canvas;
}

/** Zero a canvas's pixels so the thought does not linger in GPU/CPU memory longer than needed. */
export function scrubCanvas(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx?.clearRect(0, 0, canvas.width, canvas.height);
  canvas.width = canvas.height = 1;
}
