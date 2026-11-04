'use strict';

(() => {
    const { h, figure, pick, random, fmt, sound, stats, wait, burst, params } = Lottery;

    // Official Powerball matrix: 5 of 69 white balls + 1 of 26 red.
    const WHITE = 69;
    const RED = 26;
    const PICK = 5;
    const TICKET = 2;
    const JACKPOT = 500e6; // advertised annuity jackpot used for display

    const C = (n, k) => {
        let r = 1;
        for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
        return r;
    };
    const pMatch = (whites, pb) =>
        (C(PICK, whites) * C(WHITE - PICK, PICK - whites)) / C(WHITE, PICK) * (pb ? 1 / RED : (RED - 1) / RED);

    const TIERS = [
        { whites: 5, pb: true,  prize: JACKPOT, label: 'JACKPOT' },
        { whites: 5, pb: false, prize: 1e6 },
        { whites: 4, pb: true,  prize: 50000 },
        { whites: 4, pb: false, prize: 100 },
        { whites: 3, pb: true,  prize: 100 },
        { whites: 3, pb: false, prize: 7 },
        { whites: 2, pb: true,  prize: 7 },
        { whites: 1, pb: true,  prize: 4 },
        { whites: 0, pb: true,  prize: 4 },
    ].map(t => ({ ...t, p: pMatch(t.whites, t.pb) }));
    const ANY_PRIZE_P = TIERS.reduce((a, t) => a + t.p, 0);
    const LOSE = { whites: -1, pb: false, prize: 0, p: 1 - ANY_PRIZE_P };
    const tierFor = (whites, pb) => TIERS.find(t => t.whites === whites && t.pb === pb) || LOSE;
    const prizeLabel = t => t.label || (t.prize ? fmt.money(t.prize).replace('.00', '') : 'Nothing');

    const LIGHTNING_P = 1 / 1222000; // NOAA: odds of being struck in a given year (US)

    function sample(n, k) {
        const pool = Array.from({ length: n }, (_, i) => i + 1);
        for (let i = 0; i < k; i++) {
            const j = i + Math.floor(random() * (n - i));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        return pool.slice(0, k).sort((a, b) => a - b);
    }
    const quickPick = () => ({ whites: sample(WHITE, PICK), red: 1 + Math.floor(random() * RED) });

    // ---------- Ball drum (canvas) ----------
    function makeDrum(canvas, count, color, textColor) {
        const ctx = canvas.getContext('2d');
        const state = { balls: [], mixing: 0.25 };
        const size = () => {
            const dpr = window.devicePixelRatio || 1;
            const w = canvas.clientWidth;
            canvas.width = w * dpr;
            canvas.height = w * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            return w;
        };
        let W = size();
        const R = () => W / 2 - 6;
        const br = () => Math.max(7, W / 26);

        function reset() {
            state.balls = Array.from({ length: count }, (_, i) => {
                const a = Math.random() * Math.PI * 2;
                const d = Math.random() * (R() - br() * 2);
                return { n: i + 1, x: W / 2 + Math.cos(a) * d, y: W / 2 + Math.sin(a) * d, vx: 0, vy: 0 };
            });
        }
        reset();

        function step() {
            const cx = W / 2;
            const cy = W / 2;
            const rr = R() - br();
            for (const b of state.balls) {
                b.vy += 0.25;
                // air jet from the bottom while mixing
                if (b.y > cy + rr * 0.3) b.vy -= state.mixing * (1 + Math.random() * 1.5);
                b.vx += (Math.random() - 0.5) * state.mixing * 1.6;
                b.vx *= 0.995;
                b.vy *= 0.995;
                b.x += b.vx;
                b.y += b.vy;
                const dx = b.x - cx;
                const dy = b.y - cy;
                const dist = Math.hypot(dx, dy);
                if (dist > rr) {
                    const nx = dx / dist;
                    const ny = dy / dist;
                    b.x = cx + nx * rr;
                    b.y = cy + ny * rr;
                    const dot = b.vx * nx + b.vy * ny;
                    b.vx = (b.vx - 2 * dot * nx) * 0.8;
                    b.vy = (b.vy - 2 * dot * ny) * 0.8;
                }
            }
        }

        function draw() {
            ctx.clearRect(0, 0, W, W);
            const cx = W / 2;
            const g = ctx.createRadialGradient(cx * 0.8, cx * 0.7, 10, cx, cx, R());
            g.addColorStop(0, 'rgba(255,255,255,0.9)');
            g.addColorStop(1, 'rgba(255,255,255,0.6)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(cx, cx, R(), 0, Math.PI * 2);
            ctx.fill();
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = '#111111';
            ctx.stroke();
            const r = br();
            ctx.font = `700 ${Math.round(r * 0.95)}px "IBM Plex Mono", monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            for (const b of state.balls) {
                const bg = ctx.createRadialGradient(b.x - r * 0.35, b.y - r * 0.35, 1, b.x, b.y, r);
                bg.addColorStop(0, '#fff');
                bg.addColorStop(1, color);
                ctx.fillStyle = bg;
                ctx.beginPath();
                ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
                ctx.fill();
                ctx.lineWidth = 1;
                ctx.strokeStyle = 'rgba(17,17,17,0.55)';
                ctx.stroke();
                ctx.fillStyle = textColor;
                ctx.fillText(b.n, b.x, b.y + 0.5);
            }
            // glass highlight
            ctx.strokeStyle = 'rgba(17,17,17,0.08)';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(cx, cx, R() - 8, Math.PI * 1.1, Math.PI * 1.45);
            ctx.stroke();
        }

        return {
            state,
            reset,
            resize() { W = size(); reset(); },
            frame() { step(); draw(); },
            remove(n) { state.balls = state.balls.filter(b => b.n !== n); },
        };
    }

    // ---------- Machine ----------
    let alive = false;
    let primaryAction = null;
    let rafId = 0;

    function mount(root) {
        alive = true;
        let busy = false;
        let ticket = quickPick();
        let draws = 0;

        const whiteCanvas = h('canvas', { class: 'drum drum-white' });
        const redCanvas = h('canvas', { class: 'drum drum-red' });
        const tray = h('div', { class: 'tray' }, Array.from({ length: 6 }, (_, i) => h('span', { class: 'tray-slot' + (i === 5 ? ' is-red' : '') })));
        const ticketEl = h('div', { class: 'ticket-numbers' });
        const message = h('div', { class: 'pb-message' }, 'Pick your numbers or use a quick pick, then draw.');
        const drawBtn = h('button', { class: 'btn btn-primary', type: 'button', onclick: draw }, `Draw · ${fmt.money(TICKET)}`);
        const quickBtn = h('button', { class: 'btn', type: 'button', onclick: () => { if (!busy) { ticket = quickPick(); renderTicket(); renderPicker(); } } }, 'Quick pick');
        const pickBtn = h('button', { class: 'btn', type: 'button', onclick: () => { picker.hidden = !picker.hidden; } }, 'Choose numbers');
        const lifeBtn = h('button', { class: 'btn', type: 'button', onclick: lifetime }, 'Play twice a week for 50 years');
        const picker = h('div', { class: 'picker', hidden: true });
        const sim = h('div', { class: 'sim', hidden: true });

        root.append(h('div', { class: 'split' },
            h('div', { class: 'split-main' },
                h('div', { class: 'pb-stage' },
                    h('div', { class: 'drums' },
                        h('div', { class: 'drum-wrap' }, whiteCanvas, h('span', {}, `${WHITE} white balls`)),
                        h('div', { class: 'drum-wrap drum-wrap-red' }, redCanvas, h('span', {}, `${RED} red Powerballs`))),
                    tray,
                    message,
                    h('div', { class: 'ticket' },
                        h('div', { class: 'ticket-head' }, h('b', {}, 'YOUR TICKET'), h('span', {}, `Draw #${draws + 1}`)),
                        ticketEl),
                    picker),
                h('div', { class: 'actions' }, drawBtn, quickBtn, pickBtn, lifeBtn),
                sim),
            h('aside', { class: 'split-side' }, oddsPanel())));

        const whiteDrum = makeDrum(whiteCanvas, WHITE, '#ffffff', '#111111');
        const redDrum = makeDrum(redCanvas, RED, '#d7261e', '#ffffff');
        const onResize = () => { whiteDrum.resize(); redDrum.resize(); };
        window.addEventListener('resize', onResize);
        mount.cleanup = () => window.removeEventListener('resize', onResize);

        cancelAnimationFrame(rafId);
        (function loop() {
            if (!alive) return;
            whiteDrum.frame();
            redDrum.frame();
            rafId = requestAnimationFrame(loop);
        })();

        renderTicket();
        renderPicker();

        function ball(n, red, extra = '') {
            return h('span', { class: `ball${red ? ' is-red' : ''} ${extra}` }, String(n));
        }

        function renderTicket(drawn) {
            ticketEl.replaceChildren(
                ...ticket.whites.map(n => ball(n, false, drawn?.whites.includes(n) ? 'is-match' : '')),
                ball(ticket.red, true, drawn && drawn.red === ticket.red ? 'is-match' : ''));
            ticketEl.closest('.ticket').querySelector('.ticket-head span').textContent = `Draw #${draws + 1}`;
        }

        function renderPicker() {
            const toggleWhite = n => {
                if (busy) return;
                const has = ticket.whites.includes(n);
                if (has) ticket.whites = ticket.whites.filter(x => x !== n);
                else if (ticket.whites.length < PICK) ticket.whites = [...ticket.whites, n].sort((a, b) => a - b);
                renderTicket();
                renderPicker();
            };
            picker.replaceChildren(
                h('div', { class: 'picker-label' }, `White balls: pick ${PICK} (${ticket.whites.length}/${PICK})`),
                h('div', { class: 'picker-grid' }, Array.from({ length: WHITE }, (_, i) => h('button', {
                    type: 'button', class: 'pick' + (ticket.whites.includes(i + 1) ? ' is-on' : ''), onclick: () => toggleWhite(i + 1),
                }, String(i + 1)))),
                h('div', { class: 'picker-label' }, 'Powerball: pick 1'),
                h('div', { class: 'picker-grid' }, Array.from({ length: RED }, (_, i) => h('button', {
                    type: 'button', class: 'pick is-red' + (ticket.red === i + 1 ? ' is-on' : ''),
                    onclick: () => { if (!busy) { ticket.red = i + 1; renderTicket(); renderPicker(); } },
                }, String(i + 1)))));
        }

        async function draw() {
            if (busy) return;
            if (ticket.whites.length < PICK) {
                message.textContent = `Pick ${PICK - ticket.whites.length} more white ball${PICK - ticket.whites.length > 1 ? 's' : ''}.`;
                picker.hidden = false;
                return;
            }
            busy = true;
            drawBtn.disabled = quickBtn.disabled = lifeBtn.disabled = true;
            sound.unlock();
            stats.record({ tries: 1, spent: TICKET });
            picker.hidden = true;
            sim.hidden = true;

            const result = params.get('force') === 'jackpot' ? { whites: [...ticket.whites], red: ticket.red } : quickPick();
            // Reveal whites in random draw order like the TV draw, not sorted.
            const order = [...result.whites].sort(() => Math.random() - 0.5);
            whiteDrum.reset();
            redDrum.reset();
            renderTicket();
            const slots = [...tray.children];
            slots.forEach(s => { s.replaceChildren(); s.classList.remove('is-filled'); });
            message.textContent = 'Mixing…';

            for (let i = 0; i < PICK; i++) {
                whiteDrum.state.mixing = 1.1;
                await wait(i === 0 ? 1400 : 900);
                whiteDrum.remove(order[i]);
                whiteDrum.state.mixing = 0.4;
                placeBall(slots[i], order[i], false, ticket.whites.includes(order[i]));
                await wait(450);
            }
            message.textContent = 'And the Powerball is…';
            redDrum.state.mixing = 1.1;
            await wait(1600);
            redDrum.remove(result.red);
            redDrum.state.mixing = 0.25;
            whiteDrum.state.mixing = 0.25;
            placeBall(slots[5], result.red, true, ticket.red === result.red);

            const whites = ticket.whites.filter(n => result.whites.includes(n)).length;
            const pb = ticket.red === result.red;
            const tier = tierFor(whites, pb);
            draws++;
            renderTicket(result);
            stats.record({ won: tier.prize });

            const matched = `${whites} white${pb ? ' + Powerball' : ''}`;
            if (tier === TIERS[0]) {
                message.textContent = `JACKPOT. ${prizeLabel({ prize: JACKPOT })}. That was ${fmt.oneIn(tier.p)}.`;
                burst(root.querySelector('.pb-stage'), ['#e0362b', '#fff', '#ffd36b'], 140);
                sound.reveal(4);
            } else if (tier.prize) {
                message.textContent = `You matched ${matched} and won ${prizeLabel(tier)} (${fmt.oneIn(tier.p)}).`;
                sound.reveal(tier.prize >= 100 ? 3 : 1);
            } else {
                message.textContent = `You matched ${whites ? matched : 'nothing'}. Nothing won. Odds of losing: ${fmt.pct(LOSE.p)}.`;
            }

            busy = false;
            drawBtn.disabled = quickBtn.disabled = lifeBtn.disabled = false;
        }

        function placeBall(slot, n, red, match) {
            slot.replaceChildren(ball(n, red, match ? 'is-match' : ''));
            slot.classList.add('is-filled');
            if (alive) {
                sound.thunk();
                if (match) sound.coin(0.1);
            }
        }

        function lifetime() {
            if (busy) return;
            const N = 104 * 50;
            const counts = new Map(TIERS.map(t => [t, 0]));
            let won = 0;
            let best = LOSE;
            for (let i = 0; i < N; i++) {
                const t = pick([...TIERS, LOSE], x => x.p);
                if (t === LOSE) continue;
                counts.set(t, counts.get(t) + 1);
                won += t.prize;
                if (t.prize > best.prize) best = t;
            }
            const spent = N * TICKET;
            stats.record({ tries: N, spent, won });
            const everJackpot = 1 - Math.pow(1 - TIERS[0].p, N);
            const maxCount = Math.max(1, ...counts.values());

            sim.hidden = false;
            sim.replaceChildren(
                h('div', { class: 'sim-headline' },
                    h('b', {}, fmt.int(N)), ' tickets over a lifetime. You spent ', h('b', {}, fmt.money(spent)),
                    ' and won back ', h('b', {}, fmt.money(won)), '.'),
                h('div', { class: 'sim-figures' },
                    figure('Biggest prize', prizeLabel(best), best.prize > 1000 ? 'is-good' : ''),
                    figure('Net', fmt.money(won - spent), won - spent < 0 ? 'is-bad' : 'is-good'),
                    figure('Chance you\'d ever hit the jackpot', fmt.oneIn(everJackpot))),
                h('div', { class: 'sim-bars' }, TIERS.slice().reverse().filter(t => t.prize < JACKPOT).map(t => h('div', { class: 'sim-bar', style: '--rc:#e0362b' },
                    h('span', { class: 'sim-bar-label' }, `${t.whites}${t.pb ? ' + PB' : ''} · ${prizeLabel(t)}`),
                    h('span', { class: 'sim-bar-track' },
                        h('span', { class: 'sim-bar-fill', style: `width:${Math.max(0.6, (counts.get(t) / maxCount) * 100)}%` })),
                    h('span', { class: 'sim-bar-count' }, fmt.int(counts.get(t)))))));
            sound.reveal(1);
        }

        primaryAction = draw;
    }

    function oddsPanel() {
        return h('section', { class: 'panel' },
            h('h3', { class: 'panel-title' }, 'Prize odds'),
            h('table', { class: 'odds-table' },
                h('thead', {}, h('tr', {}, h('th', {}, 'Match'), h('th', {}, 'Prize'), h('th', {}, 'Odds'))),
                h('tbody', {}, TIERS.map(t => h('tr', {},
                    h('td', {}, `${t.whites}${t.pb ? ' + ' : ''}`, t.pb ? h('span', { class: 'mini-red' }, 'PB') : null),
                    h('td', { class: 'num' }, prizeLabel(t)),
                    h('td', { class: 'num' }, fmt.oneIn(t.p)))))),
            h('div', { class: 'panel-note' },
                h('p', {}, 'Any prize at all: ', h('b', {}, fmt.oneIn(ANY_PRIZE_P)), '. Most of those are $4.'),
                h('p', {}, 'You are about ', h('b', {}, `${fmt.int(LIGHTNING_P / TIERS[0].p)}×`),
                    ' more likely to be struck by lightning this year than to win the jackpot with one ticket.'),
                h('p', {}, `If you bought every possible ticket it would cost ${fmt.money(TICKET / TIERS[0].p).replace('.00', '')}.`)));
    }

    Lottery.register({
        id: 'powerball',
        name: 'Powerball',
        kicker: 'Lottery 04 · the big one',
        tagline: 'Five white balls, one red ball, and the worst odds you\'ll ever pay $2 for.',
        headline: { label: 'Chance of the jackpot', p: TIERS[0].p },
        mount,
        unmount() { alive = false; cancelAnimationFrame(rafId); mount.cleanup?.(); },
        primary: () => primaryAction?.(),
    });
})();
