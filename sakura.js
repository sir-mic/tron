/* ============================================================================
   SAKURA REVEAL — the hidden second world, on the same page.

   Nothing in index.html's original <script> is modified, wrapped or depended
   on; it keeps running exactly as before. This file only adds the second
   state of the page.

   The three pieces:
     1. TRIGGER     8 taps crack the coffee bean open
     2. THEME-SWAP  crossfade the page from coffee to the night garden, and
                    retire the coffee realm entirely — two separate worlds
     3. THE GARDEN  a tree grown from a fixed seed. Every message is written
                    permanently at a branch tip, and a beam of moonlight walks
                    down the canopy as you scroll. A message is legible only
                    while the light is on it, and its blossom opens as the
                    light arrives. Nothing accumulates.

   anime.js v3 is loaded from a CDN by a <script> tag in index.html, just
   before this file. If it is missing we bail out quietly rather than break
   the coffee page.
   ========================================================================== */
(function () {
    'use strict';

    /* ==========================================================================
       0. SETUP + SHARED HELPERS
       ======================================================================= */
    const anime = window.anime;
    const $ = (sel, root) => (root || document).querySelector(sel);
    const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
    const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const fmt = (n) => String(Math.round(n * 100) / 100);
    const DEG = Math.PI / 180;

    if (!anime) {
        console.warn('[sakura] anime.js not available — reveal disabled.');
        return;
    }

    const cracker = $('#beanCracker');
    if (!cracker) return;

    const logoStage = $('.bean-logo-stage', cracker);
    const logoBob = $('.bean-logo-bob', cracker);
    const frags = $$('.bean-frag', cracker);
    const sheen = $('.bean-sheen', cracker);
    const cracks = $$('.bean-crack', cracker);
    const glow = $('.bean-glow', cracker);
    const budPetals = $$('.bud-petal', cracker);
    const stamens = $('.bud-stamens', cracker);

    const flash = $('#sakuraFlash');
    const veil = $('#sakuraVeil');
    const scene = $('#sakura-scene');
    const hint = $('#sakuraHint');
    const title = $('#sakuraTitle');
    const nav = $('#sakuraNav');
    const navDots = $('#sakuraDots');
    const navCount = $('#sakuraCount');
    const navButtons = $$('.sakura-nav-btn', nav || document);

    /* ==========================================================================
       1. TRIGGER — eight taps on the coffee bean
       --------------------------------------------------------------------------
       A tap counter held in this closure, so it survives scrolling and
       unrelated clicking for the rest of the session (no localStorage).

       Eight taps need eight *visible* steps, otherwise it feels like a bug.
       Each stage therefore moves the bean a little further open, and the
       artwork alone is enough to read the count: cracks appear, cracks widen,
       the shell parts, the shell peels off, the flower opens.
       ======================================================================= */
    const TAPS_TO_OPEN = 8;

    /* cracks  — how many of the 5 crack paths have been drawn on
       widen   — extra stroke width on the cracks already down
       spread  — how far the four shell quarters have pushed apart (0..1)
       glow    — light bleeding out from under the shell
       bud     — how far the flower underneath has started to peek
       peel    — this stage throws the shell away
       shake   — tap-shake intensity, so each hit is felt               */
    const STAGES = [
        { cracks: 1, widen: 0,    spread: 0,    glow: 0,    bud: 0,    shake: 1.0 },
        { cracks: 2, widen: 0,    spread: 0,    glow: 0.08, bud: 0,    shake: 1.3 },
        { cracks: 2, widen: 0.35, spread: 0,    glow: 0.16, bud: 0,    shake: 1.8 },
        { cracks: 3, widen: 0.5,  spread: 0.08, glow: 0.26, bud: 0.06, shake: 1.5 },
        { cracks: 4, widen: 0.72, spread: 0.3,  glow: 0.40, bud: 0.18, shake: 2.0 },
    { cracks: 5, widen: 1,    spread: 0.58, glow: 0.55, bud: 0.38, shake: 1.6 },
    { cracks: 5, widen: 1,    spread: 0.85, glow: 0.72, bud: 0.62, shake: 2.3 },
    /* the eighth and last tap is the only one that peels the shell — earlier
       stages only ever split it, so the world cannot open a tap early */
    { cracks: 5, widen: 1,    spread: 1,    glow: 0.95, bud: 1,    shake: 0, peel: true }
    ];

    /* How far each quarter slides apart, and where it tumbles to once the
       shell is thrown off. Keyed by data-frag so the numbers sit next to the
       markup they describe. The split distances are in CSS px on a 64px-wide
       bean, so ~18px is a third of its width — clearly open, not exploded. */
    const SPLIT = { tr: [17, -8], br: [18, 8], bl: [-18, 8], tl: [-17, -8] };
    const FALL = { tl: [-40, -46, -130], bl: [-24, 52, 104], tr: [44, -34, 148], br: [36, 46, -86] };
    const FALL_ORDER = ['tl', 'bl', 'tr', 'br'];   // top-left peels first

    /* each crack's natural width, read once so widening can scale it */
    const CRACK_W = cracks.map((c) =>
        c.classList.contains('bean-crack--fine') ? 1.2 :
        c.classList.contains('bean-crack--branch') ? 1.7 : 2.4);

    let crackTaps = 0;
    let blooming = false;
    let transformed = false;
    let bloomTimer = null;

    const byFrag = (name) => frags.filter((f) => f.dataset.frag === name);

    /* ---- idle: a slow bob plus a breath of opacity, just enough to hint ---- */
    let idleLoop = null;
    let idlePulse = null;

    function startIdle() {
        if (REDUCED || idleLoop) return;
        idleLoop = anime({
            targets: logoBob,
            translateY: [{ value: -2.4, duration: 2100 }, { value: 2.4, duration: 2600 }],
            scale: [{ value: 1.03, duration: 1900 }, { value: 1, duration: 2800 }],
            loop: true,
            easing: 'easeInOutSine'
        });
        idlePulse = anime({
            targets: cracker,
            opacity: [{ value: 0.86, duration: 2100 }, { value: 0.6, duration: 2600 }],
            loop: true,
            easing: 'easeInOutSine'
        });
    }

    function stopIdle() {
        if (idleLoop) { idleLoop.pause(); idleLoop = null; }
        if (idlePulse) { idlePulse.pause(); idlePulse = null; }
    }

    /* ---- how far open the bean is right now, so a stage can be a delta ---- */
    const current = { cracks: 0, widen: 0, spread: 0, glow: 0, bud: 0 };

    function applyStage(stage) {
        const dur = REDUCED ? 0 : 620;

        /* 1. newly revealed cracks draw themselves on */
        for (let i = current.cracks; i < stage.cracks; i++) {
            cracks[i].style.strokeDashoffset = '0';
            if (!REDUCED) {
                anime({
                    targets: cracks[i],
                    strokeDashoffset: [1, 0],
                    strokeWidth: [CRACK_W[i], CRACK_W[i] * (1 + stage.widen * 0.7)],
                    duration: 460,
                    easing: 'easeOutCubic'
                });
            }
        }

        /* 2. every crack already down gets wider */
        if (stage.widen !== current.widen) {
            for (let i = 0; i < stage.cracks; i++) {
                anime({
                    targets: cracks[i],
                    strokeWidth: CRACK_W[i] * (1 + stage.widen * 0.7),
                    duration: dur,
                    easing: 'easeOutQuad'
                });
            }
        }

        /* 3. the four quarters ease apart */
        if (stage.spread !== current.spread) {
            const to = stage.spread;
            frags.forEach((el) => {
                const s = SPLIT[el.dataset.frag];
                anime({
                    targets: el,
                    translateX: s[0] * to,
                    translateY: s[1] * to,
                    duration: dur,
                    easing: 'easeOutCubic'
                });
            });
        }

        /* 4. light bleeds out from under the shell */
        if (stage.glow !== current.glow) {
            anime({
                targets: glow,
                opacity: stage.glow,
                scale: 0.7 + stage.glow * 0.75,
                duration: dur,
                easing: 'easeOutSine'
            });
        }

        /* 5. the flower underneath starts to show through the gap */
        if (stage.bud !== current.bud) {
            anime({
                targets: budPetals,
                scale: 0.22 + stage.bud * 0.78,
                rotate: -42 * (1 - stage.bud),
                opacity: stage.bud * 0.9,
                duration: dur,
                easing: 'easeOutCubic'
            });
            anime({
                targets: stamens,
                scale: stage.bud,
                opacity: stage.bud,
                duration: dur,
                easing: 'easeOutCubic'
            });
        }

        /* 6. the shell is thrown off, one piece at a time */
        if (stage.peel) {
            const ordered = FALL_ORDER.map(byFrag).flat();
            anime({
                targets: sheen,
                opacity: 0,
                duration: REDUCED ? 0 : 380
            });
            anime({
                targets: cracks,
                opacity: 0,
                duration: REDUCED ? 0 : 340,
                delay: REDUCED ? 0 : anime.stagger(60)
            });
            anime({
                targets: ordered,
                translateX: (el) => FALL[el.dataset.frag][0],
                translateY: (el) => FALL[el.dataset.frag][1],
                rotate: (el) => FALL[el.dataset.frag][2],
                scale: 0.7,
                opacity: 0,
                duration: REDUCED ? 0 : 860,
                delay: REDUCED ? 0 : anime.stagger(120),
                easing: 'easeInQuad'
            });
        }

        current.cracks = stage.cracks;
        current.widen = stage.widen;
        current.spread = stage.spread;
        current.glow = stage.glow;
        current.bud = stage.bud;
    }

    /* ---- the tap itself ---- */
    function onCrackTap(e) {
        e.preventDefault();
        if (transformed) return;
        if (crackTaps >= TAPS_TO_OPEN) { runBloom(); return; }

        /* if they found it before the intro finished, hand the fade over to
           the idle loop instead of letting the two fight over opacity */
        anime.remove(cracker);
        anime.set(cracker, { opacity: 0.74 });
        startIdle();

        crackTaps++;
        const stage = STAGES[crackTaps - 1];
        cracker.classList.toggle('is-cracked', crackTaps >= 1);
        cracker.classList.toggle('is-split', crackTaps >= 3);
        cracker.classList.toggle('is-open', crackTaps >= 6);
        cracker.setAttribute('aria-label', 'A cracked coffee bean — ' + crackTaps + ' of ' + TAPS_TO_OPEN);

        try { navigator.vibrate && navigator.vibrate(10); } catch (_) {}

        /* a puff of light on the very first hit */
        if (crackTaps === 1) puff();

        /* the shake, scaled by how far open the bean is */
        if (!REDUCED && stage.shake) {
            const k = stage.shake;
            anime.remove(logoStage);
            anime({
                targets: logoStage,
                translateX: [0, -3.4 * k, 3.4 * k, -2.2 * k, 2.2 * k, 0],
                scale: [{ value: 1 + 0.08 * k, duration: 90 }, { value: 1, duration: 260 }],
                duration: 320,
                easing: 'easeInOutSine'
            });
        }

        applyStage(stage);

        /* exactly eight taps opens it — no stage short-circuits the count,
           so pausing half way through never skips ahead */
        if (crackTaps >= TAPS_TO_OPEN) runBloom();
    }

    function puff() {
        if (REDUCED) return;
        const r = cracker.getBoundingClientRect();
        const s = document.createElement('div');
        s.className = 'coffee-splash';
        s.style.left = (r.left + r.width / 2 + (Math.random() - 0.5) * 22) + 'px';
        s.style.top = (r.top + r.height / 2 + (Math.random() - 0.5) * 22) + 'px';
        document.body.appendChild(s);
        setTimeout(() => s.remove(), 800);
    }

    cracker.addEventListener('click', onCrackTap);
    cracker.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') onCrackTap(e);
    });

    /* fade the logo in late, so it never competes with the coffee page */
    anime({
        targets: cracker,
        opacity: [0, 0.74],
        duration: 1400,
        delay: 1600,
        easing: 'easeOutQuad',
        complete: startIdle
    });

    /* ---- the last tap: the flower opens ---- */
    function runBloom() {
        if (blooming) return;
        blooming = true;
        clearTimeout(bloomTimer);
        stopIdle();

        if (REDUCED) {
            budPetals.forEach((p) => { p.style.opacity = '1'; });
            stamens.style.opacity = '1';
            glow.style.opacity = '0.95';
            transformToSakura();
            return;
        }

        anime.set(budPetals, { scale: 0.22, rotate: -42, opacity: 0 });
        anime.set(stamens, { scale: 0, opacity: 0 });

        anime.timeline({ easing: 'easeOutElastic(1, 0.55)' })
            .add({
                targets: budPetals,
                scale: [0.22, 1],
                rotate: [-42, 0],
                opacity: [0, 1],
                duration: 1000,
                delay: anime.stagger(80)
            }, 0)
            .add({
                targets: stamens,
                scale: [0, 1],
                opacity: [0, 1],
                duration: 620,
                easing: 'easeOutBack'
            }, 420)
            .add({
                targets: glow,
                opacity: [0.55, 0.95],
                scale: [1, 1.3],
                duration: 900,
                easing: 'easeOutSine'
            }, 0);

        /* let the flower finish opening before the page transforms */
        bloomTimer = setTimeout(transformToSakura, 1450);
    }


    /* ==========================================================================
       2. THEME-SWAP — crossfade the page from coffee into the night garden
       --------------------------------------------------------------------------
       One anime.js timeline, no reload and no navigation:
         a) light bursts out of the opened bean
         b) an opaque copy of the night sky fades in over the coffee page
         c) body.sakura-mode is flipped while (b) is fully opaque, so every
            token on the page re-points at once and nothing snaps
         d) the veil fades back out, revealing the new world
         e) the scene fades up, then the title, then the scroll hint
       ======================================================================= */
    function transformToSakura() {
        if (transformed) return;
        transformed = true;

        if (REDUCED) {
            swapTheme();
            anime.set(scene, { opacity: 1 });
            anime.set(title, { opacity: 1 });
            anime.set(hint, { opacity: 1 });
            return;
        }

        const r = cracker.getBoundingClientRect();
        anime.set(flash, { left: (r.left + r.width / 2) + 'px', top: (r.top + r.height / 2) + 'px' });

        anime.timeline({ easing: 'easeOutQuad' })
            .add({ targets: flash, scale: [0, 26], opacity: [1, 0], duration: 900, easing: 'easeOutQuint' }, 0)
            .add({ targets: logoStage, scale: [1, 2.1], opacity: [1, 0], duration: 700 }, 120)
            .add({ targets: veil, opacity: [0, 1], duration: 950, easing: 'easeInOutQuad' }, 260)
            .add({
                targets: veil,
                opacity: [1, 0],
                duration: 1300,
                easing: 'easeInOutQuad',
                begin: swapTheme
            }, 1250)
            .add({ targets: scene, opacity: [0, 1], duration: 800, easing: 'easeOutQuad' }, 1900)
            .add({ targets: title, opacity: [0, 1], translateY: [16, 0], duration: 900 }, 2500)
            .add({ targets: hint, opacity: [0, 1], translateY: [12, 0], duration: 700 }, 3100);
    }

    /* Take the coffee realm apart for good.
       sakura.css already hides .container, but the beans are loose elements
       bolted onto <body> by the coffee script, so they are pulled out of the
       DOM here as well — that way there is nothing left to click, nothing
       left in the tab order, and nothing still counting towards 0/13. */
    function retireCoffeeRealm() {
        $$('.coffee-bean').forEach((b) => b.remove());

        /* The coffee atmosphere is not merely faded out, it is torn down. A
           hidden steam cloud and a cursor follower would otherwise keep
           animating (and repainting) behind the night sky for the rest of the
           visit. */
        $$('.steam-particle').forEach((p) => p.remove());
        const steam = document.getElementById('steam');
        if (steam) steam.remove();
        const cursorEl = document.getElementById('cursor');
        if (cursorEl) cursorEl.remove();

        const cup = document.getElementById('beanCount');
        if (cup) cup.textContent = '—';

        const counter = document.querySelector('.beans-collected');
        if (counter) counter.setAttribute('aria-hidden', 'true');
    }

    /* the actual class flip — everything else re-points via custom properties */
    function swapTheme() {
        document.body.classList.add('sakura-mode');
        cracker.style.display = 'none';
        retireCoffeeRealm();

        const themeColor = document.getElementById('metaThemeColor');
        if (themeColor) themeColor.setAttribute('content', '#07060f');

        const colorScheme = $('meta[name="color-scheme"]');
        if (colorScheme) colorScheme.setAttribute('content', 'dark');

        /* Open the garden at the beginning, wherever the coffee page happened
           to be scrolled to. It happens behind the opaque veil, so nobody sees
           the jump, and the first message is therefore the one under the
           reader's eyes. */
        const rootStyle = document.documentElement.style;
        const prevBehavior = rootStyle.scrollBehavior;
        rootStyle.scrollBehavior = 'auto';
        window.scrollTo(0, 0);
        rootStyle.scrollBehavior = prevBehavior;

        /* the scene only has real geometry once the class is on */
        initGarden();
        startAmbientPetals();
        startFireflies();
    }


    /* ==========================================================================
       3. THE GARDEN — growing the tree
       --------------------------------------------------------------------------
       The tree is grown procedurally from a fixed seed, so it is identical on
       every reload and testable, but it is not symmetrical or repetitive the
       way hand-placed paths end up looking.

       Two things make it read as a real tree rather than a diagram:
         - branches are FILLED TAPERED OUTLINES, not strokes. A stroke cannot
           change width along its length, so uniform strokes are the single
           biggest reason a drawn tree looks like a diagram.
         - the canopy is built in depth tiers (front / mid / back), and the back
           tier is blurred, which is what gives a blossom canopy volume.

       The petal anchors are emitted by the same code that draws the branches,
       so a petal can never be attached to a point that is not a real tip.
       ======================================================================= */
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const TREE_SEED = 20240613;      // fixed: the same tree every reload
    const CANOPY_DEPTH = 5;          // levels 0..5
    const MIN_BRANCH = 15;

    const branchLayer = $('.sakura-branches', scene);
    const bloomLayer = $('.sakura-blossoms', scene);
    const anchorLayer = $('.sakura-anchors', scene);
    const treeSvg = $('.sakura-tree-svg', scene);
    const tree = $('.sakura-tree', scene);
    const stage = $('.sakura-stage', scene);

    /* mulberry32 — small, fast, and deterministic */
    function seeded(seed) {
        let a = seed >>> 0;
        return function () {
            a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    /* the messages of the new world — nothing here is about coffee */
    const NOTES = [
        `Happy Birthday RonRon`,
        `Hanga ka na naman. Wag ka masyadong kiligin, boi. Bading yarn? 🌙`,
        `If you're reading this, most likely natanggap mo na yung gift. ✨`,
        `I know it's not the most unique flower kasi kaya mo din bilhin to online hahahha, not even the flower you wanted kasi alam ko yung gusto mo na bulaklak, nor the flower you deserve kasi you deserve all the flowers hanggang matrigger ang allergy mo. 🌸`,
        `But it's a flower I can give, a flower that has meaning, yung pwede mong sabihin na "Galing to kay Mike." 🍃`,
        `A while ago we started building 3D puzzles together, and every moment was special. 🌙`,
        `But this time, it's different. This time, Ronron, you'll be assembling this puzzle on your own. 🌱`,
        `This might take a long while and I want you to enjoy the process, don't rush it, and I hope this is the one you'll cherish the most amongst all our puzzles. 🎐`,
        `and yes, lahat ng 3D house puzzles na ginawa natin was all part of this, set up bai wahhahahah`,
        `RonRon, Hindi habang buhay kasama mo ako. Mawawala ako, sooner or later. I want you to be brave, strong, and faithful. I hope building this puzzle teaches you something, and that you can say, 'This something is a gift I can keep for the rest of my life.' 🕯️`,
        `Happy Birthday, Ronron. Thank you for everything. Wag ka umiyak, ulile. Hindi to goodbye message. 🤍`
        ];

    /* One tip, one message, one card: adding or removing a line above should be
       all it takes. The count is read from the array so the tree, the beam, the
       navigation dots and the counter all stay in step. */
    const NOTE_COUNT = NOTES.length;

    let rnd = seeded(TREE_SEED);
    const branchPaths = [];
    const tips = [];

    /* Bounds are accumulated while the branches are being grown, so composing
       the tree for a screen size no longer has to write 200 paths into the SVG
       and then ask the browser for their bounding box — up to eight times, at
       exactly the moment the garden opens. */
    let drawnBounds = null;
    let lastChosen = [];
    let lastBlooms = [];

    function resetBounds() {
        drawnBounds = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    }

    function addBound(x, y) {
        if (x < drawnBounds.x0) drawnBounds.x0 = x;
        if (y < drawnBounds.y0) drawnBounds.y0 = y;
        if (x > drawnBounds.x1) drawnBounds.x1 = x;
        if (y > drawnBounds.y1) drawnBounds.y1 = y;
    }

    /* ---- geometry helpers ---- */

    /* a gently curving centre line, sampled as a polyline */
    function centreline(x, y, ang, len, curl, steps) {
        const pts = [];
        const step = len / steps;
        let cx = x, cy = y, ca = ang;
        for (let i = 0; i <= steps; i++) {
            pts.push({ x: cx, y: cy, a: ca });
            ca += curl / steps;
            cx += Math.cos(ca * DEG) * step;
            cy += Math.sin(ca * DEG) * step;
        }
        return pts;
    }

    /* a closed loop through pts, smoothed with midpoint quadratics */
    function smoothClosed(pts) {
        const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        const n = pts.length;
        let d = 'M' + fmt(mid(pts[0], pts[n - 1]).x) + ' ' + fmt(mid(pts[0], pts[n - 1]).y);
        for (let i = 0; i < n; i++) {
            const cur = pts[i], nxt = pts[(i + 1) % n], m = mid(cur, nxt);
            d += 'Q' + fmt(cur.x) + ' ' + fmt(cur.y) + ' ' + fmt(m.x) + ' ' + fmt(m.y);
        }
        return d + 'Z';
    }

    /* one branch: a filled outline that tapers from wBase to a fine tip */
    function grow(x, y, ang, len, wBase, depth) {
        if (depth > CANOPY_DEPTH || len < MIN_BRANCH) return;

        const steps = 5;
        /* The curl is what gives a branch its natural droop, and over a long
           leader it is also the single biggest contributor to how wide the
           crown ends up — a 17 degree bend over a third of a thousand units is
           a hundred units sideways. Narrowing it is what actually makes a
           portrait tree, where narrowing the child angles alone did nothing. */
        const curl = (rnd() - 0.5) * 34 * prof.curl;
        const pts = centreline(x, y, ang, len, curl, steps);
        const wTip = Math.max(0.8, wBase * 0.16);

        const left = [], right = [];
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const p = pts[i];
            const nx = -Math.sin(p.a * DEG), ny = Math.cos(p.a * DEG);
            /* fast taper early, long fine tip: how real wood thins */
            const w = (wTip + (wBase - wTip) * Math.pow(1 - t, 1.45)) / 2;
            left.push({ x: p.x + nx * w, y: p.y + ny * w });
            right.push({ x: p.x - nx * w, y: p.y - ny * w });
        }
        branchPaths.push(smoothClosed(left.concat(right.reverse())));

        /* the outline points are the widest the wood gets, so they are also
           the honest bounds of the drawing */
        for (let i = 0; i < left.length; i++) addBound(left[i].x, left[i].y);
        for (let i = 0; i < right.length; i++) addBound(right[i].x, right[i].y);

        const tip = pts[steps];
        const isTip = depth === CANOPY_DEPTH;
        if (isTip) tips.push({ x: tip.x, y: tip.y, ang: tip.a, depth: depth });

        /* how many children: three low down where the tree is still building
           its frame, two out in the twigs */
        const children = depth < 2 ? (rnd() < 0.55 ? 3 : 2) : 2;

        for (let i = 0; i < children; i++) {
            const spread = (i / Math.max(1, children - 1) - 0.5) * 2;   // -1 .. 1
            let childAng = ang + spread * (17 + rnd() * 21) * prof.spread + (rnd() - 0.5) * 9;

            /* slight upward bias, so the canopy reaches up and outward instead
               of collapsing downward — trees grow toward light */
            childAng += (-96 - childAng) * 0.11;

            /* one child often leaves from part-way up the parent, not only
               from the tip; that is what stops it looking like a diagram */
            const fromTip = rnd() < 0.55;
            let bx = tip.x, by = tip.y, bAng = tip.a, bLen = len, bW = wBase;
            if (!fromTip) {
                const back = 1 - (0.3 + rnd() * 0.42);
                const idx = clamp(Math.round(back * steps), 1, steps);
                const p = pts[idx];
                bx = p.x; by = p.y; bAng = p.a;
                const done = idx / steps;
                bW = (wTip + (wBase - wTip) * Math.pow(1 - done, 1.45)) * 0.82;
                bLen = len * (1 - done * 0.42);
            }

            grow(bx, by, childAng,
                 bLen * (0.7 + rnd() * 0.15),
                 Math.max(1.1, bW * (0.56 + rnd() * 0.12)),
                 depth + 1);
        }
    }

    /* ---- the canopy ---- */
    const BLOOM_TIERS = [
        { cls: 'sk-bloom-front', scale: [0.44, 0.56], weight: 0.38, bud: 0.26 },
        { cls: 'sk-bloom-mid',   scale: [0.34, 0.44], weight: 0.38, bud: 0.30 },
        { cls: 'sk-bloom-back',  scale: [0.26, 0.34], weight: 0.24, bud: 0.36 }
    ];

    function buildCanopy() {
        const blooms = [];
        const r = seeded(TREE_SEED + 7);

        tips.forEach((tip) => {
            /* a tight cluster, the way blossoms actually sit on a twig */
            const count = 1 + (r() < 0.55 ? 1 : 0) + (r() < 0.22 ? 1 : 0);
            for (let i = 0; i < count; i++) {
                const roll = r();
                let acc = 0, tier = BLOOM_TIERS[0];
                for (const t of BLOOM_TIERS) { acc += t.weight; if (roll <= acc) { tier = t; break; } }

                const isBud = r() < tier.bud;
                const s = isBud
                    ? 0.15 + r() * 0.09
                    : tier.scale[0] + r() * (tier.scale[1] - tier.scale[0]);

                blooms.push({
                    x: tip.x + (r() - 0.5) * 26,
                    y: tip.y + (r() - 0.5) * 22,
                    rot: Math.round(r() * 360),
                    s: s,
                    href: isBud ? '#skBud' : tier.cls === 'sk-bloom-front' ? '#skFlowerFront'
                        : tier.cls === 'sk-bloom-mid' ? '#skFlowerMid' : '#skFlowerBack',
                    cls: isBud ? 'sk-bud' : tier.cls
                });
            }
        });

        /* back to front, so the glow stacks in the right order */
        blooms.sort((a, b) => (b.cls === 'sk-bloom-back') - (a.cls === 'sk-bloom-back')
            || (b.cls === 'sk-bloom-mid') - (a.cls === 'sk-bloom-mid'));

        return blooms;
    }

    /* pick NOTE_COUNT tips that are spread across the canopy. The bounds are
       relative to the drawn tree rather than the old fixed canvas, because the
       canvas now changes shape with the screen. */
    function chooseAnchors() {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        tips.forEach((t) => {
            x0 = Math.min(x0, t.x); y0 = Math.min(y0, t.y);
            x1 = Math.max(x1, t.x); y1 = Math.max(y1, t.y);
        });
        const padX = (x1 - x0) * 0.06;
        const padY = (y1 - y0) * 0.06;
        const usable = tips.filter((t) =>
            t.y > y0 - padY * 0.5 && t.y < y1 - padY * 0.5 &&
            t.x > x0 - padX * 0.5 && t.x < x1 + padX * 0.5);
        const pool = usable.length >= NOTE_COUNT ? usable : tips.slice();
        const chosen = [];

        while (chosen.length < NOTE_COUNT && pool.length) {
            let best = 0, bestScore = -1;
            for (let i = 0; i < pool.length; i++) {
                /* farthest from everything already chosen, in x and y */
                const d = chosen.length
                    ? Math.min.apply(null, chosen.map((c) => Math.hypot(c.x - pool[i].x, c.y - pool[i].y)))
                    : 1000;
                if (d > bestScore) { bestScore = d; best = i; }
            }
            chosen.push(pool.splice(best, 1)[0]);
        }
        return chosen;
    }

    /* ---- composing the tree for the screen it is drawn on ----
       The tree used to be grown into a fixed 1000x820 box, which is a wide,
       landscape shape. A phone is not: to fit that box into a 375px-wide
       portrait viewport the browser has to scale by the width alone, which
       left the crown as a 320px band in the bottom of an 844px screen, every
       blossom about 3px across, and 38% of the display empty sky.

       So the canvas follows the device. `tall` runs 0 on a wide screen to 1 on
       a tall phone and stretches the leaders while pulling the spread in, which
       grows a narrower, taller tree for a portrait screen out of the same fixed
       seed — the same tree character, composed for the space it has to live in.
       The viewBox is then fitted to whatever actually got drawn
       (see fitTreeToStage), which is what stops any screen from letterboxing. */
    let prof = { spread: 1, reach: 1 };

    function stageAspect() {
        return (stage.clientWidth || 1) / (stage.clientHeight || 1);
    }

    /* 0 on a wide desktop, 1 on a tall phone */
    function tallness() {
        return clamp((0.95 - stageAspect()) / 0.5, 0, 1);
    }

    /* How far the branches are allowed to lean outward, 1 = as designed.
       Lower means a narrower crown. */
    let spreadKnob = 1;

    /* A tree is naturally wider than it is tall, and on a phone that has to be
       given up to get anywhere near the shape of the screen. This is the
       compromise: fill the width, and reach about 70% of the height. The rest
       is sky, which is where the moon, the title and the light live.

       It also has to be this tall for a less obvious reason. Every message
       sits under its own blossom, so the spread of the tips is the space the
       reader has for the text. A squat tree puts all the tips in a short band,
       and the cards do not fit in a short band. Growing the tree to fill the
       phone is what gives the messages somewhere to go. */
    const PORTRAIT_TREE_ASPECT = 0.62;

    function growTree() {
        const ar = clamp(stageAspect(), 0.4, 2.2);
        const tall = tallness();
        /* A phone is far narrower than a tree can honestly be, and a tablet is
           only a little narrower, so the floor is a clamp rather than a switch:
           never slenderer than the phone figure, never taller than square. Wide
           screens are left to the tree as it was drawn — the loop below simply
           never engages, because a natural tree is already less wide than a
           landscape viewport. */
        const want = ar < 1 ? clamp(ar, PORTRAIT_TREE_ASPECT, 1.05) : ar * 0.95;

        /* Growing for a screen's shape is not a matter of scaling the leaders.
           The crown is as wide as the branch spread makes it, and on a phone
           that spread has to come down a long way or the tree is a squat dome
           with the sides cut off. So the tree is grown, measured, and regrown
           with a narrower spread until its proportions suit the viewport. Two
           or three passes is enough and it is all deterministic, so the same
           device always gets the same tree. */
        spreadKnob = 1;
        for (let pass = 0; pass < 6; pass++) {
            growOnce(tall);
            const drawn = measureDrawn();
            if (!drawn) break;
            const drawnAspect = drawn.w / drawn.h;
            if (drawnAspect <= want) break;
            /* The crown is very nearly proportional to the spread, so the fix is
               to scale the spread by how far the aspect overshot. The clamp
               stops any single pass from collapsing the tree, and because the
               leaders and the curl put a floor under the width, one step always
               overshoots the other way — hence re-measuring rather than
               trusting the first guess. */
            spreadKnob *= clamp(want / drawnAspect, 0.48, 0.98);
        }

        /* One paint, after the shape has settled — not one per pass. */
        paintTree(lastChosen, lastBlooms);
    }

    /* union bounds of everything that will be drawn, in svg units. The branch
       outlines give the wood; the pad covers the blossoms hanging off the tips
       and the tip decorations, so no getBBox() is needed before the paint. */
    function measureDrawn() {
        if (!drawnBounds || !isFinite(drawnBounds.x0) ||
            drawnBounds.x1 <= drawnBounds.x0 || drawnBounds.y1 <= drawnBounds.y0) return null;
        const pad = 18;
        const x = drawnBounds.x0 - pad;
        const y = drawnBounds.y0 - pad;
        return {
            x: x,
            y: y,
            w: (drawnBounds.x1 - drawnBounds.x0) + pad * 2,
            h: (drawnBounds.y1 - drawnBounds.y0) + pad * 2
        };
    }

    function growOnce(tall) {
        rnd = seeded(TREE_SEED);
        branchPaths.length = 0;
        tips.length = 0;
        resetBounds();

        const mobileBoost = tall > 0.3 ? 1.25 : 1;
        prof = { spread: spreadKnob * (1 - 0.25 * tall), reach: 1 + 0.8 * tall, curl: 1 - 0.68 * tall };

        /* canvas: 1000 tall, width follows the screen's shape. The trunk is
           planted at the bottom centre of it either way. */
        const boxW = 1000 * clamp(stageAspect(), 0.35, 2.2);
        const baseY = 985;
        const rootX = boxW / 2;
        const gap = boxW * 0.048;
        const thick = (1 + 0.12 * tall) * mobileBoost;

        /* two leaders from the same root: cherry trees very often fork low,
           and it reads far more like a tree than a single stem. They lean
           apart by less on a phone, or the crown runs off the sides. */
        grow(rootX - gap, baseY, -96 - 4 * tall, 196 * prof.reach, 52 * thick, 0);
        grow(rootX + gap, baseY, -80 + 4 * tall, 158 * prof.reach, 32 * thick, 0);

        const chosen = chooseAnchors();
        /* top of the canopy first, so the first petals fall from the top */
        chosen.sort((a, b) => a.y - b.y);

        lastChosen = chosen;
        lastBlooms = buildCanopy();
    }

    function paintTree(chosen, blooms) {
        branchLayer.innerHTML = branchPaths.map((d) => '<path d="' + d + '"></path>').join('');
        bloomLayer.innerHTML = blooms.map((b) =>
            '<use class="' + b.cls + '" href="' + b.href + '" transform="translate(' +
            fmt(b.x) + ' ' + fmt(b.y) + ') rotate(' + b.rot + ') scale(' + fmt(b.s) + ')"></use>'
        ).join('');
        anchorLayer.innerHTML = chosen.map((a) =>
            '<circle class="sakura-anchor" cx="' + fmt(a.x) + '" cy="' + fmt(a.y) + '" r="1"></circle>'
        ).join('');
    }


    /* ---- fitting the drawing to the screen ----
       The viewBox is the single thing that decides how large the tree appears,
       and the old fixed "0 0 1000 820" was the reason a phone saw a thin band:
       the drawing only occupied the middle of that box, so most of the box was
       dead space that got scaled along with the tree.

       So measure what was actually drawn, then hand the viewport a box of the
       screen's own aspect ratio around it. The crown now spans the display on a
       phone and on a desktop alike, and because the aspect always matches there
       is never any letterbox band left over. */
    function fitTreeToStage() {
        const svg = $('.sakura-tree-svg', scene);
        if (!svg) return;
        const d = measureDrawn();
        if (!d) return;

        const ar = stageAspect();
        const spanX = d.w;
        const spanY = d.h;
        /* room for the sway to rotate into without clipping, and for the
           ground haze and the trunk shadow to sit just outside the crown */
        const padX = spanX * 0.05;
        const padTop = spanY * 0.04;
        const padBot = spanY * 0.02;

        let w = spanX + padX * 2;
        let h = spanY + padTop + padBot;
        if (w / h < ar) w = h * ar; else h = w / ar;

        /* bottom-aligned: the trunk keeps its footing on the ground and all the
           extra room goes to the sky, where the moon and the beam live */
        const vx = (d.x + spanX / 2) - w / 2;
        const vy = (d.y + spanY) + padBot - h;
        svg.setAttribute('viewBox', fmt(vx) + ' ' + fmt(vy) + ' ' + fmt(w) + ' ' + fmt(h));
    }


    /* ==========================================================================
       4. THE BEAM + THE WHISPERS — messages read by moonlight
       --------------------------------------------------------------------------
       Every message is written once, permanently, at a real branch tip. A pool
       of light travels down the canopy as you scroll; a message is legible only
       while the beam is on it, and the blossom at that tip opens as the light
       arrives.

       The reveal is light MOVING, not objects appearing. That is the whole
       point: nothing can accumulate, so the messages never turn into a list
       pinned to the floor. Scroll away and the words sink back into the bark.

       The beam's route is built from the anchor positions themselves, so the
       light is guaranteed to pass over every message instead of sweeping
       blindly past some of them.
       ======================================================================= */
    const beam = $('#sakuraBeam');
    const whisperLayer = $('#sakuraWhispers');
    const tipLayer = $('.sakura-tips', scene);

    /* How much longer the beam DWELLS on each tip than it spends travelling
       between them, in units of one leg. At 1.0 it holds still for half of every
       message, and half of every flick produces no movement at all — which is
       what made the reveal feel like it was lagging behind the reader's thumb.

       Without any dwell the sweep runs at a constant speed along the path, and
       any two tips that happen to sit far apart get blown past between two
       frames of scrolling — measured at 4 of 8 messages reachable. So the dwell
       stays, just at a size where the light is moving for most of the scroll and
       each message still gets a window long enough to read. */
    const DWELL = 0.55;

    /* A short flight in before the first hold, so the light visibly arrives
       rather than the scene simply starting with words already on it. Kept
       small on purpose: this used to cost a whole leg, so the reader scrolled a
       good fraction of a screen before the first word lit up. */
    const LEAD_IN = 0.4;

    /* the anchors only exist once growTree() has run, so these are filled in
       during initGarden() rather than at load time */
    let anchors = [];
    const whispers = [];
    const tipFlowers = [];
    const tipHalos = [];
    const tipEmbers = [];
    const hasLit = [];
    const cardState = [];
    const tipState = [];
    let anchorPos = [];
    let anchorSvg = [];
    let beamPath = [];
    let hazeBlobs = [];
    let gardenBuilt = false;
    let gardenActive = false;
    let rafPending = false;
    let treeLean = null;
    let hazeScrub = [];
    let litCount = -1;
    let titleFade = 1;

    function readRadius() {
        /* Follow the short side of the screen, but in absolute terms as well:
           the old fixed 58px floor made the readable core a sixth of a 360px
           phone yet a twentieth of a desktop, so the text either hung on too
           long or vanished the instant the light moved on. */
        const short = Math.min(stage.clientWidth, stage.clientHeight);
        return clamp(short * 0.155, 64, 118);
    }

    /* ---- mapping SVG units to stage pixels, without asking the DOM ----
       getScreenCTM()/getBoundingClientRect() per tip per scroll frame forced a
       layout on every tick (the tree had just been transformed, so the browser
       had to resolve it again before it could answer). The SVG is fitted to the
       stage with preserveAspectRatio="xMidYMax meet", so the mapping is plain
       arithmetic — measure it once per resize and then only run numbers. */
    let anchorBase = [];

    function anchorMapping() {
        const vb = treeSvg && treeSvg.viewBox && treeSvg.viewBox.baseVal;
        if (!vb || !vb.width || !vb.height) return null;
        const W = stage.clientWidth || 1;
        const H = stage.clientHeight || 1;
        const s = Math.min(W / vb.width, H / vb.height);
        return {
            s: s,
            vx: vb.x,
            vy: vb.y,
            ox: (W - vb.width * s) / 2,
            oy: H - vb.height * s
        };
    }

    function measureAnchors() {
        anchorSvg = anchors.map((a) => ({
            x: parseFloat(a.getAttribute('cx')) || 0,
            y: parseFloat(a.getAttribute('cy')) || 0
        }));

        const m = anchorMapping();
        anchorBase = anchorSvg.map((p) => m
            ? { x: m.ox + (p.x - m.vx) * m.s, y: m.oy + (p.y - m.vy) * m.s }
            : { x: 0, y: 0 });
        anchorPos = anchorBase.map((p) => ({ x: p.x, y: p.y }));
        syncAnchors(sceneProgress());
    }

    /* The tree sways as you scroll, so the tips move — but the sway is a single
       rotation of .sakura-tree around the centre of the stage. Applying that
       rotation to the cached base positions is all syncAnchors() has to do; no
       per-frame DOM reads, no forced layout, and the light stays exactly on the
       blossom whatever the sway is doing. */
    function syncAnchors(prog) {
        const n = anchorBase.length;
        if (!n) return;
        const W = stage.clientWidth || 1;
        const H = stage.clientHeight || 1;
        const cx = W / 2;
        const cy = H / 2;

        /* identical numbers to the scrub timeline in initGarden() */
        const theta = treeLean ? (-2.1 + 5.2 * clamp(prog, 0, 1)) * DEG : 0;
        const cos = Math.cos(theta);
        const sin = Math.sin(theta);

        for (let i = 0; i < n; i++) {
            const dx = anchorBase[i].x - cx;
            const dy = anchorBase[i].y - cy;
            anchorPos[i].x = cx + dx * cos - dy * sin;
            anchorPos[i].y = cy + dx * sin + dy * cos;
        }
    }

    /* ---- one whisper + one opening blossom per branch tip ---- */
    function buildWhispers() {
        anchors.forEach((anchor, i) => {
            const w = document.createElement('p');
            w.className = 'sakura-whisper';
            w.textContent = NOTES[i % NOTES.length];
            whisperLayer.appendChild(w);
            whispers.push(w);

            /* the tip decoration: a halo, the flower that opens, and a permanent
               ember for tips the light has already visited */
            const g = document.createElementNS(SVG_NS, 'g');
            g.setAttribute('transform', 'translate(' + fmt(anchorSvg[i].x) + ' ' + fmt(anchorSvg[i].y) + ')');
            g.innerHTML =
                '<circle class="sk-tip-halo" cx="0" cy="0" r="26"></circle>' +
                '<use class="sk-tip-flower" href="#skFlowerFront" ' +
                'transform="rotate(' + ((i * 47) % 360) + ') scale(0.72)"></use>' +
                '<circle class="sk-tip-ember" cx="0" cy="0" r="1.7"></circle>';
            tipLayer.appendChild(g);

            tipHalos.push($('.sk-tip-halo', g));
            tipFlowers.push($('.sk-tip-flower', g));
            tipEmbers.push($('.sk-tip-ember', g));
            hasLit[i] = false;
            cardState.push({ o: -1, ty: -1, scale: -1, visible: null });
            tipState.push({ o: -1, s: -1, h: -1, r: -1 });
        });

        buildDots();
    }

    /* The halo is drawn relative to the readable core, but never allowed to take
       more than 58% of the screen: at 4.2x the core it was 69% of a phone's
       width, and drowned the very blossom it was meant to be revealing. Unchanged
       on a desktop, where there is room for it.

       Computed in one place because the element also carries a fallback width in
       the stylesheet for the frame before the first scroll tick — left at that
       fallback it is 520px wide and hangs off both sides of a phone. */
    function beamSize() {
        return Math.min(readRadius() * 4.2, stage.clientWidth * 0.58);
    }

    /* ---- the beam's route: in above the top tip, out below the bottom one ---- */
    function buildBeamPath() {
        const a = anchorPos;
        if (!a.length) { beamPath = []; return; }
        const r = readRadius();
        const first = a[0];
        const last = a[a.length - 1];
        let dx = last.x - first.x;
        let dy = last.y - first.y;
        const len = Math.hypot(dx, dy) || 1;
        dx /= len; dy /= len;

        beamPath = [
            /* The light starts almost on the first tip (rather than a whole
               readable-radius away) so the first message is already legible
               when the garden opens — nobody should have to scroll to be told
               where to begin. */
            { x: first.x - dx * r * 0.18, y: first.y - dy * r * 0.18 },
            ...a,
            { x: last.x + dx * r * 0.18, y: last.y + dy * r * 0.18 }
        ];

        if (beam) beam.style.setProperty('--beam-size', beamSize().toFixed(0) + 'px');
    }

    /* Total scroll, in units, that the whole reveal is divided into: the flight
       in, then a hold and a glide for each message, and nothing after the last
       hold — so the last message is still readable when the reader stops at
       the bottom instead of arriving on the final pixel. */
    function beamUnits(n) {
        return LEAD_IN + n * DWELL + (n - 1);
    }

    /* where the light is, for a given scroll progress.
       Walks an explicit schedule rather than a fixed step per node, so the two
       ends of the section are not dead: the light reaches the first tip almost
       at once, and it stops on the last one and stays there.

       Also reports which tip the beam belongs to: the one it is resting on, or
       the one it is travelling towards. `focus` is what makes the reading order
       strict — see the note where it is used. */
    function beamAt(p) {
        const n = Math.max(1, Math.min(NOTE_COUNT, beamPath.length - 2));
        if (beamPath.length < n + 1) return null;

        let u = clamp(p, 0, 1) * beamUnits(n);
        const node = (i) => beamPath[i + 1];          // beamPath[0] is the flight-in
        const glide = (i, f) => {
            const e = f * f * (3 - 2 * f);
            const a = node(i), b = node(i + 1);
            return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, focus: i + 1 };
        };

        if (u < LEAD_IN) {
            const f = u / LEAD_IN;
            const e = f * f * (3 - 2 * f);
            const a = beamPath[0], b = node(0);
            return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, focus: 0 };
        }
        u -= LEAD_IN;

        for (let i = 0; i < n; i++) {
            if (u <= DWELL) return { x: node(i).x, y: node(i).y, focus: i };
            u -= DWELL;
            if (i === n - 1) break;                   // the last hold runs to p = 1
            if (u < 1) return glide(i, u);
            u -= 1;
        }
        const last = node(n - 1);
        return { x: last.x, y: last.y, focus: n - 1 };
    }

    /* 1 at the centre of the beam, easing to 0 at the readable edge */
    function litAt(i, bx, by) {
        const r = readRadius();
        const d = Math.hypot(anchorPos[i].x - bx, anchorPos[i].y - by);
        const t = clamp(1 - d / r, 0, 1);
        return t * t * (3 - 2 * t);
    }

    /* Narrow screens cannot put a message beside its blossom: the tree fills
       the width, so both margins are only a few pixels wide and every box ends
       up shoved against an edge and stacked on the others. Below this width the
       layout changes shape — the message sits directly under its own blossom,
       centred, with the hairline running straight up to the flower. */
    function isNarrow() {
        return stage.clientWidth < 560;
    }

    /* The highest a message card may sit: below the scene title, which owns the
       top of the stage at rest. The title fades once the light starts moving,
       but the cards keep their measured homes — moving them mid-read would be
       worse than keeping a little air at the top of a short screen. offsetTop /
       offsetHeight are used for the same reason as the nav measurement below:
       they ignore the entrance transform. */
    function whisperTop() {
        const H = stage.clientHeight;
        const titleBottom = title ? title.offsetTop + title.offsetHeight : 0;
        /* never give the title more than a small slice of a short screen */
        const reserve = Math.min(titleBottom + 12, Math.round(H * 0.3));
        return Math.max(10, reserve);
    }

    /* The lowest a message card may sit: just above the navigation pill, with
       a little air. offsetTop is used (not a rect) so the pill's entrance
       transition cannot skew the measurement. */
    function whisperBottom() {
        const H = stage.clientHeight;
        const navTop = nav ? nav.offsetTop : H - 96;
        return clamp(navTop - 8, Math.round(H * 0.5), H - 10);
    }

    /* ---- place every whisper beside (or under) its own blossom ----
       Each card gets a fixed home, tied to the tip it belongs to, and stays
       there. The alternative — re-running a collision solver on every frame —
       meant the two faint messages nearest the light swapped places as the beam
       travelled, and the reader could see the text they were not reading move
       under their thumb.

       On a narrow screen the cards are simply too tall to all fit clear of
       each other, and forcing them apart by walking down the screen would push
       the last ones off the bottom, hundreds of pixels from their own blossom.
       So they are left where they belong: overlapping faintly, which is
       invisible at 10% opacity and blurred, with only the lit card guaranteed
       clear by focusWhisper() below. */
    function layoutWhispers() {
        if (!whispers.length) return;
        const W = stage.clientWidth;
        const H = stage.clientHeight;
        const margin = 10;
        const tie = 18;
        const narrow = isNarrow();
        const top = whisperTop();

        /* The navigation pill and the hint live at the bottom of the stage, so
           the cards get a shorter canvas. The pill's own layout top is used
           rather than a guessed strip: it adapts to a phone, a landscape phone
           and the desktop without three matching magic numbers. */
        const bottom = whisperBottom();

        /* The unlit cards are drawn 3.5% small and 7px low, so a slot measured at
           the box size already has room for the card the light is on: it is
           drawn at exactly 1.0, filling its slot, while its neighbours stay
           inside theirs. */
        cardBox = whispers.map((w, i) => {
            const wW = w.offsetWidth || 220;
            const wH = w.offsetHeight || 56;
            const a = anchorPos[i];
            const b = { i: i, w: wW, h: wH, x: 0, y: 0, home: 0, centred: false, right: true };

            if (narrow) {
                /* centred, hanging just below the blossom it belongs to */
                b.centred = true;
                b.right = true;
                b.x = clamp((W - wW) / 2, margin, Math.max(margin, W - wW - margin));
                b.y = clamp(a.y + tie, top, Math.max(top, bottom - wH));
            } else {
                /* beside the blossom, on whichever side has the room */
                b.centred = false;
                b.right = a.x >= W / 2;
                b.x = clamp(a.x + (b.right ? tie : -tie - wW), margin,
                            Math.max(margin, W - wW - margin));
                b.y = clamp(a.y - wH / 2, top, Math.max(top, bottom - wH));
            }
            b.home = b.y;
            return b;
        });

        /* One pass down the cards in the order the light visits them, each
           taking the first free slot at or below its own blossom. This is what
           guarantees no two cards ever overlap, without a per-frame solver and
           without the cards drifting: it runs once, and only on a resize. */
        if (narrow) {
            const stack = cardBox.slice().sort((p, q) => p.home - q.home);
            const sum = stack.reduce((a, b) => a + b.h, 0);
            const room = bottom - top;
            const tallest = Math.max.apply(null, stack.map((b) => b.h));

            /* A visible gap between the cards reads better, but the gaps are
               also the room the readable one needs to park in. Close them up
               rather than let it lie across another. */
            let gap = 6;
            if (room - sum - gap * (stack.length - 1) < tallest) gap = 0;

            let cursor = top;
            stack.forEach((b) => {
                b.y = Math.max(b.home, cursor);
                cursor = b.y + b.h + gap;
            });
            /* If the stack ran off the bottom, slide the whole thing back up
               rather than letting the last cards pile on the last card. */
            const last = stack[stack.length - 1];
            const over = (last.y + last.h) - bottom;
            if (over > 0) {
                stack.forEach((b) => { b.y = Math.max(top, b.y - over); });
            }
        } else {
            /* two columns on a wide screen, so each gets its own cursor */
            [true, false].forEach((side) => {
                let cursor = top;
                cardBox.filter((b) => b.right === side)
                    .sort((p, q) => p.home - q.home)
                    .forEach((b) => {
                        b.y = Math.max(b.home, cursor);
                        cursor = b.y + b.h + 8;
                    });
            });
        }

        cardBox.forEach((b) => {
            b.y = clamp(b.y, top, Math.max(top, bottom - b.h));
            b.home = b.y;
            placeCard(b);
        });
        focusWhisper.last = -1;
    }

    function placeCard(b) {
        const el = whispers[b.i];
        el.dataset.side = b.centred ? 'below' : (b.right ? 'right' : 'left');
        el.style.left = b.x.toFixed(0) + 'px';
        el.style.top = b.y.toFixed(0) + 'px';
        if (b.centred) {
            el.style.setProperty('--tie', '0px');
            /* The thread runs from the top of the card all the way up to its
               blossom, however far away that is. It looks like it should be
               capped, but it does not need to be: the whole card — thread
               included — sits at 10% opacity until its turn comes, and by then
               focusWhisper() has moved this card clear of the others, so the
               thread is drawn through empty space. */
            el.style.setProperty('--tie-below',
                clamp(b.y - (anchorPos[b.i].y + 5), 5, 400).toFixed(0) + 'px');
        } else {
            const gap = b.right ? (anchorPos[b.i].x - (b.x + b.w)) : (b.x - anchorPos[b.i].x);
            /* same reasoning sideways: a horizontal thread stays at the card's
               own height, and the column is stacked clear of its neighbours */
            el.style.setProperty('--tie', clamp(gap, 0, 260) + 'px');
        }
    }

    /* The one thing that must never happen is the readable card sitting on top
       of another card, so the lit one is the only one that moves. It searches
       outward from its own blossom for the nearest clear spot and stays there
       for the whole of its turn, which is what keeps the text under the reader's
       eyes still while they read it. */
    function focusWhisper(active) {
        if (!cardBox.length) return;

        /* The first attempt can fail because the card just left behind has not
           been put back yet, so a card that could not park is retried on the
           next frame — a handful of times at most, only while it keeps failing. */
        const retry = focusWhisper.last === active && !focusWhisper.parked &&
            focusWhisper.tries < 4;
        if (focusWhisper.last === active && !retry) return;
        if (focusWhisper.last !== active) focusWhisper.tries = 0;

        const top = whisperTop();
        const bottom = whisperBottom();

        /* whatever was pushed last time goes back to its own blossom first, so
           the ghost field is always the untouched layout between turns */
        const prev = cardBox[focusWhisper.last];
        if (prev) { prev.y = prev.home; placeCard(prev); }
        focusWhisper.last = active;

        const b = cardBox[active];
        if (!b) return;

        const hits = (y) => {
            if (y < top || y + b.h > bottom) return true;
            for (let k = 0; k < cardBox.length; k++) {
                if (k === active) continue;
                const o = cardBox[k];
                if (Math.min(b.x + b.w, o.x + o.w) - Math.max(b.x, o.x) > 0 &&
                    Math.min(y + b.h, o.y + o.h) - Math.max(y, o.y) > 0) return true;
            }
            return false;
        };
        if (!hits(b.home)) { focusWhisper.parked = true; return; }

        for (let step = 1; step <= 26; step++) {
            const d = step * 6;
            if (!hits(b.home - d)) { b.y = b.home - d; placeCard(b); focusWhisper.parked = true; return; }
            if (!hits(b.home + d)) { b.y = b.home + d; placeCard(b); focusWhisper.parked = true; return; }
        }
        /* Nowhere to step aside to, on a screen too short to hold all the
           cards and a gap as well. Leave the readable one where it is and let
           the caller drop the faint ones, rather than leave words on words. */
        focusWhisper.parked = false;
        focusWhisper.tries++;
    }
    focusWhisper.last = -1;
    focusWhisper.parked = true;
    focusWhisper.tries = 0;


    /* ==========================================================================
       4b. TAP NAVIGATION — read the messages without hunting for them
       --------------------------------------------------------------------------
       The scroll-linked beam is still the atmosphere, but it is no longer the
       only way through. Every tap on the garden (or the next arrow) scrolls the
       pinned stage exactly onto the next tip, so a message is always one action
       away and the order can never be lost. Prev/next wrap around.
       ======================================================================= */
    let navFocus = -1;
    let dotEls = [];

    function buildDots() {
        if (!navDots) return;
        navDots.innerHTML = whispers.map(() => '<span class="sakura-dot"></span>').join('');
        dotEls = $$('.sakura-dot', navDots);
        navFocus = -1;
    }

    function syncNav(focus) {
        if (focus === navFocus) return;
        navFocus = focus;
        for (let i = 0; i < dotEls.length; i++) {
            dotEls[i].classList.toggle('is-on', i === focus);
        }
        if (navCount) {
            const n = whispers.length;
            navCount.textContent = focus < 0
                ? '— / ' + String(n).padStart(2, '0')
                : String(focus + 1).padStart(2, '0') + ' / ' + String(n).padStart(2, '0');
        }
    }

    /* The scroll position at which a given tip is the one being read. It uses
       the same schedule as beamAt(), so tapping and scrolling land on exactly
       the same frame of the reveal. */
    function progressForMessage(i) {
        const n = whispers.length;
        if (!n) return 0;
        const total = beamUnits(n);
        return clamp((LEAD_IN + i * (DWELL + 1) + DWELL * 0.5) / total, 0, 1);
    }

    function goToMessage(i) {
        const n = whispers.length;
        if (!n || sceneTravel <= 0) return;
        i = ((i % n) + n) % n;
        const top = sceneTop + sceneTravel * progressForMessage(i);
        window.scrollTo({ top: Math.round(top), left: 0, behavior: REDUCED ? 'auto' : 'smooth' });
    }

    function stepMessage(dir) {
        const n = whispers.length;
        if (!n) return;
        /* Read the tip the light is on (or heading to) right now, rather than
           the last frame's cached value: several quick taps then walk through
           the messages instead of landing on the same one twice. */
        const b = beamAt(sceneProgress());
        const from = b ? b.focus : (dir > 0 ? -1 : 0);
        goToMessage(from + dir);
    }

    navButtons.forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            stepMessage(Number(btn.dataset.nav) || 1);
        });
    });

    /* Tapping the garden advances, because on a phone the next message should
       be reachable with a thumb already on the screen. Controls and the link
       hints keep their own behaviour. */
    if (scene) {
        scene.addEventListener('click', (e) => {
            if (!transformed || !gardenActive) return;
            if (e.target.closest('.sakura-nav')) return;
            stepMessage(1);
        });
    }

    /* Arrow keys are the desktop equivalent of the arrows. Vertical scrolling
       and every other key are left exactly as the browser has them. */
    document.addEventListener('keydown', (e) => {
        if (!transformed || !gardenActive) return;
        if (e.key === 'ArrowRight') { e.preventDefault(); stepMessage(1); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); stepMessage(-1); }
    });


    function initGarden() {
        if (!gardenBuilt) {
            gardenBuilt = true;
            measureScene();
            growTree();
            /* the viewBox has to be fitted to the tree that was actually drawn
               before anything measures a position against it */
            fitTreeToStage();
            /* growTree() is what puts the anchors in the DOM, so they can only
               be collected now — querying them at load time found nothing */
            anchors = $$('.sakura-anchor', scene);
            measureAnchors();
            buildWhispers();
            buildBeamPath();
            layoutWhispers();
            hazeBlobs = $$('.sakura-haze-blob', scene);

            /* scroll-linked motion is scrubbed, not re-created every frame:
               one paused timeline per layer, seek() to the scroll percentage */
            if (!REDUCED) {
                treeLean = anime({
                    targets: tree,
                    /* a touch more lean than before: with a shorter section the
                       same few degrees of sway now happen over a flick rather
                       than a full arm-length scroll, so the canopy visibly
                       answers the scroll instead of sitting still under it */
                    rotate: [-2.1, 3.1],
                    duration: 1000,
                    easing: 'linear',
                    autoplay: false
                });
                hazeScrub = hazeBlobs.map((blob, i) => anime({
                    targets: blob,
                    translateY: [0, 30 + i * 22],
                    duration: 1000,
                    easing: 'linear',
                    autoplay: false
                }));
            }
        }

        /* the garden is on screen the moment it opens; the observer below only
           needs to pause the maths when the reader scrolls away from it */
        gardenActive = true;
        onSceneScroll();

        /* only run the scroll maths while the section is actually on screen */
        if ('IntersectionObserver' in window) {
            new IntersectionObserver((entries) => {
                gardenActive = entries[0].isIntersecting;
                if (gardenActive) onSceneScroll();
            }, { threshold: 0 }).observe(scene);
        } else {
            gardenActive = true;
        }

        window.addEventListener('resize', onSceneResize, { passive: true });
        window.addEventListener('scroll', onSceneScroll, { passive: true });
    }

    /* A phone changes shape for reasons that have nothing to do with the tree:
       the URL bar sliding away, an on-screen keyboard, a rotation. Re-growing
       200 branches on every one of those would stutter, and the height-only
       changes do not need it anyway. So the tree is only re-composed when the
       aspect has genuinely crossed to the other shape, and the cheap refit runs
       on all of them. */
    let lastTall = -1;
    let cardBox = [];
    let sceneTop = 0;
    let sceneTravel = 0;
    let resizePending = false;

    /* Cache where the section begins and how long the pinned travel is. Both
       used to be measured with getBoundingClientRect() on every scroll frame;
       they only change on a resize, so measuring them here keeps the scroll
       handler free of layout reads altogether. */
    function measureScene() {
        if (!scene || !stage) return;
        sceneTop = scene.getBoundingClientRect().top + window.scrollY;
        sceneTravel = Math.max(0, scene.offsetHeight - (stage.clientHeight || window.innerHeight));
    }

    /* Resize fires in bursts while a phone's URL bar slides away. Re-composing
       200 branches (or re-stacking every card) once per event is what made the
       reveal hitch on mobile, so the work is coalesced into one frame. */
    function onSceneResize() {
        if (!transformed || resizePending) return;
        resizePending = true;
        requestAnimationFrame(() => {
            resizePending = false;
            if (!transformed) return;

            const tall = tallness();
            if (Math.abs(tall - lastTall) > 0.08) {
                lastTall = tall;
                recomposeTree();
            } else {
                /* a stretch or a nudge: keep the same tree, re-frame it */
                fitTreeToStage();
                measureAnchors();
                buildBeamPath();
            }
            measureScene();
            layoutWhispers();
            onSceneScroll();
        });
    }

    /* Re-grow the tree for a screen of a different shape. Same seed, so it is
       recognisably the same tree — just composed to fit. */
    function recomposeTree() {
        growTree();
        fitTreeToStage();
        anchors = $$('.sakura-anchor', scene);
        measureAnchors();

        /* the whispers belong to specific tips, so they move with them */
        whispers.forEach((w) => w.remove());
        whispers.length = 0;
        if (tipLayer) tipLayer.innerHTML = '';
        tipFlowers.length = 0;
        tipHalos.length = 0;
        tipEmbers.length = 0;
        hasLit.length = 0;
        cardState.length = 0;
        tipState.length = 0;
        litCount = -1;

        buildWhispers();
        buildBeamPath();
        layoutWhispers();
    }

    /* 0 -> top of the section, 1 -> bottom of the pinned stage. Pure arithmetic
       from the cached geometry: no rect read, no forced layout. */
    function sceneProgress() {
        if (sceneTravel <= 0) return 0;
        return clamp((window.scrollY - sceneTop) / sceneTravel, 0, 1);
    }

    /* Per-frame writes are the expensive part of a scroll-linked reveal, so
       each of these skips the DOM entirely when the rounded value has not
       moved. The old version rewrote opacity, blur and transform on every
       card every frame — and the filter change alone forced the text to be
       re-rasterised once per card per frame. */
    function applyWhisper(i, v) {
        const st = cardState[i];
        if (!st) return;

        const o = Math.round(v * 100) / 100;
        if (o !== st.o) {
            whispers[i].style.opacity = o.toFixed(2);
            st.o = o;

            const visible = o > 0.004;
            if (visible !== st.visible) {
                whispers[i].style.visibility = visible ? 'visible' : 'hidden';
                st.visible = visible;
            }
        }

        const ty = (1 - v) * 7;
        const sc = 0.965 + v * 0.035;
        if (Math.abs(ty - st.ty) > 0.25 || Math.abs(sc - st.scale) > 0.0015) {
            whispers[i].style.transform =
                'translate3d(0,' + ty.toFixed(1) + 'px,0) scale(' + sc.toFixed(3) + ')';
            st.ty = ty;
            st.scale = sc;
        }
    }

    function applyTip(i, g) {
        const st = tipState[i];
        if (!st) return;

        const o = Math.round(Math.max(0, (g - 0.12) / 0.88) * 50) / 50;
        if (o !== st.o) { tipFlowers[i].style.opacity = o; st.o = o; }

        const s = 0.6 + g * 0.52;
        if (Math.abs(s - st.s) > 0.012) {
            tipFlowers[i].setAttribute('transform',
                'rotate(' + ((i * 47) % 360) + ') scale(' + s.toFixed(3) + ')');
            st.s = s;
        }

        const h = Math.round(g * 0.85 * 50) / 50;
        if (h !== st.h) { tipHalos[i].style.opacity = h; st.h = h; }

        const r = Math.round((14 + g * 20) * 2) / 2;
        if (r !== st.r) { tipHalos[i].setAttribute('r', r); st.r = r; }
    }

    function onSceneScroll() {
        if (rafPending) return;
        rafPending = true;
        requestAnimationFrame(() => {
            rafPending = false;
            if (!transformed || !gardenActive) return;

            const prog = sceneProgress();

            /* The tree leans over as we scroll, so the sway has to be applied
               before the tips are read back. syncAnchors() applies the same
               rotation mathematically, which is what keeps the light on the
               blossom without reading layout once per card per frame. */
            if (treeLean) treeLean.seek(prog * 1000);
            hazeScrub.forEach((a) => a.seek(prog * 1000));
            syncAnchors(prog);

            const b = beamAt(prog);

            if (beam) {
                if (b) {
                    beam.style.transform =
                        'translate3d(' + b.x.toFixed(1) + 'px,' + b.y.toFixed(1) + 'px,0)';
                    beam.classList.add('is-on');
                } else {
                    beam.classList.remove('is-on');
                }
            }

            /* one number per tip: how lit it is right now */
            const raw = [];
            for (let i = 0; i < whispers.length; i++) {
                raw[i] = b ? litAt(i, b.x, b.y) : 0;
            }

            /* Only one message is ever readable, and it is always the tip the
               beam belongs to.

               Deciding by "whichever tip is nearest the beam" looks equivalent
               but is not: the beam is wider than the gap between some tips, so
               on the way from one tip to the next it grazes a third one and
               that message surfaces early — measured reading 7 before 6.
               Pinning legibility to the tip the beam is resting on or heading
               towards keeps the order exactly the order of the tree.

               The ceiling keeps the neighbours as a soft ghost of waiting text:
               visible as a shape, not readable as words. */
            const focus = b ? b.focus : -1;
            const active = focus >= 0 && raw[focus] > 0.5 ? focus : -1;

            syncNav(focus);

            /* keep the readable card clear of the ghost field. This only does
               anything when the light moves to a different tip, so the card
               under the reader's eyes holds perfectly still while they read. */
            focusWhisper(active);

            for (let i = 0; i < whispers.length; i++) {
                const v = i === active ? raw[i] :
                    (focusWhisper.parked ? Math.min(raw[i], 0.2) : 0);
                applyWhisper(i, v);

                /* The blossom opens onto the light. This follows the raw
                   distance rather than the capped value, so the next blossom
                   visibly starts opening while the beam is still travelling
                   toward it — the flowers lead the light, the text does not. */
                const g = raw[i];
                applyTip(i, g);

                if (!hasLit[i] && v > 0.7) {
                    hasLit[i] = true;
                    tipEmbers[i].style.opacity = '0.75';
                }
            }

            updateHint();

            /* the title has done its job once the light is moving */
            const wantTitle = prog > 0.1 ? 0 : 1;
            if (title && wantTitle !== titleFade) {
                titleFade = wantTitle;
                anime({
                    targets: title,
                    opacity: wantTitle,
                    translateY: wantTitle ? 12 : 0,
                    duration: 700,
                    easing: 'easeOutQuad'
                });
            }
        });
    }

    /* Counts the tips the light has touched at least once, so there is still a
       sense of having got through the tree — without any text ever piling up. */
    function updateHint() {
        if (!hint) return;
        const found = hasLit.filter(Boolean).length;
        if (found === litCount) return;
        litCount = found;
        const total = whispers.length;
        hint.textContent = !total ? 'scroll or tap to follow the light 🌙'
            : found >= total ? 'all blossoms open ✨ · tap to read again'
            : 'scroll or tap to follow the light 🌙';
    }


    /* ==========================================================================
       5. ATMOSPHERE — fireflies in the canopy, petals drifting over everything
       ======================================================================= */
    function startFireflies() {
        const wrap = $('#sakuraFireflies');
        if (!wrap || wrap.childElementCount || REDUCED) return;

        const count = window.innerWidth < 600 ? 8 : 14;
        for (let i = 0; i < count; i++) {
            const f = document.createElement('div');
            f.className = 'firefly';
            const size = (2 + Math.random() * 3).toFixed(1);
            f.style.width = f.style.height = size + 'px';
            f.style.left = (8 + Math.random() * 84).toFixed(2) + '%';
            f.style.top = (6 + Math.random() * 62).toFixed(2) + '%';

            /* Randomness is carried by custom properties; the drift itself is
               one compositor-run CSS animation, not an anime.js loop. */
            f.style.setProperty('--fx', (18 + Math.random() * 46).toFixed(0) + 'px');
            f.style.setProperty('--fy', (14 + Math.random() * 30).toFixed(0) + 'px');
            const dur = 9000 + Math.random() * 9000;
            f.style.setProperty('--fdur', dur.toFixed(0) + 'ms');
            f.style.setProperty('--fdelay', (-Math.random() * dur).toFixed(0) + 'ms');
            wrap.appendChild(f);
        }
    }

    function startAmbientPetals() {
        const wrap = $('#sakuraAmbient');
        if (!wrap || wrap.childElementCount || REDUCED) return;

        const count = window.innerWidth < 600 ? 8 : 12;
        for (let i = 0; i < count; i++) {
            const outer = document.createElement('div');
            outer.className = 'ambient-petal';

            const inner = document.createElement('div');
            inner.className = 'ambient-petal-inner';
            const size = 6 + Math.random() * 11;
            inner.style.width = inner.style.height = size.toFixed(1) + 'px';
            outer.appendChild(inner);

            outer.style.left = (Math.random() * 100).toFixed(2) + '%';
            outer.style.opacity = (0.18 + Math.random() * 0.4).toFixed(2);

            const dur = 11000 + Math.random() * 15000;
            const sway = 30 + Math.random() * 80;
            outer.style.setProperty('--pdur', dur.toFixed(0) + 'ms');
            outer.style.setProperty('--pdelay', (-Math.random() * dur).toFixed(0) + 'ms');
            outer.style.setProperty('--pdrift', ((Math.random() - 0.5) * 90).toFixed(0) + 'px');
            inner.style.setProperty('--psway', (dur * 0.26).toFixed(0) + 'ms');
            inner.style.setProperty('--pswing', sway.toFixed(0) + 'px');

            wrap.appendChild(outer);
        }
    }
})();
