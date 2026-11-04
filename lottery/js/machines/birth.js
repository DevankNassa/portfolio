'use strict';

(() => {
    const { h, pick, fmt, ease, sound, stats, wait, burst, params } = Lottery;

    // Births per year, approx. UN World Population Prospects 2024 (2023 estimates).
    // Life expectancy (UN WPP) and GDP per capita in USD (World Bank/IMF 2023), rounded.
    const WORLD_BIRTHS = 132e6;
    const WORLD = { life: 73.2, gdp: 13100 };

    const REGIONS = {
        asia:     { name: 'Asia',                   color: '#f5a742' },
        africa:   { name: 'Sub-Saharan Africa',     color: '#e2574c' },
        mena:     { name: 'Middle East & N. Africa', color: '#c77dff' },
        europe:   { name: 'Europe',                 color: '#5b8cff' },
        americas: { name: 'Americas',               color: '#4fd18b' },
        oceania:  { name: 'Oceania',                color: '#3fd0d4' },
        other:    { name: 'Everywhere else',        color: '#4a4f5e' },
    };

    // [name, births (millions/yr), life expectancy, GDP per capita, region]
    const RAW = [
        ['India', 23.0, 72, 2500, 'asia'],
        ['China', 9.0, 78, 12600, 'asia'],
        ['Nigeria', 7.9, 54, 1600, 'africa'],
        ['Pakistan', 6.4, 67, 1400, 'asia'],
        ['DR Congo', 4.6, 61, 650, 'africa'],
        ['Indonesia', 4.4, 71, 4900, 'asia'],
        ['Ethiopia', 4.0, 67, 1300, 'africa'],
        ['United States', 3.6, 79, 82000, 'americas'],
        ['Bangladesh', 2.9, 74, 2600, 'asia'],
        ['Brazil', 2.5, 76, 10000, 'americas'],
        ['Tanzania', 2.3, 67, 1200, 'africa'],
        ['Egypt', 2.2, 71, 3500, 'mena'],
        ['Philippines', 2.0, 70, 3800, 'asia'],
        ['Mexico', 1.8, 75, 13800, 'americas'],
        ['Uganda', 1.7, 63, 1000, 'africa'],
        ['Kenya', 1.5, 63, 2000, 'africa'],
        ['Sudan', 1.5, 66, 1000, 'africa'],
        ['Afghanistan', 1.4, 63, 400, 'asia'],
        ['Vietnam', 1.4, 74, 4300, 'asia'],
        ['Angola', 1.3, 62, 2300, 'africa'],
        ['Russia', 1.3, 73, 14000, 'europe'],
        ['Niger', 1.2, 63, 600, 'africa'],
        ['Mozambique', 1.2, 60, 600, 'africa'],
        ['Iraq', 1.1, 72, 5900, 'mena'],
        ['South Africa', 1.1, 62, 6000, 'africa'],
        ['Madagascar', 1.0, 65, 500, 'africa'],
        ['Iran', 1.0, 77, 4500, 'mena'],
        ['Turkey', 1.0, 78, 13000, 'mena'],
        ['Mali', 0.9, 60, 900, 'africa'],
        ['Myanmar', 0.9, 67, 1200, 'asia'],
        ['Cameroon', 0.9, 63, 1700, 'africa'],
        ['Côte d\'Ivoire', 0.9, 59, 2700, 'africa'],
        ['Yemen', 0.85, 64, 600, 'mena'],
        ['Chad', 0.8, 53, 700, 'africa'],
        ['Burkina Faso', 0.8, 60, 850, 'africa'],
        ['Ghana', 0.8, 64, 2200, 'africa'],
        ['Algeria', 0.8, 77, 5300, 'mena'],
        ['Japan', 0.73, 84, 34000, 'asia'],
        ['Uzbekistan', 0.95, 72, 2500, 'asia'],
        ['Malawi', 0.65, 63, 650, 'africa'],
        ['Zambia', 0.6, 62, 1300, 'africa'],
        ['Nepal', 0.55, 70, 1400, 'asia'],
        ['Senegal', 0.55, 68, 1700, 'africa'],
        ['Guinea', 0.5, 59, 1500, 'africa'],
        ['Syria', 0.45, 72, 1100, 'mena'],
        ['Benin', 0.45, 60, 1400, 'africa'],
        ['Burundi', 0.45, 62, 200, 'africa'],
        ['Zimbabwe', 0.45, 62, 2000, 'africa'],
        ['Peru', 0.45, 77, 7800, 'americas'],
        ['Malaysia', 0.42, 76, 11600, 'asia'],
        ['Guatemala', 0.4, 72, 5800, 'americas'],
        ['Kazakhstan', 0.39, 74, 13000, 'asia'],
        ['Rwanda', 0.38, 67, 1000, 'africa'],
        ['Poland', 0.27, 78, 22000, 'europe'],
        ['Haiti', 0.27, 64, 1700, 'americas'],
        ['Sri Lanka', 0.25, 77, 3800, 'asia'],
        ['Ecuador', 0.25, 77, 6500, 'americas'],
        ['Papua New Guinea', 0.25, 66, 3000, 'oceania'],
        ['Dominican Republic', 0.2, 74, 10700, 'americas'],
        ['Jordan', 0.2, 77, 4400, 'mena'],
        ['Israel', 0.18, 83, 52000, 'mena'],
        ['Chile', 0.17, 81, 17000, 'americas'],
        ['Tunisia', 0.15, 76, 3900, 'mena'],
        ['Taiwan', 0.135, 81, 33000, 'asia'],
        ['United Arab Emirates', 0.1, 79, 50000, 'mena'],
        ['Somalia', 0.7, 56, 600, 'africa'],
        ['Germany', 0.69, 81, 53000, 'europe'],
        ['United Kingdom', 0.68, 81, 49000, 'europe'],
        ['France', 0.68, 83, 46000, 'europe'],
        ['Morocco', 0.65, 75, 3700, 'mena'],
        ['Saudi Arabia', 0.6, 78, 33000, 'mena'],
        ['Thailand', 0.52, 79, 7200, 'asia'],
        ['Colombia', 0.51, 77, 7000, 'americas'],
        ['Argentina', 0.46, 77, 13700, 'americas'],
        ['Italy', 0.38, 83, 39000, 'europe'],
        ['Canada', 0.35, 82, 53000, 'americas'],
        ['Spain', 0.32, 83, 33000, 'europe'],
        ['Australia', 0.29, 83, 65000, 'oceania'],
        ['South Korea', 0.23, 84, 33000, 'asia'],
        ['Netherlands', 0.16, 82, 62000, 'europe'],
        ['Sweden', 0.1, 83, 56000, 'europe'],
        ['Switzerland', 0.08, 84, 100000, 'europe'],
        ['Norway', 0.051, 83, 87000, 'europe'],
        ['New Zealand', 0.058, 82, 48000, 'oceania'],
        ['Singapore', 0.033, 84, 85000, 'asia'],
        ['Luxembourg', 0.006, 82, 128000, 'europe'],
        ['Iceland', 0.0045, 83, 78000, 'europe'],
    ];

    const COUNTRIES = RAW.map(([name, m, life, gdp, region]) => ({
        name, births: m * 1e6, life, gdp, region, p: (m * 1e6) / WORLD_BIRTHS,
    }));
    const listed = COUNTRIES.reduce((a, c) => a + c.births, 0);
    const ELSEWHERE = {
        name: 'one of ~110 other countries',
        births: WORLD_BIRTHS - listed,
        region: 'other',
        p: (WORLD_BIRTHS - listed) / WORLD_BIRTHS,
        elsewhere: true,
    };
    const ALL = [...COUNTRIES, ELSEWHERE];

    // Natural Earth spells a few names differently, and some shapes have a
    // misleading centroid (overseas territories) or are too small to draw.
    const ATLAS_NAME = {
        'DR Congo': 'Dem. Rep. Congo',
        'United States': 'United States of America',
        'Dominican Republic': 'Dominican Rep.',
    };
    const CENTER = {
        'United States': [-98, 39],
        France: [2.5, 46.5],
        Norway: [10, 62],
        Russia: [90, 60],
        Singapore: [103.8, 1.35],
    };

    const RICH_GDP = 30000;
    const RICH_P = COUNTRIES.filter(c => c.gdp >= RICH_GDP).reduce((a, c) => a + c.p, 0);

    // Share of the world's babies (listed countries) born somewhere poorer than `gdp`.
    const richerThan = gdp => COUNTRIES.filter(c => c.gdp < gdp).reduce((a, c) => a + c.births, 0) / listed;

    // Waffle: 1,000 dots, each ~132,000 babies. Largest-remainder allocation.
    const DOTS = 1000;
    const PER_DOT = WORLD_BIRTHS / DOTS;
    const DOT_OWNERS = (() => {
        const shares = ALL.map(c => ({ c, exact: c.p * DOTS }));
        shares.forEach(s => { s.n = Math.floor(s.exact); });
        let left = DOTS - shares.reduce((a, s) => a + s.n, 0);
        [...shares].sort((a, b) => (b.exact - b.n) - (a.exact - a.n)).forEach(s => { if (left > 0) { s.n++; left--; } });
        // Keep "everywhere else" at the end of the grid.
        const ordered = [...shares.filter(s => !s.c.elsewhere).sort((a, b) => b.c.births - a.c.births), shares.find(s => s.c.elsewhere)];
        return ordered.flatMap(s => Array(s.n).fill(s.c));
    })();

    let alive = false;
    let primaryAction = null;

    function mount(root) {
        alive = true;
        let busy = false;
        let lives = 0;

        const dots = DOT_OWNERS.map((c, i) => h('span', {
            class: 'bdot', style: `--rc:${REGIONS[c.region].color}`, title: c.elsewhere ? 'Everywhere else' : c.name, 'data-i': i,
        }));
        const grid = h('div', { class: 'birth-grid' }, dots);
        const globeCanvas = h('canvas', { class: 'globe', 'aria-label': 'Globe' });
        const resultBody = h('div', { class: 'birth-result-body' },
            h('div', { class: 'birth-result-empty' },
                h('p', {}, 'Every dot is about ', h('b', {}, fmt.int(PER_DOT)), ' babies born this year.'),
                h('p', {}, 'You didn\'t pick one. Neither did anyone else.')));
        const result = h('div', { class: 'birth-result' }, h('div', { class: 'globe-wrap' }, globeCanvas), resultBody);
        const bornBtn = h('button', { class: 'btn btn-primary', type: 'button', onclick: beBorn }, 'Be born');
        const counter = h('span', { class: 'birth-counter' });

        root.append(h('div', { class: 'split' },
            h('div', { class: 'split-main' },
                h('div', { class: 'birth-stage' },
                    result,
                    h('div', { class: 'birth-grid-wrap' },
                        grid,
                        h('div', { class: 'legend legend-inline' }, Object.values(REGIONS).map(r =>
                            h('div', { class: 'legend-row' }, h('span', { class: 'dot', style: `background:${r.color}` }), h('span', {}, r.name)))))),
                h('div', { class: 'actions' }, bornBtn, counter)),
            h('aside', { class: 'split-side' }, oddsPanel())));

        const globe = makeGlobe(globeCanvas);

        async function beBorn() {
            if (busy) return;
            busy = true;
            bornBtn.disabled = true;
            sound.unlock();
            stats.record({ tries: 1 });
            grid.classList.remove('has-pick');
            dots.forEach(d => d.classList.remove('is-mine', 'is-country', 'is-scan'));

            const forced = (params.get('force') || '').toLowerCase();
            const country = COUNTRIES.find(c => c.name.toLowerCase() === forced) || pick(ALL, c => c.p);
            const owner = dotOwner(country);
            const ownDots = dots.filter((_, i) => DOT_OWNERS[i] === owner);
            const landing = ownDots[Math.floor(Math.random() * ownDots.length)];

            // Roulette-style scan: fast random hops that slow to a stop,
            // while the globe spins down onto the same country.
            const HOPS = 34;
            const delays = Array.from({ length: HOPS }, (_, i) => 25 + Math.pow(i / HOPS, 3) * 420);
            const spun = globe?.spinTo(country, delays.reduce((a, d) => a + d, 0));
            let prev = null;
            for (let i = 0; i < HOPS; i++) {
                const dot = i === HOPS - 1 ? landing : dots[Math.floor(Math.random() * dots.length)];
                prev?.classList.remove('is-scan');
                dot.classList.add('is-scan');
                prev = dot;
                if (alive) sound.tone({ freq: 500 + i * 22, dur: 0.04, type: 'triangle', gain: 0.08 });
                await wait(delays[i]);
            }
            await spun;
            landing.classList.remove('is-scan');
            landing.classList.add('is-mine');
            grid.classList.add('has-pick');
            ownDots.forEach(d => d.classList.add('is-country'));
            if (alive) sound.reveal(country.p < 0.005 ? 4 : 2);

            lives++;
            counter.textContent = `Lives lived: ${lives}`;
            showResult(country);
            busy = false;
            bornBtn.disabled = false;
            bornBtn.textContent = 'Be born again';
        }

        function showResult(c) {
            const region = REGIONS[c.region];
            if (c.elsewhere) {
                resultBody.replaceChildren(h('div', { class: 'birth-card', style: `--rc:${region.color}` }, h('div', { class: 'birth-main' },
                    h('span', { class: 'reveal-rarity' }, 'You were born in'),
                    h('h2', {}, 'One of ~110 smaller countries'),
                    h('p', { class: 'birth-odds' }, `${fmt.oneIn(c.p)} babies land somewhere not on this list.`),
                    h('p', { class: 'birth-note' }, 'Each of these countries accounts for well under 0.5% of the world\'s births. Together they add up.'))));
                return;
            }
            const pct = richerThan(c.gdp);
            const tiny = dotOwner(c) === ELSEWHERE;
            const card = h('div', { class: 'birth-card', style: `--rc:${region.color}` },
                h('div', { class: 'birth-main' },
                    h('span', { class: 'reveal-rarity' }, `You were born in · ${region.name}`),
                    h('h2', {}, c.name),
                    h('p', { class: 'birth-odds' }, `${fmt.oneIn(c.p)} babies born this year (${fmt.pct(c.p)})`),
                    tiny ? h('p', { class: 'birth-note' },
                        `So rare it doesn't even get its own dot: about ${fmt.int(c.births)} babies a year, out of ${fmt.int(WORLD_BIRTHS)}.`) : null,
                    h('div', { class: 'birth-verdict' },
                        'Born richer than ', h('b', {}, `${Math.floor(pct * 100)}%`), ' of the world\'s babies.')),
                h('div', { class: 'birth-bars' },
                    compareBar('Life expectancy', c.life, WORLD.life, 90, v => `${v} yrs`),
                    compareBar('GDP per person', c.gdp, WORLD.gdp, 130000, v => fmt.money(v).replace('.00', ''), true)));
            resultBody.replaceChildren(card);
            if (c.gdp >= RICH_GDP) burst(card, [region.color, '#fff', '#ffd38a'], 50);
        }

        primaryAction = beBorn;
    }

    // ---------- Globe (d3-geo orthographic on canvas) ----------
    // Draws every frame while the canvas is on the page; stops by itself once
    // the machine is unmounted. Returns null if the map libraries didn't load,
    // in which case the dot grid still works on its own.
    function makeGlobe(canvas) {
        const { d3, topojson, WORLD_TOPO: topo } = window;
        if (!d3?.geoOrthographic || !topojson || !topo) return null;

        const features = topojson.feature(topo, topo.objects.countries).features;
        const borders = topojson.mesh(topo, topo.objects.countries, (a, b) => a !== b);
        const byName = new Map(features.map(f => [f.properties.name, f]));
        const listed = new Map(COUNTRIES.map(c => [ATLAS_NAME[c.name] || c.name, c]));
        for (const f of features) {
            const c = listed.get(f.properties.name);
            f.fill = c ? `${REGIONS[c.region].color}55` : `${REGIONS.other.color}aa`;
            f.listed = !!c;
        }

        const ctx = canvas.getContext('2d');
        const projection = d3.geoOrthographic().precision(0.6);
        const path = d3.geoPath(projection, ctx);
        const graticule = d3.geoGraticule10();
        const SPHERE = { type: 'Sphere' };

        let rot = [-20, -20];
        let spin = null;
        let lit = [];
        let litColor = '#fff';
        let marker = null;
        let size = 0;

        function resize() {
            const dpr = window.devicePixelRatio || 1;
            size = canvas.clientWidth;
            canvas.width = size * dpr;
            canvas.height = size * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            projection.translate([size / 2, size / 2]).scale(size / 2 - 6);
        }

        function draw(now) {
            const w = size;
            projection.rotate(rot);
            ctx.clearRect(0, 0, w, w);

            const glow = ctx.createRadialGradient(w / 2, w / 2, w * 0.44, w / 2, w / 2, w * 0.5);
            glow.addColorStop(0, 'rgba(90,140,255,0.28)');
            glow.addColorStop(1, 'rgba(90,140,255,0)');
            ctx.fillStyle = glow;
            ctx.fillRect(0, 0, w, w);

            const ocean = ctx.createRadialGradient(w * 0.38, w * 0.35, w * 0.05, w / 2, w / 2, w * 0.48);
            ocean.addColorStop(0, '#18264a');
            ocean.addColorStop(1, '#060a14');
            ctx.beginPath();
            path(SPHERE);
            ctx.fillStyle = ocean;
            ctx.fill();

            ctx.beginPath();
            path(graticule);
            ctx.strokeStyle = 'rgba(255,255,255,0.06)';
            ctx.lineWidth = 0.6;
            ctx.stroke();

            for (const f of features) {
                ctx.beginPath();
                path(f);
                ctx.fillStyle = f.fill;
                ctx.fill();
            }
            ctx.beginPath();
            path(borders);
            ctx.strokeStyle = 'rgba(6,10,20,0.8)';
            ctx.lineWidth = 0.5;
            ctx.stroke();

            if (lit.length) {
                ctx.beginPath();
                lit.forEach(f => path(f));
                ctx.globalAlpha = 0.8 + 0.2 * Math.sin(now / 260);
                ctx.fillStyle = litColor;
                ctx.fill();
                ctx.globalAlpha = 1;
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1.2;
                ctx.stroke();
            }

            if (marker && d3.geoDistance(marker, [-rot[0], -rot[1]]) < Math.PI / 2 - 0.05) {
                const [x, y] = projection(marker);
                const phase = (now / 900) % 1;
                ctx.beginPath();
                ctx.arc(x, y, 4 + phase * 22, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(255,255,255,${1 - phase})`;
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(x, y, 4, 0, Math.PI * 2);
                ctx.fillStyle = '#fff';
                ctx.fill();
            }

            // soft lighting so it reads as a sphere, not a disc
            const shade = ctx.createRadialGradient(w * 0.35, w * 0.3, w * 0.08, w / 2, w / 2, w * 0.5);
            shade.addColorStop(0, 'rgba(255,255,255,0.07)');
            shade.addColorStop(0.65, 'rgba(0,0,0,0)');
            shade.addColorStop(1, 'rgba(0,0,0,0.5)');
            ctx.beginPath();
            path(SPHERE);
            ctx.fillStyle = shade;
            ctx.fill();
            ctx.strokeStyle = 'rgba(160,190,255,0.35)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        function frame(now) {
            if (!canvas.isConnected) return;
            if (canvas.clientWidth && canvas.clientWidth !== size) resize();
            if (spin) {
                const t = Math.min(1, (now - spin.t0) / spin.dur);
                const e = ease.outCubic(t);
                rot = [spin.from[0] + (spin.to[0] - spin.from[0]) * e, spin.from[1] + (spin.to[1] - spin.from[1]) * e];
                if (t >= 1) {
                    rot[0] %= 360;
                    const done = spin.done;
                    spin = null;
                    done();
                }
            } else if (!marker && !lit.length) {
                rot[0] += 0.08; // idle drift
            }
            if (size) draw(now);
            requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);

        return {
            // Spin at least two full turns, then settle centred on the country.
            spinTo(country, dur) {
                let feats;
                let center;
                if (country.elsewhere) {
                    feats = features.filter(f => !f.listed);
                    center = d3.geoCentroid(feats[Math.floor(Math.random() * feats.length)]);
                } else {
                    const f = byName.get(ATLAS_NAME[country.name] || country.name);
                    feats = f ? [f] : [];
                    center = CENTER[country.name] || d3.geoCentroid(f);
                }
                lit = [];
                marker = null;
                const from = rot.slice();
                const forward = (((-center[0] - from[0]) % 360) + 360) % 360;
                const to = [from[0] + forward + 720, Math.max(-60, Math.min(60, -center[1]))];
                return new Promise(resolve => {
                    spin = {
                        from, to, dur, t0: performance.now(),
                        done: () => {
                            lit = feats;
                            litColor = REGIONS[country.region].color;
                            marker = country.elsewhere ? null : center;
                            resolve();
                        },
                    };
                });
            },
        };
    }

    // Countries too small for a dot share the "everywhere else" block.
    function dotOwner(c) {
        return DOT_OWNERS.includes(c) ? c : ELSEWHERE;
    }

    function compareBar(label, value, world, max, format, log = false) {
        const scale = v => log ? Math.log10(Math.max(v, 100)) / Math.log10(max) * 100 : (v / max) * 100;
        return h('div', { class: 'cmp' },
            h('div', { class: 'cmp-head' }, h('span', {}, label), h('b', {}, format(value))),
            h('div', { class: 'cmp-track' },
                h('span', { class: 'cmp-fill', style: `width:${scale(value)}%` }),
                h('span', { class: 'cmp-world', style: `left:${scale(world)}%`, title: `World: ${format(world)}` })),
            h('div', { class: 'cmp-foot' }, `World average ${format(world)}`));
    }

    function oddsPanel() {
        const top = COUNTRIES.slice().sort((a, b) => b.p - a.p).slice(0, 8);
        const rare = ['Japan', 'United Kingdom', 'Switzerland', 'Iceland'].map(n => COUNTRIES.find(c => c.name === n));
        const row = c => h('tr', {},
            h('td', {}, h('span', { class: 'dot', style: `background:${REGIONS[c.region].color}` }), c.name),
            h('td', { class: 'num' }, fmt.pct(c.p)),
            h('td', { class: 'num' }, fmt.oneIn(c.p)));
        return h('section', { class: 'panel' },
            h('h3', { class: 'panel-title' }, 'Where babies are born'),
            h('table', { class: 'odds-table' },
                h('thead', {}, h('tr', {}, h('th', {}, 'Country'), h('th', {}, 'Chance'), h('th', {}, 'Odds'))),
                h('tbody', {}, top.map(row), h('tr', { class: 'odds-gap' }, h('td', { colspan: 3 }, '…')), rare.map(row))),
            h('div', { class: 'panel-note' },
                h('p', {}, 'Odds of being born in a country with GDP over $30k per person: ',
                    h('b', {}, fmt.oneIn(RICH_P)), '.'),
                h('p', {}, 'Weighted by births per year, not population, so this is the lottery a newborn actually plays today.'),
                h('p', {}, 'Data: UN World Population Prospects 2024, World Bank. Figures rounded.')));
    }

    Lottery.register({
        id: 'birth',
        name: 'Birth Lottery',
        kicker: 'Lottery 03 · where you start',
        tagline: 'The first lottery you ever played, and you didn\'t even buy a ticket.',
        headline: { label: 'Born in a rich country', p: RICH_P },
        mount,
        unmount() { alive = false; },
        primary: () => primaryAction?.(),
    });
})();
