'use strict';

(() => {
    const { h, figure, pick, random, fmt, sound, stats, tween, ease, wait, burst, params } = Lottery;

    // Virtual reel: each reel has 64 weighted stops. What you see on screen
    // is not what decides the odds. That's how real slot machines work too.
    const SYMBOLS = [
        { id: 'seven',   glyph: '7',   weight: 1,  pay: 1000 },
        { id: 'diamond', glyph: '◆',   weight: 3,  pay: 200 },
        { id: 'bar',     glyph: 'BAR', weight: 6,  pay: 80 },
        { id: 'star',    glyph: '★',   weight: 10, pay: 40 },
        { id: 'heart',   glyph: '♥',   weight: 18, pay: 10 },
        { id: 'club',    glyph: '♣',   weight: 26, pay: 4 },
    ];
    const PAIR_PAY = 1;          // first two reels match: you get your bet back
    const NEAR_MISS_CHANCE = 0.2; // how often a 7 is parked just off the payline
    const BETS = [1, 5, 10];
    const START_CREDITS = 100;

    const TOTAL_WEIGHT = SYMBOLS.reduce((a, s) => a + s.weight, 0);
    const prob = s => s.weight / TOTAL_WEIGHT;
    const SEVEN = SYMBOLS[0];
    const JACKPOT_P = prob(SEVEN) ** 3;
    const PAIR_P = SYMBOLS.reduce((a, s) => a + prob(s) ** 2 * (1 - prob(s)), 0);
    const RTP = SYMBOLS.reduce((a, s) => a + prob(s) ** 3 * s.pay, 0) + PAIR_P * PAIR_PAY;

    const spinResult = forced => forced === 'jackpot'
        ? [SEVEN, SEVEN, SEVEN]
        : [pick(SYMBOLS), pick(SYMBOLS), pick(SYMBOLS)];

    function evaluate(r) {
        if (r[0] === r[1] && r[1] === r[2]) return { mult: r[0].pay, kind: r[0] === SEVEN ? 'jackpot' : 'triple' };
        if (r[0] === r[1]) return { mult: PAIR_PAY, kind: 'pair' };
        return { mult: 0, kind: 'none' };
    }

    // Off-payline symbols are cosmetic, so the machine is free to tease you.
    const neighbour = () => Math.random() < NEAR_MISS_CHANCE ? SEVEN : SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
    const filler = () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];

    function cell(sym) {
        return h('div', { class: `cell s-${sym.id}` },
            sym.id === 'bar' ? h('span', { class: 'bar-plate' }, 'BAR') : sym.glyph);
    }

    // ---------- Machine ----------
    let alive = false;
    let primaryAction = null;

    function mount(root) {
        alive = true;
        let credits = START_CREDITS;
        let bet = BETS[0];
        let busy = false;

        const reels = Array.from({ length: 3 }, () => {
            const strip = h('div', { class: 'strip' });
            const el = h('div', { class: 'reel' }, strip);
            const visible = [filler(), filler(), filler()];
            strip.replaceChildren(filler(), ...visible.map(cell));
            return { el, strip, visible };
        });

        const ledCredits = h('b', {});
        const ledBet = h('b', {});
        const ledWin = h('b', {});
        const message = h('div', { class: 'slot-message' }, 'Pull the lever or press SPIN');
        const marquee = h('div', { class: 'marquee' },
            h('div', { class: 'bulbs' }),
            h('div', { class: 'marquee-title' }, 'SILICON ', h('span', {}, 'SEVENS')),
            h('div', { class: 'marquee-sub' }, `7 · 7 · 7 pays ${fmt.int(SEVEN.pay)}×`),
            h('div', { class: 'bulbs' }));
        const lever = h('button', { class: 'lever', type: 'button', 'aria-label': 'Pull lever', onclick: spin },
            h('span', { class: 'lever-rod' }), h('span', { class: 'lever-knob' }), h('span', { class: 'lever-base' }));
        const spinBtn = h('button', { class: 'btn btn-primary spin-btn', type: 'button', onclick: spin }, 'Spin');
        const betBtns = BETS.map(b => h('button', {
            class: 'btn btn-chip', type: 'button',
            onclick: () => { if (!busy) { bet = b; render(); } },
        }, `$${b}`));
        const refillBtn = h('button', { class: 'btn', type: 'button', onclick: refill }, `Insert ${fmt.money(100)}`);
        const sim = h('div', { class: 'sim', hidden: true });
        const simBtn = h('button', { class: 'btn', type: 'button', onclick: simulatePlayers },
            'Simulate 100 players');

        const cabinet = h('div', { class: 'cabinet' },
            marquee,
            h('div', { class: 'reels-wrap' },
                h('div', { class: 'reels' }, reels.map(r => r.el)),
                h('div', { class: 'payline' })),
            h('div', { class: 'leds' },
                h('div', { class: 'led' }, h('span', {}, 'Credits'), ledCredits),
                h('div', { class: 'led' }, h('span', {}, 'Bet'), ledBet),
                h('div', { class: 'led' }, h('span', {}, 'Win'), ledWin)),
            message,
            h('div', { class: 'slot-controls' },
                h('div', { class: 'bet-group' }, betBtns),
                spinBtn,
                refillBtn));

        root.append(h('div', { class: 'split' },
            h('div', { class: 'split-main' },
                h('div', { class: 'slot-stage' }, cabinet, lever),
                h('div', { class: 'actions' }, simBtn),
                sim),
            h('aside', { class: 'split-side' }, paytable())));

        ledWin.textContent = '0';
        render();

        function render() {
            ledCredits.textContent = fmt.int(credits);
            ledBet.textContent = fmt.int(bet);
            betBtns.forEach((b, i) => b.classList.toggle('is-active', BETS[i] === bet));
        }

        function refill() {
            if (busy) return;
            credits += 100;
            render();
            sound.coin();
        }

        function spinReel(reel, i, target) {
            const cellH = reel.el.clientHeight / 3;
            const above = neighbour();
            const below = neighbour();
            const fillers = Array.from({ length: 16 + i * 7 }, filler);
            // Top to bottom: [spare, above, target, below, ...fillers, current three]
            const seq = [filler(), above, target, below, ...fillers, ...reel.visible];
            reel.strip.replaceChildren(...seq.map(cell));
            reel.visible = [above, target, below];

            const startY = -(seq.length - 3) * cellH;
            const endY = -cellH;
            const overshoot = cellH * 0.14;
            reel.strip.classList.add('is-blurred');
            reel.strip.style.transform = `translate3d(0,${startY}px,0)`;

            return tween(1050 + i * 480, ease.outCubic, (p, t) => {
                const y = startY + (endY + overshoot - startY) * p;
                reel.strip.style.transform = `translate3d(0,${y}px,0)`;
                if (t > 0.7) reel.strip.classList.remove('is-blurred');
            }).then(() => {
                if (alive) sound.thunk();
                return tween(180, ease.outQuad, p => {
                    reel.strip.style.transform = `translate3d(0,${endY + overshoot * (1 - p)}px,0)`;
                });
            });
        }

        async function spin() {
            if (busy) return;
            if (credits < bet) {
                message.textContent = 'Out of credits. Insert more?';
                refillBtn.classList.add('is-nudged');
                setTimeout(() => refillBtn.classList.remove('is-nudged'), 600);
                return;
            }
            busy = true;
            spinBtn.disabled = true;
            sound.unlock();
            cabinet.querySelectorAll('.cell.is-hit').forEach(c => c.classList.remove('is-hit'));
            cabinet.classList.remove('is-jackpot');

            credits -= bet;
            stats.record({ tries: 1, spent: bet });
            ledWin.textContent = '0';
            message.textContent = 'Good luck…';
            render();

            lever.classList.remove('is-pulled');
            void lever.offsetWidth;
            lever.classList.add('is-pulled');

            const result = spinResult(params.get('force'));
            await Promise.all(reels.map((r, i) => spinReel(r, i, result[i])));

            const { mult, kind } = evaluate(result);
            const win = mult * bet;
            credits += win;
            render();

            if (win > 0) {
                stats.record({ won: win });
                const hitCount = kind === 'pair' ? 2 : 3;
                reels.slice(0, hitCount).forEach(r => r.strip.children[2].classList.add('is-hit'));
                await countUp(win);
            }

            if (kind === 'jackpot') {
                cabinet.classList.add('is-jackpot');
                message.textContent = `JACKPOT. That was a ${fmt.oneIn(JACKPOT_P)} spin.`;
                burst(cabinet, ['#ffd36b', '#ff4d3a', '#fff'], 120);
                sound.reveal(4);
            } else if (kind === 'triple') {
                message.textContent = `Three ${result[0].glyph}: ${fmt.int(mult)}× your bet.`;
                sound.reveal(2);
            } else if (kind === 'pair') {
                message.textContent = 'You "won"… your own bet back.';
            } else {
                const teased = reels.some(r => r.visible[0] === SEVEN || r.visible[2] === SEVEN);
                message.textContent = teased ? 'So close! (It wasn\'t. That 7 was never going to land.)' : 'Nothing. Spin again?';
            }

            busy = false;
            spinBtn.disabled = false;
        }

        async function countUp(win) {
            const steps = Math.min(30, win);
            for (let i = 1; i <= steps; i++) {
                ledWin.textContent = fmt.int((win * i) / steps);
                if (alive) sound.coin();
                await wait(win > 50 ? 40 : 70);
            }
        }

        function simulatePlayers() {
            const PLAYERS = 100;
            const SPINS = 600; // roughly an hour of play at a real machine
            const BANKROLL = 100;
            const finals = [];
            for (let p = 0; p < PLAYERS; p++) {
                let bank = BANKROLL;
                for (let s = 0; s < SPINS && bank >= 1; s++) {
                    bank -= 1;
                    bank += evaluate(spinResult()).mult;
                }
                finals.push(bank);
            }
            finals.sort((a, b) => a - b);
            const losers = finals.filter(b => b < BANKROLL).length;
            const broke = finals.filter(b => b < 1).length;
            const total = finals.reduce((a, b) => a + b, 0);

            sim.hidden = false;
            sim.replaceChildren(
                h('div', { class: 'sim-headline' },
                    h('b', {}, `${losers} of ${PLAYERS}`),
                    ` players walked away with less than they brought.`),
                h('div', { class: 'sim-figures' },
                    figure('Each player', `$${BANKROLL} · $1 spins · one hour (${SPINS} spins)`),
                    figure('Went broke', fmt.int(broke)),
                    figure('Best player left with', fmt.money(finals[finals.length - 1]), 'is-good'),
                    figure('The house kept', fmt.money(PLAYERS * BANKROLL - total), 'is-bad')),
                h('div', { class: 'players' }, finals.map(b => h('span', {
                    class: 'player' + (b >= BANKROLL ? ' is-up' : b < 1 ? ' is-broke' : ''),
                    title: fmt.money(b),
                }))));
        }

        primaryAction = spin;
    }

    function paytable() {
        const glyph = s => h('span', { class: `pay-glyph s-${s.id}` }, s.glyph);
        return h('section', { class: 'panel' },
            h('h3', { class: 'panel-title' }, 'Paytable'),
            h('table', { class: 'odds-table' },
                h('thead', {}, h('tr', {}, h('th', {}, 'Line'), h('th', {}, 'Pays'), h('th', {}, 'Odds'))),
                h('tbody', {},
                    SYMBOLS.map(s => h('tr', {},
                        h('td', {}, glyph(s), glyph(s), glyph(s)),
                        h('td', { class: 'num' }, `${fmt.int(s.pay)}×`),
                        h('td', { class: 'num' }, fmt.oneIn(prob(s) ** 3)))),
                    h('tr', {},
                        h('td', {}, 'First two match'),
                        h('td', { class: 'num' }, `${PAIR_PAY}×`),
                        h('td', { class: 'num' }, fmt.oneIn(PAIR_P))))),
            h('div', { class: 'panel-note' },
                h('p', {}, 'For every $1 you put in, this machine pays back ',
                    h('b', {}, fmt.money(RTP)), ' on average. The rest goes to the house.'),
                h('p', {}, 'A "first two match" win just gives you your bet back. It flashes like a win but you\'re no richer.'),
                h('p', {}, `The symbols above and below the line are cosmetic. ${Math.round(NEAR_MISS_CHANCE * 100)}% of the time the machine parks a 7 there to make you feel close.`)));
    }

    Lottery.register({
        id: 'slots',
        name: 'Slot Machine',
        kicker: 'Lottery 02 · one-armed bandit',
        tagline: 'Three reels, sixty-four virtual stops each, and a house that always wins.',
        headline: { label: 'Chance of the jackpot', p: JACKPOT_P },
        mount,
        unmount() { alive = false; },
        primary: () => primaryAction?.(),
    });
})();
