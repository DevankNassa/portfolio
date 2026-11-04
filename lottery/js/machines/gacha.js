'use strict';

(() => {
    const { h, figure, random, fmt, sound, stats, wait, burst, params } = Lottery;

    // Rates modelled on the most common modern gacha system (Genshin-style
    // banner): 0.6% base, soft pity from pull 74, hard pity at 90, and a 50/50
    // for the featured character.
    const BASE5 = 0.006;
    const SOFT5 = 74;
    const STEP5 = 0.06;
    const HARD5 = 90;
    const BASE4 = 0.051;
    const HARD4 = 10;
    const FEATURED_CHANCE = 0.5;
    const PULL_COST = 1.98; // 160 premium gems at the best-value top-up pack

    const rate5 = n => (n >= HARD5 ? 1 : n >= SOFT5 ? Math.min(1, BASE5 + STEP5 * (n - SOFT5 + 1)) : BASE5);

    // Exact distribution of "pulls until a 5★" given the pity curve.
    const FIRST5 = (() => {
        const dist = [];
        let survive = 1;
        for (let n = 1; n <= HARD5; n++) {
            dist[n] = survive * rate5(n);
            survive *= 1 - rate5(n);
        }
        return dist;
    })();
    const EXPECTED5 = FIRST5.reduce((a, p, n) => a + (p || 0) * n, 0);
    const EFFECTIVE5 = 1 / EXPECTED5;
    const EXPECTED_FEATURED = EXPECTED5 * (1 + (1 - FEATURED_CHANCE));

    const FEATURED = { name: 'Aurelia', title: 'The Golden Die', glyph: '✦', colors: ['#ffcf4a', '#ff7ad9'] };
    const STANDARD5 = [
        { name: 'Volta', title: 'Storm of the Grid', glyph: 'ϟ', colors: ['#7fd8ff', '#4b69ff'] },
        { name: 'Ferro', title: 'Iron Gate', glyph: '⬢', colors: ['#c9c9d6', '#5a5f73'] },
        { name: 'Nyx', title: 'Leakage Current', glyph: '☾', colors: ['#8a5cff', '#1a0a3a'] },
        { name: 'Sol', title: 'Thermal Runaway', glyph: '☀', colors: ['#ffb347', '#e0362b'] },
    ];
    const FOUR = [
        { name: 'Cache', glyph: '◈', colors: ['#b26bff', '#4a1e8a'] },
        { name: 'Latch', glyph: '⌬', colors: ['#d46bff', '#561a6b'] },
        { name: 'Fuse', glyph: '✧', colors: ['#a47bff', '#2a1550'] },
        { name: 'Clock', glyph: '◷', colors: ['#c58bff', '#3d1d6b'] },
        { name: 'Bus', glyph: '≡', colors: ['#9b6bff', '#2c1a55'] },
    ];
    const THREE = [
        { name: 'Copper Trace', glyph: '⌇' },
        { name: 'Rusty Heatsink', glyph: '▤' },
        { name: 'Thermal Pad', glyph: '▢' },
        { name: 'Bent Pin', glyph: '⟊' },
        { name: 'Spare Capacitor', glyph: '⏚' },
        { name: 'Cracked Die', glyph: '◫' },
    ].map(i => ({ ...i, colors: ['#4b8bff', '#16284f'] }));

    const STAR_COLORS = { 3: '#4b8bff', 4: '#b26bff', 5: '#ffcf4a' };
    const anyOf = list => list[Math.floor(random() * list.length)];

    function makeBanner() {
        return { pity5: 0, pity4: 0, guaranteed: false };
    }

    function pullOnce(b, force) {
        b.pity5++;
        b.pity4++;
        if (force === 'gold' || random() < rate5(b.pity5)) {
            const pity = b.pity5;
            const featured = b.guaranteed || random() < FEATURED_CHANCE;
            b.guaranteed = !featured;
            b.pity5 = 0;
            return { stars: 5, item: featured ? FEATURED : anyOf(STANDARD5), featured, pity };
        }
        if (b.pity4 >= HARD4 || random() < BASE4) {
            b.pity4 = 0;
            return { stars: 4, item: anyOf(FOUR) };
        }
        return { stars: 3, item: anyOf(THREE) };
    }

    let alive = false;
    let primaryAction = null;

    function mount(root) {
        alive = true;
        const banner = makeBanner();
        let busy = false;
        let total = 0;
        let skip = null;

        const pityFill = h('span', { class: 'pity-fill' });
        const pityText = h('span', { class: 'pity-text' });
        const guarantee = h('span', { class: 'pity-guarantee' });
        const pull1 = h('button', { class: 'btn', type: 'button', onclick: () => wish(1) }, `Wish ×1 · ${fmt.money(PULL_COST)}`);
        const pull10 = h('button', { class: 'btn btn-primary', type: 'button', onclick: () => wish(10) }, `Wish ×10 · ${fmt.money(PULL_COST * 10)}`);
        const simBtn = h('button', { class: 'btn', type: 'button', onclick: untilFeatured }, `Pull until I get ${FEATURED.name}`);
        const history = h('div', { class: 'gacha-history' }, h('div', { class: 'inventory-empty' }, 'Your pulls will show up here.'));
        const sim = h('div', { class: 'sim', hidden: true });
        const stage = h('div', { class: 'gacha-stage' },
            h('div', { class: 'banner' },
                h('div', { class: 'banner-art', style: `--c1:${FEATURED.colors[0]};--c2:${FEATURED.colors[1]}` },
                    h('span', { class: 'banner-glyph' }, FEATURED.glyph)),
                h('div', { class: 'banner-info' },
                    h('span', { class: 'reveal-rarity', style: '--rc:#ffcf4a' }, 'Limited banner · 5★'),
                    h('h2', {}, FEATURED.name, h('small', {}, FEATURED.title)),
                    h('p', {}, `${fmt.pct(BASE5)} per pull. Pity kicks in at ${SOFT5}, guaranteed by ${HARD5}. Then it's a coin flip whether you get her.`),
                    h('div', { class: 'pity' },
                        h('div', { class: 'pity-track' }, pityFill, h('span', { class: 'pity-soft', style: `left:${(SOFT5 - 1) / HARD5 * 100}%` })),
                        h('div', { class: 'pity-meta' }, pityText, guarantee)))),
            h('div', { class: 'actions' }, pull1, pull10, simBtn));

        root.append(h('div', { class: 'split' },
            h('div', { class: 'split-main' },
                stage,
                sim,
                h('section', { class: 'panel' }, h('h3', { class: 'panel-title' }, 'History'), history)),
            h('aside', { class: 'split-side' }, ratesPanel())));

        renderPity();

        function renderPity() {
            pityFill.style.width = `${(banner.pity5 / HARD5) * 100}%`;
            pityFill.classList.toggle('is-soft', banner.pity5 >= SOFT5 - 1);
            pityText.textContent = `Pity ${banner.pity5} / ${HARD5}`;
            guarantee.textContent = banner.guaranteed ? `Next 5★ is guaranteed ${FEATURED.name}` : '50/50 on next 5★';
            guarantee.classList.toggle('is-on', banner.guaranteed);
        }

        async function wish(n) {
            if (busy) return;
            busy = true;
            pull1.disabled = pull10.disabled = simBtn.disabled = true;
            sim.hidden = true;
            sound.unlock();

            const results = Array.from({ length: n }, () => pullOnce(banner, params.get('force')));
            total += n;
            stats.record({ tries: n, spent: n * PULL_COST });
            const best = Math.max(...results.map(r => r.stars));
            await playWish(results, best);
            addHistory(results);
            renderPity();

            busy = false;
            pull1.disabled = pull10.disabled = simBtn.disabled = false;
        }

        // Shooting star whose colour gives away the best pull, then the cards.
        async function playWish(results, best) {
            const color = STAR_COLORS[best];
            const skipBtn = h('button', { class: 'wish-skip', type: 'button' }, 'Skip ›');
            const overlay = h('div', { class: `wish wish-${best}`, style: `--sc:${color}` },
                h('div', { class: 'wish-sky' }),
                h('div', { class: 'wish-star' }),
                skipBtn);
            stage.append(overlay);
            let skipped = false;
            const skipWait = ms => new Promise(res => {
                const t = setTimeout(res, ms);
                skip = () => { skipped = true; clearTimeout(t); res(); };
            });
            skipBtn.addEventListener('click', () => skip?.());

            if (alive) sound.tone({ freq: 220, dur: 1.6, type: 'sine', gain: 0.12, slide: best === 5 ? 4 : 2.5 });
            await skipWait(1700);
            if (!skipped) {
                overlay.classList.add('is-flash');
                if (alive) sound.reveal(best === 5 ? 4 : best === 4 ? 2 : 0);
                await skipWait(380);
            }

            const cards = h('div', { class: `wish-cards n-${results.length}` });
            overlay.replaceChildren(h('div', { class: 'wish-sky' }), cards, skipBtn);
            skipBtn.textContent = 'Continue ›';
            results.forEach((r, i) => {
                const c = gachaCard(r);
                c.style.animationDelay = skipped ? '0s' : `${i * 0.12}s`;
                cards.append(c);
            });
            if (best === 5) setTimeout(() => burst(overlay, ['#ffcf4a', '#fff', '#ff7ad9'], 90), skipped ? 0 : results.length * 120);

            await new Promise(res => { skip = res; });
            skip = null;
            overlay.remove();
        }

        function addHistory(results) {
            history.querySelector('.inventory-empty')?.remove();
            for (const r of results) {
                const el = h('span', { class: `hist s${r.stars}`, title: `${r.item.name}${r.pity ? ` (pity ${r.pity})` : ''}` },
                    r.stars === 5 ? `${r.item.name}${r.featured ? '' : ' (lost 50/50)'}` : r.item.name);
                history.prepend(el);
            }
            while (history.children.length > 120) history.lastChild.remove();
        }

        function untilFeatured() {
            if (busy) return;
            const b = makeBanner();
            let n = 0;
            let fives = 0;
            let fours = 0;
            let got = null;
            while (!got) {
                const r = pullOnce(b);
                n++;
                if (r.stars === 4) fours++;
                if (r.stars === 5) { fives++; if (r.featured) got = r; }
            }
            total += n;
            stats.record({ tries: n, spent: n * PULL_COST });

            // How 2,000 other players fared, for context.
            const players = Array.from({ length: 2000 }, () => {
                const pb = makeBanner();
                let k = 0;
                for (;;) { k++; const r = pullOnce(pb); if (r.stars === 5 && r.featured) return k; }
            });
            const BIN = 10;
            const bins = Array(Math.ceil((HARD5 * 2) / BIN)).fill(0);
            players.forEach(k => { bins[Math.min(bins.length - 1, Math.floor((k - 1) / BIN))]++; });
            const max = Math.max(...bins);
            const mineBin = Math.min(bins.length - 1, Math.floor((n - 1) / BIN));
            const luckier = players.filter(k => k < n).length / players.length;

            sim.hidden = false;
            sim.replaceChildren(
                h('div', { class: 'sim-headline' },
                    'It took ', h('b', {}, fmt.int(n)), ` pulls (${fmt.money(n * PULL_COST)}) to get ${FEATURED.name}.`),
                h('div', { class: 'sim-figures' },
                    figure('5★ pulled', `${fives}${fives > 1 ? ` (lost ${fives - 1} 50/50)` : ''}`),
                    figure('4★ pulled', fmt.int(fours)),
                    figure('Players who got her sooner', `${Math.round(luckier * 100)}%`),
                    figure('Worst case', `${HARD5 * 2} pulls · ${fmt.money(HARD5 * 2 * PULL_COST)}`, 'is-bad')),
                h('div', { class: 'histo' }, bins.map((c, i) => h('div', {
                    class: 'histo-bar' + (i === mineBin ? ' is-mine' : ''),
                    style: `height:${(c / max) * 100}%`,
                    title: `${i * BIN + 1}–${(i + 1) * BIN} pulls: ${c} players`,
                }))),
                h('div', { class: 'histo-axis' }, h('span', {}, '1 pull'), h('span', {}, `${HARD5} (pity)`), h('span', {}, `${HARD5 * 2} pulls`)));
            sound.reveal(3);
        }

        primaryAction = () => (skip ? skip() : wish(10));
    }

    function gachaCard(r) {
        const it = r.item;
        return h('div', { class: `gcard s${r.stars}`, style: `--c1:${it.colors[0]};--c2:${it.colors[1]}` },
            h('div', { class: 'gcard-art' }, h('span', {}, it.glyph)),
            h('div', { class: 'gcard-stars' }, '★'.repeat(r.stars)),
            h('div', { class: 'gcard-name' }, it.name),
            r.stars === 5 && !r.featured ? h('div', { class: 'gcard-tag' }, 'Lost the 50/50') : null);
    }

    function ratesPanel() {
        const row = (label, value, odds) => h('tr', {}, h('td', {}, label), h('td', { class: 'num' }, value), h('td', { class: 'num' }, odds));
        return h('section', { class: 'panel' },
            h('h3', { class: 'panel-title' }, 'Published rates'),
            h('table', { class: 'odds-table' },
                h('thead', {}, h('tr', {}, h('th', {}, 'Outcome'), h('th', {}, 'Chance'), h('th', {}, 'Odds'))),
                h('tbody', {},
                    row('5★ (base rate)', fmt.pct(BASE5), fmt.oneIn(BASE5)),
                    row('5★ (with pity)', fmt.pct(EFFECTIVE5), fmt.oneIn(EFFECTIVE5)),
                    row(`${FEATURED.name} specifically`, fmt.pct(1 / EXPECTED_FEATURED), fmt.oneIn(1 / EXPECTED_FEATURED)),
                    row('4★', fmt.pct(BASE4), `≤ ${HARD4}`))),
            h('div', { class: 'panel-note' },
                h('p', {}, 'Average cost to get the featured character: ',
                    h('b', {}, `${Math.round(EXPECTED_FEATURED)} pulls ≈ ${fmt.money(EXPECTED_FEATURED * PULL_COST)}`), '.'),
                h('p', {}, '"Pity" makes the odds look generous. The 0.6% headline rate is what you mostly experience until pull 74.'),
                h('p', {}, 'Prices are converted from premium currency. Games use gems so you stop counting dollars.')));
    }

    Lottery.register({
        id: 'gacha',
        name: 'Gacha Pull',
        kicker: 'Lottery 05 · wish banners',
        tagline: 'Loot boxes, but with characters you get attached to, and a pity timer to keep you going.',
        headline: { label: 'Chance of a 5★ per pull', p: BASE5 },
        mount,
        unmount() { alive = false; },
        primary: () => primaryAction?.(),
    });
})();
