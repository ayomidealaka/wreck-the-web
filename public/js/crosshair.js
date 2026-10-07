// One reticle per weapon, modelled on its real sight (screen space, crisp pixels). Every mark is drawn twice: a dark
// edge, then the weapon's colour on top, so it reads on white pages and dark ones alike. `kick` (0..1, from recoil)
// opens up the spread on the guns that have one.
const EDGE = 'rgba(14,11,22,0.85)';

export function drawCrosshair(g, x, y, w, { t = 0, kick = 0 } = {}) {
  x = Math.round(x); y = Math.round(y);
  const col = w?.color || '#FFFFFF';
  // a filled rect with a 1px dark edge
  const box = (bx, by, bw, bh, c = col) => { g.fillStyle = EDGE; g.fillRect(x + bx - 1, y + by - 1, bw + 2, bh + 2); g.fillStyle = c; g.fillRect(x + bx, y + by, bw, bh); };
  const boxes = (list, c) => { g.fillStyle = EDGE; for (const [bx, by, bw, bh] of list) g.fillRect(x + bx - 1, y + by - 1, bw + 2, bh + 2); g.fillStyle = c || col; for (const [bx, by, bw, bh] of list) g.fillRect(x + bx, y + by, bw, bh); };
  // 4 ticks around the centre: gap from the centre, length
  const cross = (gap, len, th = 1) => boxes([[-gap - len, -(th >> 1), len, th], [gap + 1, -(th >> 1), len, th], [-(th >> 1), -gap - len, th, len], [-(th >> 1), gap + 1, th, len]]);
  const dot = (s = 1, c) => box(-(s >> 1), -(s >> 1), s, s, c);
  const ring = (r, a0 = 0, a1 = Math.PI * 2, c = col, lw = 1) => {
    g.lineWidth = lw + 2; g.strokeStyle = EDGE; g.beginPath(); g.arc(x + 0.5, y + 0.5, r, a0, a1); g.stroke();
    g.lineWidth = lw; g.strokeStyle = c; g.beginPath(); g.arc(x + 0.5, y + 0.5, r, a0, a1); g.stroke();
  };
  g.save();
  switch (w?.id) {
    case 'uzi': // SMG: a short cross that blooms wide as it sprays, centre dot
      cross(3 + Math.round(kick * 9), 3); dot(1); break;
    case 'ak47': // assault rifle: longer cross that blooms while firing, centre dot
      cross(4 + Math.round(kick * 8), 5); dot(2); break;
    case 'minigun': { // spray: a spread circle that opens up while spinning, centre dot, ticks outside
      const r = 10 + Math.round(kick * 8);
      ring(r); boxes([[-r - 6, 0, 3, 1], [r + 4, 0, 3, 1], [0, -r - 6, 1, 3], [0, r + 4, 1, 3]]); dot(2); break;
    }
    case 'scatter': { // shotgun: wide pellet-spread circle broken at the cardinals, short ticks inward, centre dot
      const r = 15 + Math.round(kick * 5);
      for (let k = 0; k < 4; k++) ring(r, k * Math.PI / 2 + 0.28, (k + 1) * Math.PI / 2 - 0.28);
      boxes([[-r, 0, 4, 1], [r - 3, 0, 4, 1], [0, -r, 1, 4], [0, r - 3, 1, 4]]); dot(1); break;
    }
    case 'sniper': { // scope: long fine crosshair with mil-dots, small centre circle, outer scope ring
      ring(30, 0, Math.PI * 2, 'rgba(255,255,255,0.5)');
      cross(4, 24);
      const mils = []; for (let k = 8; k <= 24; k += 6) mils.push([-k - 1, -1, 1, 3], [k + 1, -1, 1, 3], [-1, -k - 1, 3, 1], [-1, k + 1, 3, 1]);
      boxes(mils); ring(3, 0, Math.PI * 2); dot(1, '#FF3A30'); break;
    }
    case 'launcher': { // 40mm leaf sight: aim chevron with holdover bars below for longer lobs
      boxes([[-5, -3, 1, 1], [-4, -2, 1, 1], [-3, -1, 1, 1], [-2, 0, 1, 1], [-1, 1, 1, 1], [0, 1, 1, 1], [1, 0, 1, 1], [2, -1, 1, 1], [3, -2, 1, 1], [4, -3, 1, 1]]);
      boxes([[-6, 6, 13, 1], [-4, 11, 9, 1], [-2, 16, 5, 1]]);
      boxes([[0, 7, 1, 3], [0, 12, 1, 3]], 'rgba(255,255,255,0.7)'); break;
    }
    case 'rocket': { // launcher: lock-on box (corner brackets) with a blinking centre
      const s = 11 + Math.round(kick * 4), L = 5;
      boxes([[-s, -s, L, 1], [-s, -s, 1, L], [s - L + 1, -s, L, 1], [s, -s, 1, L], [-s, s, L, 1], [-s, s - L + 1, 1, L], [s - L + 1, s, L, 1], [s, s - L + 1, 1, L]]);
      if ((t * 4 | 0) % 2) dot(3, '#FF3B3B'); else dot(1); break;
    }
    case 'flamer': { // flamethrower: wide rotating dashed ring (spray cone), hot centre
      for (let k = 0; k < 8; k++) { const a = t * 1.5 + k * Math.PI / 4; ring(16 + Math.round(kick * 3), a, a + 0.38); }
      dot(3, '#FFE07A'); break;
    }
    case 'laser': { // beam: diamond focus with fine lines out
      boxes([[0, -4, 1, 1], [-1, -3, 1, 1], [1, -3, 1, 1], [-2, -2, 1, 1], [2, -2, 1, 1], [-3, -1, 1, 1], [3, -1, 1, 1], [-4, 0, 1, 1], [4, 0, 1, 1],
        [-3, 1, 1, 1], [3, 1, 1, 1], [-2, 2, 1, 1], [2, 2, 1, 1], [-1, 3, 1, 1], [1, 3, 1, 1], [0, 4, 1, 1]]);
      cross(7, 6); dot(1, '#FFFFFF'); break;
    }
    case 'well': { // gravity well: two arcs spiralling in, dark core
      for (let k = 0; k < 2; k++) { const a = -t * 3 + k * Math.PI; ring(9, a, a + 2.1); ring(14, a + 0.6, a + 1.6); }
      dot(3, '#1A0F2E'); dot(1, '#E8DBFF'); break;
    }
    case 'drone': { // drone designator: a target triangle turning around the mark, centre dot
      const pts = [0, 1, 2].map(k => { const a = t * 1.6 + k * Math.PI * 2 / 3 - Math.PI / 2; return [x + 0.5 + Math.cos(a) * 13, y + 0.5 + Math.sin(a) * 13]; });
      for (const [c, lw] of [[EDGE, 3], [col, 1]]) {
        g.strokeStyle = c; g.lineWidth = lw; g.beginPath();
        pts.forEach(([px, py], k) => { const [qx, qy] = pts[(k + 1) % 3]; g.moveTo(px, py); g.lineTo(px + (qx - px) * 0.3, py + (qy - py) * 0.3); g.moveTo(px + (qx - px) * 0.7, py + (qy - py) * 0.7); g.lineTo(qx, qy); });
        g.stroke();
      }
      dot(2); break;
    }
    case 'nuke': { // nuke: blast-radius ring (dashed) around a radiation trefoil
      for (let k = 0; k < 12; k++) { const a = t * 0.6 + k * Math.PI / 6; ring(24, a, a + 0.3); }
      for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + k * Math.PI * 2 / 3; ring(5, a - 0.5, a + 0.5, col, 4); }
      dot(3, '#1A1608'); dot(1); break;
    }
    case 'mirv': { // cluster launcher: a wide drop zone ring with eight ticks (one per bomblet) and a centre dot
      const r = 20 + Math.round(kick * 4);
      ring(r, 0, Math.PI * 2, 'rgba(255,178,56,0.7)');
      const ticks = []; for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; ticks.push([Math.round(Math.cos(a) * r) - 1, Math.round(Math.sin(a) * r) - 1, 2, 2]); }
      boxes(ticks); dot(2); break;
    }
    case 'star': { // pulsar: two thin rotating jets through a small ring
      ring(6);
      for (const [c, lw] of [[EDGE, 3], [col, 1]]) {
        g.strokeStyle = c; g.lineWidth = lw; g.beginPath();
        for (let k = 0; k < 2; k++) { const a = t * 3 + k * Math.PI; g.moveTo(x + 0.5 + Math.cos(a) * 8, y + 0.5 + Math.sin(a) * 8); g.lineTo(x + 0.5 + Math.cos(a) * 22, y + 0.5 + Math.sin(a) * 22); }
        g.stroke();
      }
      dot(2, '#FFFFFF'); break;
    }
    default:
      cross(4, 4); dot(1);
  }
  g.restore();
}
