try {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const R = [];
    const cs = (el, p) => getComputedStyle(el)[p];
    const $ = (s) => document.querySelector(s);
    const de = document.documentElement;
    /* the page sets scroll-behavior: smooth, so a bare scrollTo animates and
       every sample below would be taken somewhere between two positions */
    const go = (y) => window.scrollTo({ top: y, left: 0, behavior: 'instant' });

    R.push('=== ' + window.innerWidth + 'x' + window.innerHeight + ' ===');

    /* ---- horizontal overflow, before and after the garden opens ---- */
    const before = { sw: de.scrollWidth, cw: de.clientWidth };
    R.push('');
    R.push('--- horizontal scrollbar ---');
    R.push('  coffee page: scrollWidth ' + before.sw + ' vs clientWidth ' + before.cw +
        (before.sw <= before.cw ? '  PASS' : '  FAIL'));
    window.scrollTo({top: 400, behavior: 'instant'});
    await wait(100);
    R.push('  scrollTo(400) -> scrollX = ' + window.scrollX +
        (window.scrollX === 0 ? '  PASS cannot pan sideways' : '  FAIL pans'));
    go(0);

    /* ---- open the garden ---- */
    const c = document.getElementById('beanCracker');
    for (let i = 0; i < 8; i++) { c.click(); await wait(400); }
    await wait(9000);

    const after = { sw: de.scrollWidth, cw: de.clientWidth };
    R.push('  garden:      scrollWidth ' + after.sw + ' vs clientWidth ' + after.cw +
        (after.sw <= after.cw ? '  PASS' : '  FAIL'));
    window.scrollTo({top: 400, behavior: 'instant'});
    await wait(100);
    R.push('  scrollTo(400) -> scrollX = ' + window.scrollX +
        (window.scrollX === 0 ? '  PASS cannot pan sideways' : '  FAIL pans'));
    go(0);

    const stage = $('.sakura-stage');
    const scene = $('#sakura-scene');
    const svg = $('.sakura-tree-svg');
    const sr = stage.getBoundingClientRect();
    const W = sr.width, H = sr.height;

    /* ---- the tree ---- */
    R.push('');
    R.push('--- tree ---');
    const bB = $('.sakura-branches').getBBox();
    const bL = $('.sakura-blossoms').getBBox();
    const x0 = Math.min(bB.x, bL.x), x1 = Math.max(bB.x + bB.width, bL.x + bL.width);
    const y0 = Math.min(bB.y, bL.y), y1 = Math.max(bB.y + bB.height, bL.y + bL.height);
    const vb = svg.getAttribute('viewBox').split(/\s+/).map(Number);
    const scale = W / vb[2];
    R.push('  viewBox aspect ' + (vb[2] / vb[3]).toFixed(3) + ' vs stage ' + (W / H).toFixed(3) +
        (Math.abs(vb[2] / vb[3] - W / H) < 0.06 ? '  PASS' : '  FAIL'));
    R.push('  tree fills ' + (100 * (x1 - x0) * scale / W).toFixed(0) + '% of width, ' +
        (100 * (y1 - y0) * scale / H).toFixed(0) + '% of height');
    const bl = $('.sk-bloom-front').getBoundingClientRect();
    R.push('  a blossom = ' + bl.width.toFixed(1) + 'px' + (bl.width >= 9 ? '  PASS' : '  TOO SMALL'));

    const anchors = Array.from(document.querySelectorAll('.sakura-anchor'));
    const tips = Array.from(document.querySelectorAll('.sakura-tips > g'));
    let worst = 0;
    for (let i = 0; i < Math.min(anchors.length, tips.length); i++) {
        const a = anchors[i].getBoundingClientRect(), t = tips[i].getBoundingClientRect();
        if (!t.width && !t.height) continue;
        worst = Math.max(worst, Math.hypot((t.left + t.width / 2) - (a.left + a.width / 2),
                                           (t.top + t.height / 2) - (a.top + a.height / 2)));
    }
    R.push('  worst tip offset = ' + worst.toFixed(1) + 'px' + (worst < 3 ? '  PASS' : '  FAIL'));

    /* ---- messages at rest ---- */
    const ws = Array.from(document.querySelectorAll('.sakura-whisper'));
    const boxes = ws.map((w) => {
        const r = w.getBoundingClientRect();
        return { x: r.left - sr.left, y: r.top - sr.top, w: r.width, h: r.height };
    });
    let oob = 0, off = 0;
    for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (b.x < -1 || b.x + b.w > W + 1 || b.y < -1 || b.y + b.h > H + 1) oob++;
        for (let j = i + 1; j < boxes.length; j++) {
            const d = boxes[j];
            if (Math.min(b.x + b.w, d.x + d.w) - Math.max(b.x, d.x) > 0.5 &&
                Math.min(b.y + b.h, d.y + d.h) - Math.max(b.y, d.y) > 0.5) off++;
        }
    }
    R.push('');
    R.push('--- messages ---');
    const hs = boxes.map((b) => Math.round(b.h));
    /* one column when narrow, two when wide, so the "does it fit" verdict has to
       be computed per column or it condemns a layout that is actually fine */
    const wide = W >= 560;
    const colNeed = [0, 0];
    boxes.forEach((b) => {
        const side = wide ? (b.x + b.w / 2 > W / 2 ? 0 : 1) : 0;
        colNeed[side] += b.h + 6;
    });
    const need = Math.max.apply(null, colNeed) - 6;
    R.push('  ' + ws.length + ' cards, font ' + cs(ws[0], 'fontSize') +
        '   out of bounds ' + oob + (oob === 0 ? '  PASS' : '  FAIL') +
        '   overlaps ' + off + (off === 0 ? '  PASS' : '  FAIL'));
    R.push('  card ' + Math.round(boxes[0].w) + 'x' + hs.join('/') +
        '   tallest column needs ' + need + 'px of ' + Math.round(H) +
        (need + 20 <= H ? '  PASS fits' : '  DOES NOT FIT'));

    /* ---- the reveal ---- */
    const travel = scene.offsetHeight - H;
    R.push('');
    R.push('--- the reveal ---');
    R.push('  ' + scene.offsetHeight + 'px section, ' + Math.round(travel) + 'px of scrolling, ' +
        (travel / 8).toFixed(0) + 'px per message (' + (travel / 8 / H).toFixed(2) + ' screens)');

    const best = ws.map(() => 0);
    const order = [];
    let prev = -1, mx = 0, litOverlap = 0, litOob = 0, drift = 0, litSamples = 0;
    let worstPair = { ov: 0 };
    const home = boxes.map((b) => b.y);
    const firstLitAt = [], dwell = new Array(8).fill(0);

    for (let s = 0; s <= 100; s++) {
        go(travel * s / 100);
        await wait(55);
        let n = 0, lit = -1;
        ws.forEach((w, i) => {
            const o = +cs(w, 'opacity');
            if (o > best[i]) best[i] = o;
            if (o > 0.6) {
                n++; lit = i;
                if (i !== prev) { if (order.indexOf(i) === -1) { order.push(i); firstLitAt.push(s / 100); } prev = i; }
            }
        });
        if (n > mx) mx = n;
        if (lit >= 0) {
            litSamples++; dwell[lit]++;
            const b = boxes[lit];
            const r = ws[lit].getBoundingClientRect();
            const b2 = { x: r.left - sr.left, y: r.top - sr.top, w: r.width, h: r.height };
            if (b2.x < -1 || b2.x + b2.w > W + 1 || b2.y < -1 || b2.y + b2.h > H + 1) litOob++;
            for (let k = 0; k < boxes.length; k++) {
                if (k === lit) continue;
                /* a neighbour at zero opacity is not in the way, whatever its box */
                if (+cs(ws[k], 'opacity') < 0.1) continue;
                const d = boxes[k];
                const ov = Math.min(b2.y + b2.h, d.y + d.h) - Math.max(b2.y, d.y);
                if (Math.min(b2.x + b2.w, d.x + d.w) - Math.max(b2.x, d.x) > 0.5 && ov > 0.5) {
                    litOverlap++;
                    if (ov > worstPair.ov) worstPair = { ov: ov, i: lit, k: k, opI: +cs(ws[lit], 'opacity'),
                        opK: +cs(ws[k], 'opacity'), h: Math.round(d.h), iH: Math.round(b2.h),
                        top: Math.round(b2.y), bot: Math.round(b2.y + b2.h),
                        oTop: Math.round(d.y), oBot: Math.round(d.y + d.h) };
                }
            }
            drift = Math.max(drift, Math.abs(b2.y - home[lit]));
        }
    }
    R.push('  all 8 readable  = ' + best.filter((v) => v > 0.6).length + '/8  ' +
        (best.filter((v) => v > 0.6).length === 8 ? 'PASS' : 'FAIL'));
    R.push('  order           = [' + order.join(',') + ']  ' +
        (order.join(',') === '0,1,2,3,4,5,6,7' ? 'PASS' : 'CHECK'));
    R.push('  max readable    = ' + mx + (mx <= 2 ? '  PASS' : '  NOTE'));
    R.push('  lit over another= ' + litOverlap + (litOverlap === 0 ? '  PASS' : '  FAIL'));
    R.push('  worst pair     = ' + JSON.stringify(worstPair));
    R.push('  lit off screen  = ' + litOob + (litOob === 0 ? '  PASS' : '  FAIL'));
    R.push('  lit drift       = ' + drift.toFixed(0) + 'px' + (drift <= 30 ? '  PASS' : '  WOBBLY'));
    R.push('  each message lit for ~' + (dwell.filter((v) => v > 0).reduce((a, v) => a + v, 0) / 8).toFixed(0) +
        ' of 100 sampled positions');
    R.push('  first words at  = ' + (firstLitAt[0] * 100).toFixed(0) + '% of the scroll  ' +
        (firstLitAt[0] <= 0.1 ? 'PASS immediate' : 'LATE'));
    R.push('  last words end  = ' + ((firstLitAt[7] + dwell[7] / 100) * 100).toFixed(0) + '% of the scroll');
    R.push('  hint = "' + $('#sakuraHint').textContent + '"');

    go(0); await wait(250);
    R.push('  quiet at top    = ' + (ws.filter((w) => +cs(w, 'opacity') > 0.25).length === 0 ? 'PASS' : 'FAIL'));
    go(travel); await wait(250);
    const litAtEnd = [];
    ws.forEach((w, i) => { if (+cs(w, 'opacity') > 0.6) litAtEnd.push(i); });
    R.push('  at the very bottom, still readable = ' +
        (litAtEnd.length >= 1 ? 'PASS (message ' + litAtEnd.join(',') + ')' : 'FAIL nothing lit'));
    go(0); await wait(200);

    const sr2 = stage.getBoundingClientRect();
    R.push('  pin at mid-scroll = ' + (() => { go(travel / 2); return 'measured below'; })());
    await wait(200);
    R.push('  stage top = ' + Math.round(stage.getBoundingClientRect().top) +
        (Math.abs(stage.getBoundingClientRect().top) < 2 ? '  PASS pinned' : '  FAIL'));
    go(0);
    return R.join('\n');
} catch (e) {
    return 'THREW: ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e);
}
