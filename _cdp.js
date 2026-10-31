/* CDP driver: node --experimental-websocket _cdp.js <url> <w> <h> <script> <waitMs> <shot> <mobile|desktop> */
const fs = require('fs');

const [, , URL, W, HGT, SCRIPT, WAIT, SHOT, MODE, THROTTLE] = process.argv;
const width = +W, height = +HGT;
const mobile = (MODE || 'desktop') === 'mobile';
const cpu = +(THROTTLE || 1);

(async () => {
    const t = await (await fetch('http://127.0.0.1:9222/json/new?' + encodeURIComponent('about:blank'),
        { method: 'PUT' })).json();
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    let id = 0;
    const pending = new Map();
    const events = [];
    const send = (method, params) => new Promise((res, rej) => {
        const i = ++id;
        pending.set(i, { res, rej });
        ws.send(JSON.stringify({ id: i, method, params: params || {} }));
    });
    const loaded = new Promise((res) => events.push({ m: 'Page.loadEventFired', res }));

    ws.addEventListener('message', (e) => {
        const d = JSON.parse(e.data);
        if (d.id && pending.has(d.id)) {
            const p = pending.get(d.id);
            pending.delete(d.id);
            d.error ? p.rej(new Error(d.error.message)) : p.res(d.result);
        } else if (d.method) {
            events.filter((x) => x.m === d.method).forEach((x) => { x.res(); x.done = 1; });
        }
    });
    await new Promise((r) => ws.addEventListener('open', r));

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', {
        width, height, deviceScaleFactor: mobile ? 3 : 1, mobile
    });
    if (mobile) {
        await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
        await send('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });
    }
    /* a desktop core is several times faster than a phone's, so without this
       every performance number here is optimistic by that factor */
    if (cpu > 1) await send('Emulation.setCPUThrottlingRate', { rate: cpu });
    await send('Page.navigate', { url: URL });
    await Promise.race([loaded, new Promise((r) => setTimeout(r, 15000))]);
    /* a hidden or backgrounded tab throttles requestAnimationFrame to nothing,
       which looks exactly like a broken animation */
    await send('Page.bringToFront').catch(() => {});
    await new Promise((r) => setTimeout(r, +WAIT || 2000));

    const ready = await send('Runtime.evaluate', {
        expression: '!!document.getElementById("beanCracker")', returnByValue: true
    });
    if (!ready.result.value) console.log('!! app never became ready');

    const body = fs.readFileSync(SCRIPT, 'utf8');
    const out = await send('Runtime.evaluate', {
        expression: '(async () => {\n' + body + '\n})()',
        awaitPromise: true, returnByValue: true, timeout: 120000
    });
    console.log(typeof out.result.value === 'string'
        ? out.result.value
        : JSON.stringify(out.result.value ?? out.exceptionDetails ?? out, null, 1));

    if (SHOT && SHOT !== '-') {
        const shot = await send('Page.captureScreenshot', { format: 'png' }).catch(() => null);
        if (shot && shot.data) fs.writeFileSync(SHOT, Buffer.from(shot.data, 'base64'));
    }
    ws.close();
    process.exit(0);
})().catch((e) => { console.error('DRIVER FAIL: ' + e.message); process.exit(1); });
