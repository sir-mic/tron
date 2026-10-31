try {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const R = [];
    const W = window.innerWidth;

    R.push('=== ' + window.innerWidth + 'x' + window.innerHeight + '  mobile=' + ('ontouchstart' in window) + ' ===');

    /* ---- 1. can the page be panned sideways at all? ---- */
    const de = document.documentElement;
    R.push('');
    R.push('--- horizontal overflow ---');
    R.push('  documentElement.clientWidth = ' + de.clientWidth + '   scrollWidth = ' + de.scrollWidth);
    R.push('  body.clientWidth = ' + document.body.clientWidth + '   scrollWidth = ' + document.body.scrollWidth);
    /* a horizontal scrollbar steals height from the viewport on desktop */
    R.push('  de.offsetHeight - de.clientHeight = ' + (de.offsetHeight - de.clientHeight) +
        '   (desktop: 15-17 means a horizontal scrollbar is showing)');
    R.push('  de.offsetWidth - de.clientWidth = ' + (de.offsetWidth - de.clientWidth) +
        '   (0 means no vertical scrollbar; >0 means one is showing)');

    /* which elements stick out past the right edge, or sit left of 0 */
    const bad = [];
    document.querySelectorAll('*').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (!r.width && !r.height) return;
        const cs = getComputedStyle(el);
        if (cs.position === 'fixed' && cs.visibility === 'hidden') return;
        const over = Math.round(Math.max(r.right - de.clientWidth, -r.left));
        if (over > 1) {
            bad.push({
                over: over,
                sel: el.tagName.toLowerCase() +
                    (el.id ? '#' + el.id : '') +
                    (el.className && typeof el.className === 'string'
                        ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''),
                left: Math.round(r.left), right: Math.round(r.right),
                pos: cs.position, tf: cs.transform === 'none' ? '' : 'transformed'
            });
        }
    });
    bad.sort((a, b) => b.over - a.over);
    R.push('  elements past the edge: ' + bad.length);
    bad.slice(0, 14).forEach((b) => {
        R.push('    +' + b.over + 'px  ' + b.sel + '  [' + b.left + '..' + b.right + '] ' + b.pos + ' ' + b.tf);
    });

    /* can it actually be panned? scrollTo is the only honest test */
    window.scrollTo(400, window.scrollY);
    await wait(120);
    R.push('  scrollTo(400) -> scrollX = ' + window.scrollX + (window.scrollX > 0 ? '  FAIL pans sideways' : '  PASS pinned'));
    window.scrollTo(0, window.scrollY);

    /* ---- 2. the reveal's cost per frame ---- */
    R.push('');
    R.push('--- scroll jank through the reveal ---');
    for (let i = 0; i < 8; i++) { document.getElementById('beanCracker').click(); await wait(400); }
    await wait(9000);

    const scene = document.getElementById('sakura-scene');
    const stage = document.querySelector('.sakura-stage');
    const travel = scene.offsetHeight - stage.clientHeight;

    /* tasks over 50ms are the ones a phone user would feel as a stutter */
    let longTasks = 0, longMs = 0;
    try {
        new PerformanceObserver((l) => {
            l.getEntries().forEach((e) => { longTasks++; longMs += e.duration; });
        }).observe({ entryTypes: ['longtask'] });
    } catch (err) { /* not supported */ }

    /* drive the scroll one animation frame at a time and time each frame the
       same way the compositor does: the gap between consecutive rAFs */
    const deltas = [];
    let last = performance.now();
    let stop = false;
    const tick = (now) => {
        deltas.push(now - last);
        last = now;
        if (!stop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    const y0 = window.scrollY;
    for (let s = 0; s <= 120; s++) {
        window.scrollTo(0, y0 + travel * s / 120);
        await new Promise(r => requestAnimationFrame(r));
    }
    for (let s = 120; s >= 0; s--) {
        window.scrollTo(0, y0 + travel * s / 120);
        await new Promise(r => requestAnimationFrame(r));
    }
    stop = true;
    await wait(60);

    const d = deltas.slice(3).sort((a, b) => a - b);
    const pct = (p) => d[Math.min(d.length - 1, Math.floor(d.length * p))];
    const over32 = d.filter((v) => v > 32).length;
    const over50 = d.filter((v) => v > 50).length;
    R.push('  frames = ' + d.length +
        '   median ' + pct(0.5).toFixed(1) + 'ms' +
        '   p90 ' + pct(0.9).toFixed(1) + 'ms' +
        '   p99 ' + pct(0.99).toFixed(1) + 'ms' +
        '   max ' + d[d.length - 1].toFixed(1) + 'ms');
    R.push('  frames over 32ms = ' + over32 + ' (' + (100 * over32 / d.length).toFixed(1) + '%)' +
        '   over 50ms = ' + over50);
    R.push('  long tasks >50ms = ' + longTasks + ' totalling ' + longMs.toFixed(0) + 'ms');
    R.push('  ' + (pct(0.9) < 20 ? 'SMOOTH  PASS' : pct(0.9) < 34 ? 'MARGINAL' : 'JANKY  needs work'));

    /* ---- 3. how far the reader has to scroll, and how evenly it is spent ---- */
    R.push('');
    R.push('--- the scroll the reader has to do ---');
    R.push('  scene = ' + scene.offsetHeight + 'px, viewport = ' + stage.clientHeight +
        'px, scrolling = ' + Math.round(travel) + 'px for 8 messages');
    R.push('  = ' + (travel / 8).toFixed(0) + 'px of scroll per message (' +
        (travel / 8 / stage.clientHeight).toFixed(2) + ' screens each)');

    /* ---- 4. is the pinned stage actually pinned? ---- */
    R.push('');
    R.push('--- the pin ---');
    window.scrollTo(0, y0 + travel * 0.5);
    await wait(200);
    const sr = stage.getBoundingClientRect();
    R.push('  stage top at mid-scroll = ' + Math.round(sr.top) +
        (Math.abs(sr.top) < 2 ? '  PASS pinned' : '  FAIL drifting ' + Math.round(sr.top) + 'px'));
    R.push('  stage height = ' + Math.round(sr.height) + ' vs innerHeight = ' + window.innerHeight +
        (Math.abs(sr.height - window.innerHeight) < 2 ? '  PASS' : '  MISMATCH ' + Math.round(sr.height - window.innerHeight) + 'px'));
    window.scrollTo(0, 0);
    return R.join('\n');
} catch (e) {
    return 'THREW: ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e);
}
