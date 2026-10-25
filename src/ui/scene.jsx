// Draws a scene (chart/draw.js) as Preact SVG elements on the screen. Photo ids become object URLs.
import { FONTS } from '../chart/themes.js';

const n2 = v => Math.round(v * 100) / 100;

function paint(it) {
  const a = {};
  a.fill = it.fill && it.fill !== 'none' ? it.fill : 'none';
  if (it.stroke && it.stroke !== 'none') { a.stroke = it.stroke; a['stroke-width'] = it.sw || 1; }
  if (it.op != null && it.op < 1) a.opacity = it.op;
  if (it.dash) a['stroke-dasharray'] = it.dash.join(' ');
  if (it.cap) a['stroke-linecap'] = it.cap;
  if (it.join) a['stroke-linejoin'] = it.join;
  return a;
}
export function SceneItems({ items, photoUrls, dir }) {
  return items.map((it, i) => <Item key={it.key || i} it={it} photoUrls={photoUrls} dir={dir} />);
}
function Item({ it, photoUrls, dir }) {
  switch (it.t) {
    case 'path': return <path d={it.d} {...paint(it)} />;
    case 'rect': return <rect x={n2(it.x)} y={n2(it.y)} width={n2(it.w)} height={n2(it.h)} rx={it.r ? n2(it.r) : undefined} {...paint(it)} />;
    case 'circle': return <circle cx={n2(it.cx)} cy={n2(it.cy)} r={n2(it.r)} {...paint(it)} />;
    case 'text': {
      if (!it.s) return null;
      const f = FONTS[it.font] || FONTS.ui;
      return (
        <text x={n2(it.x)} y={n2(it.y)} text-anchor="middle" direction={dir} stroke={it.halo || undefined} stroke-width={it.halo ? it.hw || 3 : undefined} stroke-linejoin={it.halo ? 'round' : undefined} paint-order={it.halo ? 'stroke' : undefined} font-family={`"${f.family}", "Nasab Naskh", serif`} font-weight={f.weight} font-size={n2(it.size)} fill={it.fill}
          opacity={it.op != null && it.op < 1 ? it.op : undefined} transform={it.rot ? `rotate(${n2(it.rot)} ${n2(it.rx ?? it.x)} ${n2(it.ry ?? it.y)})` : undefined}>{it.s}</text>
      );
    }
    case 'image': {
      const href = photoUrls && photoUrls.get(it.photo);
      if (!href) return null;
      const id = 'ph-' + it.photo + '-' + Math.round(it.x) + '-' + Math.round(it.y);
      return (
        <g>
          <clipPath id={id}>
            {it.clip && it.clip.shape === 'circle'
              ? <circle cx={n2(it.x + it.w / 2)} cy={n2(it.y + it.h / 2)} r={n2(Math.min(it.w, it.h) / 2)} />
              : <rect x={n2(it.x)} y={n2(it.y)} width={n2(it.w)} height={n2(it.h)} rx={n2((it.clip && it.clip.r) || 0)} />}
          </clipPath>
          <image href={href} x={n2(it.x)} y={n2(it.y)} width={n2(it.w)} height={n2(it.h)} preserveAspectRatio="xMidYMid slice" clip-path={`url(#${id})`} />
        </g>
      );
    }
    case 'g':
      return (
        <g class={it.key ? 'node' : undefined} data-key={it.key} data-id={it.id} transform={it.tf ? `translate(${n2(it.tf[1])} ${n2(it.tf[2])}) scale(${it.tf[0]})` : undefined}>
          {it.hit && <rect x={n2(it.hit.x)} y={n2(it.hit.y)} width={n2(it.hit.w)} height={n2(it.hit.h)} fill="transparent" />}
          <SceneItems items={it.items || []} photoUrls={photoUrls} dir={dir} />
        </g>
      );
    default: return null;
  }
}
