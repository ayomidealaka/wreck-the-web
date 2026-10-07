// Character picker: AI-generated candidates shown zoomed and at real in-game size.
const list = await (await fetch('/art/candidates/list.json')).json();
const dpr = Math.min(devicePixelRatio || 1, 2);

let picks = {};
try { picks = JSON.parse(localStorage.getItem('wtw-candidate-picks') || '{}'); } catch {}
const save = () => { try { localStorage.setItem('wtw-candidate-picks', JSON.stringify(picks)); } catch {} };
const label = (i, c) => `${i + 1} ${c.desc.split(',')[0]}`;
function summary() {
  const t = list.map((c, i) => picks[c.file] ? label(i, c) : null).filter(Boolean).join(' · ');
  document.getElementById('picks').innerHTML = t ? 'Your picks: <b>' + t + '</b>' : 'Tap <b>Pick</b> on the ones you like.';
  return t;
}
document.getElementById('clear').onclick = () => { picks = {}; save(); document.querySelectorAll('.card').forEach(c => { c.classList.remove('on'); c.querySelector('.pick').textContent = 'Pick'; }); summary(); };
document.getElementById('copy').onclick = async () => {
  const t = summary(); if (!t) return toast('Pick something first.');
  try { await navigator.clipboard.writeText('My picks: ' + t); toast('Copied. Paste it to me.'); } catch { toast('My picks: ' + t); }
};
function toast(s) { const t = document.getElementById('toast'); t.textContent = s; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2500); }

function page(g, x, y, w, h, dark, seed) {
  g.fillStyle = dark ? '#121417' : '#FFFFFF'; g.fillRect(x, y, w, h);
  let r = seed * 1000; const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
  const ink = dark ? '#3A3F48' : '#D5D8DE', link = dark ? '#2D5BD0' : '#9DB8F2';
  g.fillStyle = dark ? '#E8EAED' : '#202124'; g.fillRect(x + 10, y + 10, w * 0.45, 9);
  for (let ly = y + 30; ly < y + h - 6; ly += 16) { let lx = x + 10; while (lx < x + w - 14) { const ww = 10 + rnd() * 34; g.fillStyle = rnd() < 0.15 ? link : ink; g.fillRect(lx, ly, Math.min(ww, x + w - 10 - lx), 8); lx += ww + 5; } }
}

const root = document.getElementById('cards');
list.forEach((c, i) => {
  const el = document.createElement('article'); el.className = 'card' + (picks[c.file] ? ' on' : '');
  const cw = 340, ch = 230, cv = document.createElement('canvas');
  cv.width = cw * dpr; cv.height = ch * dpr; cv.style.aspectRatio = `${cw} / ${ch}`; cv.style.cursor = 'default';
  el.append(cv);
  const meta = document.createElement('div'); meta.className = 'meta';
  meta.innerHTML = `<div class="txt"><span class="num">${i + 1}</span> <span class="name">${c.desc.split(',')[0]}</span><div class="blurb">${c.desc.split(',').slice(1).join(',').trim()}</div></div>`;
  const b = document.createElement('button'); b.className = 'pick'; b.textContent = picks[c.file] ? 'Picked' : 'Pick';
  b.onclick = () => { picks[c.file] = !picks[c.file]; save(); el.classList.toggle('on', picks[c.file]); b.textContent = picks[c.file] ? 'Picked' : 'Pick'; summary(); };
  meta.append(b); el.append(meta); root.append(el);
  const img = new Image(); img.src = `/art/candidates/${c.file}`;
  img.onload = () => {
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.imageSmoothingEnabled = false;
    g.fillStyle = '#8E8E8E'; g.fillRect(0, 0, 170, ch);
    g.drawImage(img, 85 - img.width * 2, ch - 12 - img.height * 4, img.width * 4, img.height * 4);
    for (const [sy, dark] of [[0, false], [ch / 2 + 2, true]]) {
      const sx = 178, sw = cw - sx - 6, sh = ch / 2 - 4;
      g.save(); g.beginPath(); g.rect(sx, sy + 4, sw, sh); g.clip();
      page(g, sx, sy + 4, sw, sh, dark, 3 + i);
      // feet on a text line: real size, 1 image px = 1 page px
      g.drawImage(img, Math.round(sx + sw / 2 - img.width / 2), Math.round(sy + 4 + 78 - img.height), img.width, img.height);
      g.restore();
    }
  };
});
summary();
