'use strict';

(() => {
    const { h, figure, random, makeRng, normal, fmt, sound, stats, tween, ease, wait, burst } = Lottery;

    // A 300 mm wafer of identical 12 x 12 mm, 8-core dies. Same design, same
    // factory, same day. Every die still comes out different.
    const WAFER_MM = 300;
    const RADIUS = 147;      // usable radius after edge exclusion
    const DIE_MM = 12;
    const CORES = 8;
    const WAFER_COST = 17000; // roughly a leading-edge wafer

    const MODEL = {
        meanGHz: 5.35,      // typical max stable all-core clock
        sdGHz: 0.24,        // die-to-die variation
        edgePenalty: 0.8,   // dies near the edge are slower (in sd units)
        defects: 0.3,       // average random defects per die
        edgeDefects: 2.5,   // ...and more of them near the edge
        uncoreKill: 0.3,    // chance a defect lands outside a core (fatal)
    };

    // Binned top to bottom: first match wins.
    const BINS = [
        { id: 'se',    name: 'X9 Special Edition', tier: 'Golden sample', color: '#ffcf4a', price: 699, test: d => d.cores === 8 && d.ghz >= 5.85 },
        { id: 'x9',    name: 'X9',                 tier: 'Flagship',      color: '#ff7a45', price: 589, test: d => d.cores === 8 && d.ghz >= 5.5 },
        { id: 'x7',    name: 'X7',                 tier: 'High-end',      color: '#b26bff', price: 409, test: d => d.cores === 8 && d.ghz >= 5.2 },
        { id: 'x5',    name: 'X5',                 tier: 'Mid-range · sold as 6-core', color: '#4b8bff', price: 289, test: d => d.cores >= 6 && d.ghz >= 5.0 },
        { id: 'x3',    name: 'X3',                 tier: 'Budget · sold as 4-core', color: '#3fbfbf', price: 129, test: d => d.cores >= 4 && d.ghz >= 4.6 },
        { id: 'scrap', name: 'Scrap',              tier: 'Ground up',     color: '#3a3d47', price: 0,   test: () => true },
    ];
    const binById = Object.fromEntries(BINS.map(b => [b.id, b]));

    // Die sites that fit entirely inside the usable circle.
    const SITES = (() => {
        const c = WAFER_MM / 2;
        const sites = [];
        for (let y = 0; y < WAFER_MM; y += DIE_MM) {
            for (let x = 0; x < WAFER_MM; x += DIE_MM) {
                const corners = [[x, y], [x + DIE_MM, y], [x, y + DIE_MM], [x + DIE_MM, y + DIE_MM]];
                if (corners.every(([a, b]) => Math.hypot(a - c, b - c) <= RADIUS)) {
                    const cx = x + DIE_MM / 2;
                    const cy = y + DIE_MM / 2;
                    sites.push({ x, y, row: y / DIE_MM, col: x / DIE_MM, r: Math.hypot(cx - c, cy - c) / RADIUS });
                }
            }
        }
        // Serpentine probe order, like a real wafer prober.
        return sites.sort((a, b) => a.row - b.row || (a.row % 2 ? b.col - a.col : a.col - b.col));
    })();

    function poisson(lambda, rng) {
        const L = Math.exp(-lambda);
        let k = 0;
        let p = 1;
        do { k++; p *= rng(); } while (p > L);
        return k - 1;
    }

    function makeDie(site, rng = random) {
        const lambda = MODEL.defects * (1 + MODEL.edgeDefects * site.r ** 4);
        const dead = new Set();
        let uncore = false;
        for (let i = poisson(lambda, rng); i > 0; i--) {
            if (rng() < MODEL.uncoreKill) uncore = true;
            else dead.add(Math.floor(rng() * CORES));
        }
        const q = normal(rng) - MODEL.edgePenalty * site.r * site.r;
        const ghz = Math.round((MODEL.meanGHz + MODEL.sdGHz * q) * 20) / 20;
        const die = { site, ghz, dead, uncore, cores: CORES - dead.size };
        die.bin = uncore ? binById.scrap : BINS.find(b => b.test(die));
        return die;
    }

    // Long-run bin rates from a fixed-seed run, so the nav always shows the same odds.
    const BIN_RATES = (() => {
        const rng = makeRng('silicon-rates');
        const counts = Object.fromEntries(BINS.map(b => [b.id, 0]));
        const WAFERS = 120;
        for (let w = 0; w < WAFERS; w++) for (const s of SITES) counts[makeDie(s, rng).bin.id]++;
        return Object.fromEntries(BINS.map(b => [b.id, counts[b.id] / (WAFERS * SITES.length)]));
    })();

    let alive = false;
    let primaryAction = null;

    function mount(root) {
        alive = true;
        let busy = false;
        let dies = [];
        let selected = null;
        let wafersMade = 0;

        const NS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', `0 0 ${WAFER_MM} ${WAFER_MM}`);
        svg.setAttribute('class', 'wafer-svg');
        const rects = SITES.map((s, i) => {
            const r = document.createElementNS(NS, 'rect');
            r.setAttribute('x', s.x + 0.4);
            r.setAttribute('y', s.y + 0.4);
            r.setAttribute('width', DIE_MM - 0.8);
            r.setAttribute('height', DIE_MM - 0.8);
            r.setAttribute('rx', 0.8);
            r.setAttribute('class', 'die');
            r.dataset.i = i;
            svg.append(r);
            return r;
        });
        const probe = document.createElementNS(NS, 'g');
        probe.setAttribute('class', 'probe');
        probe.innerHTML = `<rect width="${DIE_MM}" height="${DIE_MM}" rx="1"/><line x1="${DIE_MM / 2}" y1="-8" x2="${DIE_MM / 2}" y2="${DIE_MM + 8}"/><line x1="-8" y1="${DIE_MM / 2}" x2="${DIE_MM + 8}" y2="${DIE_MM / 2}"/>`;
        svg.append(probe);

        svg.addEventListener('click', e => {
            const i = e.target.dataset?.i;
            if (i != null && dies[i]) inspect(dies[i]);
        });

        const wafer = h('div', { class: 'wafer is-blank' }, h('div', { class: 'wafer-sheen' }), svg, h('div', { class: 'wafer-notch' }));
        const status = h('div', { class: 'wafer-status' }, `${SITES.length} dies per wafer · ${CORES} cores each · identical design`);
        const fabBtn = h('button', { class: 'btn btn-primary', type: 'button', onclick: fabricate }, 'Fabricate & test a wafer');
        const buyBtn = h('button', { class: 'btn', type: 'button', disabled: true, onclick: buyX9 }, 'Buy an X9 at the store');
        const inspector = h('div', { class: 'inspector' },
            h('div', { class: 'inspector-empty' }, 'Fabricate a wafer, then click any die to inspect it.'));
        const results = h('div', { class: 'sim', hidden: true });

        root.append(h('div', { class: 'split' },
            h('div', { class: 'split-main' },
                h('div', { class: 'silicon-stage' },
                    h('div', { class: 'wafer-col' }, wafer, status),
                    h('div', { class: 'silicon-side' },
                        h('div', { class: 'legend' }, BINS.map(b => h('div', { class: 'legend-row' },
                            h('span', { class: 'dot', style: `background:${b.color}` }),
                            h('span', {}, b.name),
                            h('span', { class: 'legend-count', 'data-bin': b.id }, '-')))),
                        inspector)),
                h('div', { class: 'actions' }, fabBtn, buyBtn),
                results),
            h('aside', { class: 'split-side' }, binPanel())));

        async function fabricate() {
            if (busy) return;
            busy = true;
            fabBtn.disabled = buyBtn.disabled = true;
            results.hidden = true;
            selected = null;
            sound.unlock();
            stats.record({ tries: 1 });
            wafersMade++;

            dies = SITES.map(s => makeDie(s));
            rects.forEach(r => { r.removeAttribute('style'); r.setAttribute('class', 'die'); });
            root.querySelectorAll('.legend-count').forEach(el => { el.textContent = '0'; });
            const counts = Object.fromEntries(BINS.map(b => [b.id, 0]));

            wafer.classList.remove('is-blank');
            wafer.classList.add('is-fresh');
            status.textContent = 'Lithography, etch, deposition… (≈3 months in real life)';
            await wait(900);
            wafer.classList.remove('is-fresh');

            status.textContent = 'Probe testing every die…';
            probe.classList.add('is-on');
            let done = 0;
            await tween(4200, ease.linear, (p, t) => {
                const target = Math.floor(t * dies.length);
                while (done < target) {
                    const d = dies[done];
                    rects[done].style.fill = d.bin.color;
                    rects[done].classList.add('is-tested', `b-${d.bin.id}`);
                    counts[d.bin.id]++;
                    done++;
                    if (alive && done % 3 === 0) sound.tone({ freq: 900 + d.ghz * 120, dur: 0.02, type: 'square', gain: 0.025 });
                }
                const cur = SITES[Math.min(done, SITES.length - 1)];
                probe.setAttribute('transform', `translate(${cur.x} ${cur.y})`);
                for (const b of BINS) root.querySelector(`[data-bin="${b.id}"]`).textContent = counts[b.id];
            });
            probe.classList.remove('is-on');

            const goldens = dies.filter(d => d.bin.id === 'se');
            goldens.forEach(d => rects[dies.indexOf(d)].classList.add('is-golden'));
            if (alive) sound.reveal(goldens.length ? 4 : 2);
            if (goldens.length) burst(wafer, ['#ffcf4a', '#fff', '#ffe9a8'], 50);
            status.textContent = `Wafer #${wafersMade} tested. Same design, ${new Set(dies.map(d => d.ghz)).size} different clock speeds.`;
            showResults(counts);

            busy = false;
            fabBtn.disabled = false;
            buyBtn.disabled = !dies.some(d => d.bin.id === 'x9');
        }

        function showResults(counts) {
            const revenue = dies.reduce((a, d) => a + d.bin.price, 0);
            const working = dies.length - counts.scrap;
            const max = Math.max(...Object.values(counts));
            const fastest = dies.reduce((a, d) => (d.ghz > a.ghz && !d.uncore ? d : a), dies[0]);
            const slowest = dies.filter(d => d.bin.id !== 'scrap').reduce((a, d) => (d.ghz < a.ghz ? d : a), fastest);
            results.hidden = false;
            results.replaceChildren(
                h('div', { class: 'sim-headline' },
                    'One design, one wafer: ', h('b', {}, `${BINS.filter(b => b.price && counts[b.id]).length} different products`),
                    ' worth ', h('b', {}, fmt.money(revenue)), '.'),
                h('div', { class: 'sim-figures' },
                    figure('Working dies (yield)', `${working} / ${dies.length} (${Math.round((working / dies.length) * 100)}%)`),
                    figure('Fastest die', `${fastest.ghz.toFixed(2)} GHz`, 'is-good'),
                    figure('Slowest sellable', `${slowest.ghz.toFixed(2)} GHz`),
                    figure('Wafer cost → revenue', `${fmt.money(WAFER_COST)} → ${fmt.money(revenue)}`)),
                h('div', { class: 'sim-bars' }, BINS.map(b => h('div', { class: 'sim-bar', style: `--rc:${b.color}` },
                    h('span', { class: 'sim-bar-label' }, b.name),
                    h('span', { class: 'sim-bar-track' },
                        h('span', { class: 'sim-bar-fill', style: `width:${Math.max(0.6, (counts[b.id] / max) * 100)}%` })),
                    h('span', { class: 'sim-bar-count' }, fmt.int(counts[b.id]))))));
        }

        function inspect(die, note) {
            if (selected != null) rects[selected].classList.remove('is-selected');
            selected = dies.indexOf(die);
            rects[selected].classList.add('is-selected');

            const coreMap = h('div', { class: 'core-map' },
                Array.from({ length: CORES }, (_, i) => h('span', { class: 'core' + (die.dead.has(i) ? ' is-dead' : '') }, `C${i}`)));
            if (die.uncore) coreMap.classList.add('is-uncore');

            inspector.replaceChildren(...[
                h('div', { class: 'inspector-head', style: `--rc:${die.bin.color}` },
                    h('span', { class: 'reveal-rarity' }, die.bin.tier),
                    h('h3', {}, die.bin.name)),
                note ? h('p', { class: 'inspector-note' }, note) : null,
                h('div', { class: 'inspector-grid' },
                    figure('Die', `R${die.site.row} · C${die.site.col}`),
                    figure('Max stable clock', die.bin.id === 'scrap' && die.uncore ? 'n/a' : `${die.ghz.toFixed(2)} GHz`),
                    figure('Working cores', `${die.cores} / ${CORES}`, die.cores < CORES ? 'is-bad' : ''),
                    figure('Distance from centre', `${Math.round(die.site.r * 100)}%`)),
                coreMap,
                h('p', { class: 'inspector-why' }, explain(die)),
            ].filter(Boolean));
        }

        function buyX9() {
            const x9 = dies.filter(d => d.bin.id === 'x9');
            if (!x9.length) return;
            const mine = x9[Math.floor(random() * x9.length)];
            const rank = x9.filter(d => d.ghz < mine.ghz).length / x9.length;
            const headroom = mine.ghz - 5.5;
            stats.record({ tries: 1, spent: binById.x9.price });
            inspect(mine, `You paid ${fmt.money(binById.x9.price)} for the same X9 as everyone else. Yours overclocks to ${mine.ghz.toFixed(2)} GHz (+${headroom.toFixed(2)} over spec), faster than ${Math.round(rank * 100)}% of the X9s on this wafer.`);
            rects[selected].classList.remove('is-pinged');
            void rects[selected].getBoundingClientRect();
            rects[selected].classList.add('is-pinged');
            sound.reveal(rank > 0.8 ? 4 : rank > 0.4 ? 2 : 0);
        }

        primaryAction = fabricate;
    }

    function explain(die) {
        if (die.uncore) return 'A defect hit the memory controller or cache. Nothing on this die can be salvaged.';
        if (die.bin.id === 'scrap') return `Too slow or too broken for any product. ${die.cores < CORES ? `${CORES - die.cores} cores are dead, ` : ''}it tops out at ${die.ghz.toFixed(2)} GHz.`;
        if (die.cores < CORES) return `${CORES - die.cores} core${CORES - die.cores > 1 ? 's were' : ' was'} hit by a defect. Instead of throwing it away, the broken cores are fused off and it's sold as a cheaper part.`;
        if (die.bin.id === 'x5' || die.bin.id === 'x3') return `All ${CORES} cores work, but at ${die.ghz.toFixed(2)} GHz it's too slow for a higher bin. Some perfectly good cores get fused off so it matches the cheaper product.`;
        if (die.bin.id === 'se') return 'A golden sample. Nothing was done differently; it just won the lottery at the atomic level.';
        if (die.site.r > 0.8) return 'Edge dies see more variation in film thickness and lithography focus, so they tend to be slower.';
        return 'Every core works. Its speed is set by tiny random variations in transistor dimensions and dopant atoms.';
    }

    function binPanel() {
        return h('section', { class: 'panel' },
            h('h3', { class: 'panel-title' }, 'What a die becomes'),
            h('table', { class: 'odds-table' },
                h('thead', {}, h('tr', {}, h('th', {}, 'Product'), h('th', {}, 'Price'), h('th', {}, 'Odds'))),
                h('tbody', {}, BINS.map(b => h('tr', {},
                    h('td', {}, h('span', { class: 'dot', style: `background:${b.color}` }), b.name),
                    h('td', { class: 'num' }, b.price ? fmt.money(b.price) : '-'),
                    h('td', { class: 'num' }, fmt.oneIn(BIN_RATES[b.id])))))),
            h('div', { class: 'panel-note' },
                h('p', {}, 'Chipmakers don\'t design five chips. They design ', h('b', {}, 'one'),
                    ', make thousands, test every die, and sell each one as whatever it turned out to be. This is called ',
                    h('b', {}, 'binning'), '.'),
                h('p', {}, 'Your X9 and your friend\'s X9 have the same name and price, but they can be hundreds of MHz apart. ',
                    'Overclockers call it the silicon lottery.'),
                h('p', {}, 'Bin names and prices are illustrative; real lineups like Core i9/i7/i5 or Ryzen 9/7/5 work the same way.')));
    }

    Lottery.register({
        id: 'silicon',
        name: 'Silicon Lottery',
        kicker: 'Lottery 07 · the one in your computer',
        tagline: 'Hundreds of identical chips, made side by side. Every one of them comes out different.',
        headline: { label: 'Chance of a golden die', p: BIN_RATES.se },
        mount,
        unmount() { alive = false; },
        primary: () => primaryAction?.(),
    });
})();
