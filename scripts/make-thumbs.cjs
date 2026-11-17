// 옷장 목록 그림 미리 찍기: 탁구채·몸·탁구공 아이템을 3D로 그려 src/thumbs/<아이템 id>.webp 로 저장한다.
// 아이템을 추가하거나 모양을 바꾸면 한 번 실행: npm run thumbs
// (그림 파일이 없는 아이템은 게임이 예전처럼 그 자리에서 찍는다 — 느릴 뿐 고장은 아님)
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const PORT = 5199;
const OUT = path.join(__dirname, '..', 'src', 'thumbs');
const only = process.argv.slice(2); // 아이템 id를 주면 그것만

(async () => {
  const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore' });
  try {
    await new Promise((r) => setTimeout(r, 3000));
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(`http://localhost:${PORT}/outfits.html`); // 가벼운 페이지 (게임 화면은 안 띄움)
    const shots = await page.evaluate(async (only) => {
      const I = await import('/src/items.js');
      const make = { paddle: I.paddleImage, body: I.outfitImage, ball: I.ballImage };
      const toWebp = (url) => new Promise((res) => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = img.width; c.height = img.height;
          c.getContext('2d').drawImage(img, 0, 0);
          res(c.toDataURL('image/webp', 0.92));
        };
        img.onerror = () => res('');
        img.src = url;
      });
      const out = [];
      for (const it of I.ITEMS) {
        if (!make[it.cat] || (only.length && !only.includes(it.id))) continue;
        const png = make[it.cat](it, 128);
        out.push([it.id, png ? await toWebp(png) : '']);
      }
      return out;
    }, only);
    await browser.close();
    fs.mkdirSync(OUT, { recursive: true });
    let n = 0;
    for (const [id, url] of shots) {
      if (!url.startsWith('data:image/webp')) { console.log('실패:', id); continue; }
      fs.writeFileSync(path.join(OUT, id + '.webp'), Buffer.from(url.split(',')[1], 'base64'));
      n++;
    }
    console.log(`그림 ${n}개 저장 → src/thumbs/`);
  } finally {
    vite.kill();
  }
})();
