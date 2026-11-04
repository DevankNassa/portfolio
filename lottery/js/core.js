'use strict';

/*
 * Lottery core: RNG, sound, global stats, DOM helpers and the machine shell.
 * Each machine calls Lottery.register({...}) and gets mounted into the stage.
 *
 * URL params (handy for recording the video):
 *   ?seed=anything   reproducible outcomes
 *   ?force=gold      case: force a rarity (milspec|restricted|classified|covert|gold)
 *   ?force=jackpot   slots: force 7-7-7
 *   ?force=chase     packs: force the chase card (or double|ultra|illus|sir|hyper)
 *   ?force=hired     jobs: every application lands there (or offer|interview)
 */
const Lottery = (() => {
    const params = new URLSearchParams(location.search);

    // ---------- RNG ----------
    // Outcomes always go through `random`. Cosmetic effects use Math.random so
    // they never shift a seeded sequence.
    function hashString(str) {
        let h = 1779033703 ^ str.length;
        for (let i = 0; i < str.length; i++) {
            h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
            h = (h << 13) | (h >>> 19);
        }
        return h >>> 0;
    }

    function mulberry32(a) {
        return () => {
            a = (a + 0x6d2b79f5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    const seed = params.get('seed');
    const buf = new Uint32Array(1);
    const random = seed !== null
        ? mulberry32(hashString(seed))
        : () => crypto.getRandomValues(buf)[0] / 4294967296;

    function pick(entries, weightOf = e => e.weight) {
        let total = 0;
        for (const e of entries) total += weightOf(e);
        let r = random() * total;
        for (const e of entries) {
            r -= weightOf(e);
            if (r < 0) return e;
        }
        return entries[entries.length - 1];
    }

    const range = (min, max) => min + random() * (max - min);

    // Independent seeded generator, e.g. for precomputing headline odds.
    const makeRng = s => mulberry32(hashString(String(s)));

    // Standard normal sample (Box-Muller).
    function normal(rng = random) {
        let u = 0;
        while (u === 0) u = rng();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
    }

    // ---------- Formatting ----------
    const fmt = {
        money: v => (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        int: v => Math.round(v).toLocaleString('en-US'),
        oneIn: p => {
            const n = 1 / p;
            return '1 in ' + (n < 10 ? n.toFixed(2).replace(/\.?0+$/, '') : Math.round(n).toLocaleString('en-US'));
        },
        pct: p => {
            const x = p * 100;
            if (x >= 10) return x.toFixed(1) + '%';
            if (x >= 0.1) return x.toFixed(2) + '%';
            if (x >= 0.01) return x.toPrecision(2) + '%';
            // tiny odds: spell out the zeros (0.00000034%) instead of 3.4e-7
            return x.toFixed(Math.ceil(-Math.log10(x)) + 1) + '%';
        },
    };

    // ---------- DOM ----------
    function h(tag, props, ...kids) {
        const el = document.createElement(tag);
        for (const [k, v] of Object.entries(props || {})) {
            if (v === false || v == null) continue;
            if (k === 'class') el.className = v;
            else if (k === 'html') el.innerHTML = v;
            else if (k === 'style') el.style.cssText = v;
            else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
            else el.setAttribute(k, v === true ? '' : v);
        }
        for (const kid of kids.flat()) {
            if (kid == null || kid === false) continue;
            el.append(kid.nodeType ? kid : document.createTextNode(kid));
        }
        return el;
    }

    // Label + big value pair used in result panels.
    function figure(label, value, cls = '') {
        return h('div', { class: 'figure' }, h('span', {}, label), h('b', { class: cls }, value));
    }

    // ---------- Animation ----------
    const wait = ms => new Promise(res => setTimeout(res, ms));

    const ease = {
        linear: t => t,
        outQuad: t => 1 - (1 - t) * (1 - t),
        outCubic: t => 1 - Math.pow(1 - t, 3),
        outQuint: t => 1 - Math.pow(1 - t, 5),
    };

    function tween(duration, easing, onUpdate) {
        return new Promise(resolve => {
            const t0 = performance.now();
            function frame(now) {
                const t = Math.min(1, (now - t0) / duration);
                onUpdate(easing(t), t);
                if (t < 1) requestAnimationFrame(frame);
                else resolve();
            }
            requestAnimationFrame(frame);
        });
    }

    // Confetti-style particle burst inside `container` (must be position: relative).
    function burst(container, colors, count = 70) {
        const layer = h('div', { class: 'burst', 'aria-hidden': 'true' });
        for (let i = 0; i < count; i++) {
            const bit = h('i');
            bit.style.cssText =
                `--x:${(Math.random() - 0.5) * 2};` +
                `--y:${0.6 + Math.random() * 0.8};` +
                `--d:${0.9 + Math.random() * 1.1}s;` +
                `--r:${Math.random() * 1080 - 540}deg;` +
                `--c:${colors[i % colors.length]};` +
                `left:${50 + (Math.random() - 0.5) * 30}%;`;
            layer.append(bit);
        }
        container.append(layer);
        setTimeout(() => layer.remove(), 2600);
    }

    // ---------- Sound (synthesised, no asset files) ----------
    const sound = (() => {
        let ctx = null;
        let master = null;
        let muted = localStorage.getItem('lottery.muted') === '1';

        function unlock() {
            if (!ctx) {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (!AC) return null;
                ctx = new AC();
                master = ctx.createGain();
                master.gain.value = 0.5;
                master.connect(ctx.destination);
            }
            if (ctx.state === 'suspended') ctx.resume();
            return ctx;
        }

        function tone({ freq = 440, dur = 0.1, type = 'sine', gain = 0.2, at = 0, slide = 0 }) {
            if (muted) return;
            const c = unlock();
            if (!c) return;
            const t = c.currentTime + at;
            const osc = c.createOscillator();
            const g = c.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, t);
            if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            osc.connect(g).connect(master);
            osc.start(t);
            osc.stop(t + dur + 0.02);
        }

        // Band-passed white noise: foil rips, card swishes.
        function noise({ dur = 0.2, gain = 0.2, freq = 2000, slide = 1, q = 0.8, at = 0 }) {
            if (muted) return;
            const c = unlock();
            if (!c) return;
            const t = c.currentTime + at;
            const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
            const src = c.createBufferSource();
            src.buffer = buf;
            const filter = c.createBiquadFilter();
            filter.type = 'bandpass';
            filter.Q.value = q;
            filter.frequency.setValueAtTime(freq, t);
            if (slide !== 1) filter.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
            const g = c.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            src.connect(filter).connect(g).connect(master);
            src.start(t);
        }

        return {
            unlock,
            tone,
            noise,
            rip() {
                for (let i = 0; i < 10; i++) {
                    noise({ dur: 0.04 + Math.random() * 0.06, gain: 0.3, freq: 1500 + Math.random() * 3000, q: 1.4, at: i * 0.035 });
                }
            },
            swish: () => noise({ dur: 0.16, gain: 0.12, freq: 3200, slide: 0.4, q: 0.7 }),
            tick: () => tone({ freq: 2300 + Math.random() * 400, dur: 0.03, type: 'square', gain: 0.04 }),
            thunk: () => tone({ freq: 160, dur: 0.14, type: 'triangle', gain: 0.35, slide: 0.5 }),
            shake: () => tone({ freq: 90, dur: 0.3, type: 'sawtooth', gain: 0.06, slide: 1.6 }),
            reveal(level) {
                const notes = [523, 659, 784, 1047, 1319];
                for (let i = 0; i <= level; i++) {
                    tone({ freq: notes[i], dur: 0.4, type: 'triangle', gain: 0.14, at: i * 0.09 });
                }
            },
            coin: (at = 0) => {
                tone({ freq: 1320, dur: 0.07, type: 'square', gain: 0.04, at });
                tone({ freq: 1980, dur: 0.12, type: 'square', gain: 0.04, at: at + 0.05 });
            },
            get muted() { return muted; },
            setMuted(m) {
                muted = m;
                localStorage.setItem('lottery.muted', m ? '1' : '0');
            },
        };
    })();

    // ---------- Global stats ----------
    const stats = (() => {
        const KEY = 'lottery.stats';
        const empty = () => ({ tries: 0, spent: 0, won: 0 });
        const listeners = new Set();
        let s;
        try { s = { ...empty(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
        catch { s = empty(); }

        function changed() {
            localStorage.setItem(KEY, JSON.stringify(s));
            listeners.forEach(fn => fn(s));
        }

        return {
            record({ tries = 0, spent = 0, won = 0 }) {
                s.tries += tries;
                s.spent += spent;
                s.won += won;
                changed();
            },
            reset() { s = empty(); changed(); },
            subscribe(fn) { listeners.add(fn); fn(s); },
        };
    })();

    // ---------- Shell ----------
    const machines = [];
    let current = null;

    const register = machine => machines.push(machine);

    function route() {
        const id = location.hash.slice(1);
        const playable = machines.filter(m => !m.soon);
        const machine = playable.find(m => m.id === id) || playable[0];
        if (machine === current) return;

        current?.unmount?.();
        current = machine;

        const stage = document.getElementById('stage');
        const body = h('div', { class: 'machine-body' });
        stage.replaceChildren(
            h('header', { class: 'machine-head' },
                h('div', {},
                    h('div', { class: 'kicker' }, machine.kicker),
                    h('h1', {}, machine.name),
                    h('p', { class: 'tagline' }, machine.tagline)),
                h('div', { class: 'headline-odds' },
                    h('span', { class: 'label' }, machine.headline.label),
                    h('strong', {}, fmt.oneIn(machine.headline.p)),
                    h('span', { class: 'pct' }, fmt.pct(machine.headline.p)))),
            body);
        machine.mount(body);

        document.querySelectorAll('.nav-item').forEach(btn => {
            btn.classList.toggle('is-active', btn.dataset.id === machine.id);
        });
    }

    function boot() {
        const nav = document.getElementById('machine-nav');
        machines.forEach((m, i) => {
            nav.append(h('button', {
                class: 'nav-item' + (m.soon ? ' is-soon' : ''),
                type: 'button',
                'data-id': m.id,
                disabled: !!m.soon,
                onclick: () => { location.hash = m.id; },
            },
                h('span', { class: 'nav-index' }, String(i + 1).padStart(2, '0')),
                h('span', { class: 'nav-name' }, m.name),
                h('span', { class: 'nav-odds' }, m.soon ? 'coming soon' : fmt.oneIn(m.headline.p))));
        });

        const $ = id => document.getElementById(id);
        stats.subscribe(s => {
            const net = s.won - s.spent;
            $('stat-tries').textContent = fmt.int(s.tries);
            $('stat-spent').textContent = fmt.money(s.spent);
            $('stat-won').textContent = fmt.money(s.won);
            $('stat-net').textContent = fmt.money(net);
            $('stat-net').className = net < 0 ? 'is-bad' : net > 0 ? 'is-good' : '';
        });

        const muteBtn = $('mute-btn');
        const syncMute = () => { muteBtn.textContent = sound.muted ? 'Sound off' : 'Sound on'; };
        muteBtn.addEventListener('click', () => { sound.setMuted(!sound.muted); syncMute(); });
        syncMute();
        $('reset-btn').addEventListener('click', () => stats.reset());

        // Space triggers the current machine's main action (nice for recording).
        document.addEventListener('keydown', e => {
            if (e.code !== 'Space' || e.repeat) return;
            if (e.target.closest('button, input, textarea, select')) return;
            e.preventDefault();
            current?.primary?.();
        });

        window.addEventListener('hashchange', route);
        route();
    }

    document.addEventListener('DOMContentLoaded', boot);

    return { params, random, pick, range, makeRng, normal, fmt, h, figure, wait, ease, tween, burst, sound, stats, register };
})();
