'use strict';

(() => {
    const { h, figure, pick, random, range, fmt, sound, stats, tween, ease, wait, burst, params } = Lottery;

    const CASE_COST = 3.49; // $2.49 key + ~$1.00 for the case itself

    // Real CS2 weapon case drop rates.
    const RARITIES = [
        { id: 'milspec',    name: 'Mil-Spec',          color: '#4b69ff', p: 0.7992, price: [0.05, 0.6] },
        { id: 'restricted', name: 'Restricted',        color: '#8847ff', p: 0.1598, price: [0.8, 4] },
        { id: 'classified', name: 'Classified',        color: '#d32ce6', p: 0.0320, price: [5, 25] },
        { id: 'covert',     name: 'Covert',            color: '#eb4b4b', p: 0.0064, price: [25, 90] },
        { id: 'gold',       name: 'Rare Special Item', color: '#e4ae39', p: 0.0026, price: [120, 500] },
    ];

    const WEARS = [
        { name: 'Factory New',    min: 0.00, max: 0.07, weight: 3,  mult: 1.6 },
        { name: 'Minimal Wear',   min: 0.07, max: 0.15, weight: 24, mult: 1.25 },
        { name: 'Field-Tested',   min: 0.15, max: 0.38, weight: 33, mult: 1 },
        { name: 'Well-Worn',      min: 0.38, max: 0.45, weight: 24, mult: 0.85 },
        { name: 'Battle-Scarred', min: 0.45, max: 1.00, weight: 16, mult: 0.7 },
    ];

    const STATTRAK_CHANCE = 0.1;
    const STATTRAK_MULT = 1.8;

    // Weapon silhouettes, viewBox 0 0 120 48.
    const SHAPES = {
        rifle:  'M2 21 L24 17 V29 L6 35 Z M24 15 H80 V27 H24 Z M80 18.5 H117 V22.5 H80 Z M38 11 H62 V15 H38 Z M50 27 H60 L57 43 L47 41 Z M30 27 H38 L35 39 H27 Z',
        pistol: 'M28 14 H94 V25 H28 Z M94 17 H100 V22 H94 Z M32 25 H52 L47 44 H30 Z M52 25 H60 Q60 33 52 33 Z',
        smg:    'M4 17 H20 V21 H10 V28 H4 Z M20 15 H82 V28 H20 Z M82 18.5 H104 V23.5 H82 Z M54 28 H63 V46 H54 Z M28 28 H37 L34 40 H25 Z M40 11 H56 V15 H40 Z',
        sniper: 'M2 23 L26 18 V30 L4 36 Z M26 18 H72 V27 H26 Z M72 20 H118 V23.5 H72 Z M34 9 H66 V15 H34 Z M42 15 H46 V18 H42 Z M54 15 H58 V18 H54 Z M36 27 H45 L42 38 H33 Z',
        knife:  'M10 21 Q6 26 10 31 H46 V21 Z M46 15 H52 V37 H46 Z M52 21 L114 17 Q108 30 52 31 Z',
    };

    // Original, silicon-themed skins (no game assets).
    const SKINS = [
        { rarity: 'milspec', weapon: 'MP9',          name: 'Night Shift',      shape: 'smg',    colors: ['#2c3a57', '#8aa0c8'] },
        { rarity: 'milspec', weapon: 'Glock-18',     name: 'Sandpaper',        shape: 'pistol', colors: ['#7d6a45', '#d8c79a'] },
        { rarity: 'milspec', weapon: 'SG 553',       name: 'Moss Grid',        shape: 'rifle',  colors: ['#2f4a2e', '#8fae6b'] },
        { rarity: 'milspec', weapon: 'P250',         name: 'Cinder',           shape: 'pistol', colors: ['#3a201a', '#c0603a'] },
        { rarity: 'milspec', weapon: 'UMP-45',       name: 'Tidepool',         shape: 'smg',    colors: ['#173c4a', '#5fb3c3'] },
        { rarity: 'restricted', weapon: 'M4A1',      name: 'Violet Static',    shape: 'rifle',  colors: ['#2a1550', '#a47bff'] },
        { rarity: 'restricted', weapon: 'Desert Eagle', name: 'Ember Line',    shape: 'pistol', colors: ['#4a1508', '#ff8a3d'] },
        { rarity: 'restricted', weapon: 'AWP',       name: 'Frostbite',        shape: 'sniper', colors: ['#5a8ccf', '#e6f3ff'] },
        { rarity: 'restricted', weapon: 'P90',       name: 'Neon Arcade',      shape: 'smg',    colors: ['#00c2a8', '#ff3cf0'] },
        { rarity: 'classified', weapon: 'AK-47',     name: 'Solder Mask',      shape: 'rifle',  colors: ['#063d27', '#3dffa0'] },
        { rarity: 'classified', weapon: 'USP-S',     name: 'Die Shot',         shape: 'pistol', colors: ['#20123a', '#ff4fd8'] },
        { rarity: 'classified', weapon: 'SSG 08',    name: 'Wafer',            shape: 'sniper', colors: ['#6a6f85', '#e0e4ff'] },
        { rarity: 'covert', weapon: 'AWP',           name: 'Golden Sample',    shape: 'sniper', colors: ['#7a0b0b', '#ffcf4a'] },
        { rarity: 'covert', weapon: 'AK-47',         name: 'Thermal Throttle', shape: 'rifle',  colors: ['#ff3c00', '#ffd000'] },
        { rarity: 'gold', weapon: '★ Karambit',      name: 'Overclock',        shape: 'knife',  colors: ['#1a0a3a', '#ff4fd8'] },
        { rarity: 'gold', weapon: '★ Butterfly Knife', name: 'Binned Gold',    shape: 'knife',  colors: ['#ffde59', '#ff7ad9'] },
        { rarity: 'gold', weapon: '★ Bayonet',       name: 'Silicon Fade',     shape: 'knife',  colors: ['#2a2a2a', '#e4ae39'] },
    ].map((s, idx) => ({ ...s, idx }));

    const rarityById = Object.fromEntries(RARITIES.map(r => [r.id, r]));

    // Average value returned per case, computed from the tables above.
    const EXPECTED_VALUE = (() => {
        const wearTotal = WEARS.reduce((a, w) => a + w.weight, 0);
        const wearMult = WEARS.reduce((a, w) => a + (w.weight / wearTotal) * w.mult, 0);
        const stMult = 1 + STATTRAK_CHANCE * (STATTRAK_MULT - 1);
        return RARITIES.reduce((a, r) => a + r.p * ((r.price[0] + r.price[1]) / 2), 0) * wearMult * stMult;
    })();

    function rollItem(forcedRarity) {
        const rarity = rarityById[forcedRarity] || pick(RARITIES, r => r.p);
        const pool = SKINS.filter(s => s.rarity === rarity.id);
        const skin = pool[Math.floor(random() * pool.length)];
        const wear = pick(WEARS);
        const float = range(wear.min, wear.max);
        const statTrak = random() < STATTRAK_CHANCE;
        const price = range(...rarity.price) * wear.mult * (statTrak ? STATTRAK_MULT : 1);
        return { rarity, skin, wear, float, statTrak, price };
    }

    const fullName = item => `${item.statTrak ? 'StatTrak™ ' : ''}${item.skin.weapon} | ${item.skin.name}`;

    // ---------- Art ----------
    function ensureDefs() {
        if (document.getElementById('skin-defs')) return;
        const grads = SKINS.map(s =>
            `<linearGradient id="sk${s.idx}" x1="0" y1="0" x2="1" y2="1">` +
            `<stop offset="0" stop-color="${s.colors[0]}"/><stop offset="1" stop-color="${s.colors[1]}"/>` +
            `</linearGradient>`).join('');
        document.body.insertAdjacentHTML('beforeend',
            `<svg id="skin-defs" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${grads}` +
            `<linearGradient id="sk-shine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".35"/>` +
            `<stop offset=".45" stop-color="#fff" stop-opacity="0"/></linearGradient></defs></svg>`);
    }

    const skinSVG = skin =>
        `<svg viewBox="0 0 120 48" class="skin-art" aria-hidden="true">` +
        `<path d="${SHAPES[skin.shape]}" fill="url(#sk${skin.idx})" stroke="rgba(0,0,0,.6)" stroke-width="1"/>` +
        `<path d="${SHAPES[skin.shape]}" fill="url(#sk-shine)"/></svg>`;

    function caseSVG() {
        let pins = '';
        for (let i = 0; i < 4; i++) {
            const o = 4 + i * 7;
            pins += `<rect x="${o}" y="-4" width="3" height="4"/><rect x="${o}" y="32" width="3" height="4"/>` +
                    `<rect x="-4" y="${o}" width="4" height="3"/><rect x="32" y="${o}" width="4" height="3"/>`;
        }
        return `<svg viewBox="0 0 120 84" class="case-art" aria-hidden="true">
            <defs>
                <linearGradient id="case-body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b4252"/><stop offset="1" stop-color="#171b24"/></linearGradient>
                <linearGradient id="case-chip" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd38a"/><stop offset="1" stop-color="#d9801a"/></linearGradient>
            </defs>
            <rect x="48" y="6" width="24" height="10" rx="3" fill="#5b6477"/>
            <rect x="6" y="14" width="108" height="64" rx="8" fill="url(#case-body)" stroke="#5b6477"/>
            <rect x="6" y="14" width="108" height="15" rx="7" fill="#48506a"/>
            <rect x="14" y="40" width="10" height="26" rx="2" fill="#262c3a"/>
            <rect x="96" y="40" width="10" height="26" rx="2" fill="#262c3a"/>
            <g transform="translate(44 38)">
                <g fill="#c98a2e">${pins}</g>
                <rect width="32" height="32" rx="4" fill="url(#case-chip)"/>
                <rect x="9" y="9" width="14" height="14" rx="2" fill="#2a1a05" opacity=".85"/>
            </g>
        </svg>`;
    }

    function card(item, { hideGold = true } = {}) {
        const el = h('div', { class: `card r-${item.rarity.id}`, style: `--rc:${item.rarity.color}` });
        if (item.rarity.id === 'gold' && hideGold) {
            el.innerHTML = `<div class="card-art gold-star">★</div>` +
                `<div class="card-meta"><span class="w">Rare Special Item</span><span class="n">★ ? ? ? ★</span></div>`;
        } else {
            el.innerHTML = `<div class="card-art">${skinSVG(item.skin)}</div>` +
                `<div class="card-meta"><span class="w">${item.statTrak ? 'StatTrak™ ' : ''}${item.skin.weapon}</span>` +
                `<span class="n">${item.skin.name}</span></div>`;
        }
        return el;
    }

    // ---------- Machine ----------
    let alive = false;
    let primaryAction = null;

    function mount(root) {
        alive = true;
        ensureDefs();

        const session = { opened: 0, sinceGold: 0 };
        let busy = false;

        const caseArt = h('div', { class: 'case-art-wrap', html: caseSVG() });
        const counter = h('div', { class: 'case-counter' });
        const track = h('div', { class: 'roller-track' });
        const roller = h('div', { class: 'roller' },
            track,
            h('div', { class: 'roller-fade' }),
            h('div', { class: 'roller-marker' }));
        const openBtn = h('button', { class: 'btn btn-primary', type: 'button', onclick: open },
            `Unlock container · ${fmt.money(CASE_COST)}`);
        const simBtn = h('button', { class: 'btn', type: 'button', onclick: simulateUntilGold },
            'Open until I get a knife');
        const sim = h('div', { class: 'sim', hidden: true });
        const inventory = h('div', { class: 'inventory' },
            h('div', { class: 'inventory-empty' }, 'Your unboxed items will show up here.'));
        const stageBox = h('div', { class: 'case-stage' });

        stageBox.append(
            h('div', { class: 'case-top' },
                caseArt,
                h('div', { class: 'case-info' },
                    h('h2', {}, 'Silicon Case'),
                    h('p', {}, '17 original finishes. One in every 385 cases holds a knife.'),
                    counter)),
            roller,
            h('div', { class: 'actions' }, openBtn, simBtn),
            sim);

        root.append(h('div', { class: 'split' },
            h('div', { class: 'split-main' },
                stageBox,
                h('section', { class: 'panel' },
                    h('h3', { class: 'panel-title' }, 'Inventory'),
                    inventory)),
            h('aside', { class: 'split-side' }, oddsPanel())));

        renderIdleTrack();
        updateCounter();

        function updateCounter() {
            counter.innerHTML = `<span>Opened <b>${fmt.int(session.opened)}</b></span>` +
                `<span>Since last ★ <b>${fmt.int(session.sinceGold)}</b></span>`;
        }

        function renderIdleTrack() {
            track.replaceChildren(...Array.from({ length: 12 }, () => card(rollItem())));
            track.style.transform = 'translate3d(0,0,0)';
        }

        function addToInventory(item) {
            inventory.querySelector('.inventory-empty')?.remove();
            const el = card(item, { hideGold: false });
            el.title = `${fullName(item)} (${item.wear.name}) ${fmt.money(item.price)}`;
            inventory.prepend(el);
            while (inventory.children.length > 40) inventory.lastChild.remove();
        }

        function note(item) {
            session.opened++;
            session.sinceGold = item.rarity.id === 'gold' ? 0 : session.sinceGold + 1;
            updateCounter();
        }

        async function open() {
            if (busy) return;
            busy = true;
            openBtn.disabled = simBtn.disabled = true;
            sim.hidden = true;
            sound.unlock();
            stageBox.querySelector('.reveal')?.remove();

            stats.record({ tries: 1, spent: CASE_COST });
            const winner = rollItem(params.get('force'));

            // Shake the case before the roll, like the real thing.
            caseArt.classList.add('is-shaking');
            sound.shake();
            await wait(520);
            caseArt.classList.remove('is-shaking');

            const COUNT = 64;
            const WIN_AT = 54;
            track.style.transform = 'translate3d(0,0,0)';
            track.replaceChildren(...Array.from({ length: COUNT }, (_, i) => card(i === WIN_AT ? winner : rollItem())));

            const first = track.children[0];
            const step = track.children[1].offsetLeft - first.offsetLeft;
            const cardW = first.offsetWidth;
            const view = roller.clientWidth;
            // Land somewhere inside the winning card, not always dead centre.
            const jitter = (Math.random() - 0.5) * cardW * 0.85;
            const target = WIN_AT * step + cardW / 2 + jitter - view / 2;

            let lastIdx = Math.floor((view / 2) / step);
            await tween(6800, ease.outQuint, p => {
                const x = target * p;
                track.style.transform = `translate3d(${-x}px,0,0)`;
                const idx = Math.floor((x + view / 2) / step);
                if (idx !== lastIdx) {
                    lastIdx = idx;
                    if (alive) sound.tick();
                }
            });

            const winEl = track.children[WIN_AT];
            winEl.classList.add('is-won');
            const level = RARITIES.indexOf(winner.rarity);
            if (alive) sound.reveal(level);
            await wait(650);

            stats.record({ won: winner.price });
            note(winner);
            addToInventory(winner);
            showReveal(winner);

            busy = false;
            openBtn.disabled = simBtn.disabled = false;
        }

        function showReveal(item) {
            const rarity = item.rarity;
            const reveal = h('div', { class: `reveal r-${rarity.id}`, style: `--rc:${rarity.color}` },
                h('div', { class: 'reveal-rays' }),
                h('div', { class: 'reveal-card' },
                    h('div', { class: 'reveal-art', html: skinSVG(item.skin) }),
                    h('div', { class: 'reveal-rarity' }, rarity.name),
                    h('h3', {}, fullName(item)),
                    h('div', { class: 'reveal-meta' },
                        `${item.wear.name} · Float ${item.float.toFixed(4)} · ${fmt.money(item.price)}`),
                    h('div', { class: 'reveal-odds' },
                        `A ${fmt.oneIn(rarity.p)} pull (${fmt.pct(rarity.p)})`),
                    h('button', { class: 'btn btn-primary', type: 'button', onclick: () => reveal.remove() }, 'Continue')));
            stageBox.append(reveal);
            if (rarity.id === 'gold' || rarity.id === 'covert') {
                burst(reveal, [rarity.color, '#fff', '#ffd38a']);
            }
        }

        function simulateUntilGold() {
            if (busy) return;
            stageBox.querySelector('.reveal')?.remove();
            const counts = Object.fromEntries(RARITIES.map(r => [r.id, 0]));
            let n = 0;
            let value = 0;
            let item;
            do {
                item = rollItem();
                n++;
                value += item.price;
                counts[item.rarity.id]++;
            } while (item.rarity.id !== 'gold' && n < 100000);

            const spent = n * CASE_COST;
            stats.record({ tries: n, spent, won: value });
            session.opened += n;
            session.sinceGold = 0;
            updateCounter();
            addToInventory(item);

            const max = Math.max(...Object.values(counts));
            sim.hidden = false;
            sim.replaceChildren(
                h('div', { class: 'sim-headline' },
                    'It took ', h('b', {}, fmt.int(n)), ' cases to unbox ',
                    h('span', { style: `color:${rarityById.gold.color}` }, fullName(item)), '.'),
                h('div', { class: 'sim-figures' },
                    figure('Spent', fmt.money(spent)),
                    figure('Total value unboxed', fmt.money(value)),
                    figure('Net', fmt.money(value - spent), value - spent < 0 ? 'is-bad' : 'is-good')),
                h('div', { class: 'sim-bars' },
                    RARITIES.map(r => h('div', { class: 'sim-bar', style: `--rc:${r.color}` },
                        h('span', { class: 'sim-bar-label' }, r.name),
                        h('span', { class: 'sim-bar-track' },
                            h('span', { class: 'sim-bar-fill', style: `width:${Math.max(0.6, (counts[r.id] / max) * 100)}%` })),
                        h('span', { class: 'sim-bar-count' }, fmt.int(counts[r.id]))))));
            sound.reveal(4);
        }

        primaryAction = open;
    }

    function oddsPanel() {
        return h('section', { class: 'panel' },
            h('h3', { class: 'panel-title' }, 'Drop odds'),
            h('table', { class: 'odds-table' },
                h('thead', {}, h('tr', {}, h('th', {}, 'Rarity'), h('th', {}, 'Chance'), h('th', {}, 'Odds'))),
                h('tbody', {}, RARITIES.map(r => h('tr', {},
                    h('td', {}, h('span', { class: 'dot', style: `background:${r.color}` }), r.name),
                    h('td', { class: 'num' }, fmt.pct(r.p)),
                    h('td', { class: 'num' }, fmt.oneIn(r.p)))))),
            h('div', { class: 'panel-note' },
                h('p', {}, 'Each case costs ', h('b', {}, fmt.money(CASE_COST)),
                    '. On average you get back ', h('b', {}, fmt.money(EXPECTED_VALUE)),
                    ` (${Math.round((EXPECTED_VALUE / CASE_COST) * 100)}%).`),
                h('p', {}, 'The roll is decided the instant you click. The animation just takes ',
                    'its time showing you.')));
    }

    Lottery.register({
        id: 'case',
        name: 'Case Opening',
        kicker: 'Lottery 01 · loot boxes',
        tagline: 'Pay for a key, watch the reel spin, hope for gold.',
        headline: { label: 'Chance of a knife', p: rarityById.gold.p },
        mount,
        unmount() { alive = false; },
        primary: () => primaryAction?.(),
    });
})();
