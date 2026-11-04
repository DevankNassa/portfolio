'use strict';

(() => {
    const { h, figure, random, fmt, sound, stats, wait, burst, params, makeRng } = Lottery;

    // Modelled on modern English Pokémon TCG boosters (Scarlet & Violet era).
    // The publisher doesn't release pull rates, so these are rounded community
    // averages from large opening logs. Card art and names are original.
    const PACK_COST = 4.49;
    const BOX_PACKS = 36;
    const SET_SIZE = 191;

    const RARITIES = {
        common: { name: 'Common', sym: '●', color: '#9aa0ad', value: [0.02, 0.06] },
        uncommon: { name: 'Uncommon', sym: '◆', color: '#9aa0ad', value: [0.03, 0.1] },
        reverse: { name: 'Reverse Holo', sym: '●', color: '#b9c4d6', value: [0.08, 0.4] },
        rare: { name: 'Holo Rare', sym: '★', color: '#c9cdd6', value: [0.15, 0.6] },
        double: { name: 'Double Rare', sym: '★★', color: '#7fd8ff', value: [0.4, 2.5], level: 1 },
        ultra: { name: 'Ultra Rare', sym: '★★', color: '#e3e8f2', value: [2, 8], level: 2 },
        illus: { name: 'Illustration Rare', sym: '★', color: '#ffcf4a', value: [1.5, 14], level: 2 },
        sir: { name: 'Special Illustration Rare', sym: '★★', color: '#ff7ad9', value: [12, 80], level: 3 },
        hyper: { name: 'Hyper Rare', sym: '★★★', color: '#ffd24a', value: [14, 45], level: 3 },
    };
    // Card 9 is a second reverse holo unless it upgrades; card 10 is the rare.
    const HIT_SLOT = { illus: 1 / 12, sir: 1 / 60, hyper: 1 / 125 };
    const RARE_SLOT = { double: 1 / 6, ultra: 1 / 15 };
    const RATE = { ...HIT_SLOT, ...RARE_SLOT };
    const FULL_ART = new Set(['ultra', 'illus', 'sir', 'hyper']);
    const isEx = r => r === 'double' || r === 'ultra' || r === 'sir' || r === 'hyper';

    const TYPES = {
        spark: { c: '#ffd23f', d: '#a87a00', sky: ['#1a1450', '#e8508a'], moves: ['Static Nibble', 'Overclock Bolt'] },
        blaze: { c: '#ff7a3d', d: '#a8361a', sky: ['#3a0d1e', '#ff8a4d'], moves: ['Ember Toss', 'Thermal Runaway'] },
        tide: { c: '#4fb8ff', d: '#1f5f99', sky: ['#06264a', '#5fe0ff'], moves: ['Bubble Ping', 'Coolant Surge'] },
        grove: { c: '#7ed957', d: '#3a7a2a', sky: ['#0c3322', '#c4f07a'], moves: ['Vine Trace', 'Photosynthesis'] },
        mind: { c: '#c77dff', d: '#6a2c9e', sky: ['#2a0d4a', '#ff7ad9'], moves: ['Bit Flip', 'Superposition'] },
        stone: { c: '#d09a5e', d: '#7a5230', sky: ['#2d1c10', '#f0b97a'], moves: ['Pebble Toss', 'Die Slam'] },
        shade: { c: '#8079b8', d: '#2e2a4f', sky: ['#07071a', '#6b5cff'], moves: ['Leakage', 'Null Pointer'] },
        alloy: { c: '#b9c4d6', d: '#5a6578', sky: ['#1b2230', '#d6e2f5'], moves: ['Solder Snap', 'Iron Gate'] },
    };

    // [name, type, body, ears, tail, eyes, wings, evolved]
    const CREATURES = [
        ['Ampup', 'spark', 'round', 'cat', 'bolt', 'round'],
        ['Ohmlet', 'spark', 'drop', 'antenna', '', 'round'],
        ['Fluxfox', 'blaze', 'tall', 'cat', 'flame', 'round'],
        ['Cindrop', 'blaze', 'drop', '', 'flame', 'sleepy'],
        ['Drippet', 'tide', 'drop', 'fin', '', 'round'],
        ['Wafurtle', 'tide', 'wide', '', 'fin', 'sleepy'],
        ['Sproutboard', 'grove', 'round', 'leaf', 'leaf', 'round'],
        ['Mossbit', 'grove', 'wide', 'mouse', '', 'round'],
        ['Qubit', 'mind', 'round', 'antenna', '', 'sleepy'],
        ['Pebblock', 'stone', 'wide', 'horns', '', 'fierce'],
        ['Voltdrake', 'spark', 'tall', 'horns', 'bolt', 'fierce', true, true],
        ['Thermite', 'blaze', 'tall', 'horns', 'flame', 'fierce', false, true],
        ['Coolant', 'tide', 'tall', 'fin', 'fin', 'round', false, true],
        ['Arborithm', 'grove', 'tall', 'leaf', 'leaf', 'fierce', true, true],
        ['Lumenix', 'mind', 'drop', 'bunny', '', 'sleepy', true, true],
        ['Diebolt', 'stone', 'round', 'horns', 'whip', 'fierce', false, true],
        ['Nullcat', 'shade', 'round', 'cat', 'whip', 'fierce', false, true],
        ['Glitchwing', 'shade', 'drop', 'antenna', '', 'round', true, true],
        ['Ferrobyte', 'alloy', 'wide', 'horns', 'fin', 'fierce', false, true],
        ['Solderat', 'alloy', 'round', 'mouse', 'whip', 'round', false, true],
    ].map(([name, type, body, ears, tail, eyes, wings = false, evolved = false], i) =>
        ({ name, type, body, ears, tail, eyes, wings, evolved, i }));

    const byName = n => CREATURES.find(c => c.name === n);
    const BASICS = CREATURES.filter(c => !c.evolved);
    const EVOLVED = CREATURES.filter(c => c.evolved);
    const CHASE = byName('Voltdrake');
    const CHASE_VALUE = 380;
    const POOLS = {
        common: BASICS, uncommon: CREATURES, reverse: CREATURES, rare: EVOLVED,
        double: EVOLVED, ultra: EVOLVED, illus: BASICS, sir: EVOLVED,
        hyper: ['Voltdrake', 'Thermite', 'Nullcat'].map(byName),
    };
    const NUMBER_BASE = { common: 1, uncommon: 31, reverse: 1, rare: 51, double: 91, ultra: 131, illus: 192, sir: 202, hyper: 222 };
    const P_CHASE = HIT_SLOT.sir / POOLS.sir.length;

    const isChase = c => c.creature === CHASE && c.rarity === 'sir';
    const levelOf = c => (isChase(c) ? 4 : RARITIES[c.rarity].level || 0);
    const oddsOf = c => (isChase(c) ? P_CHASE : RATE[c.rarity]);
    const cardName = c => (isEx(c.rarity) ? `${c.creature.name} ex` : c.creature.name);

    // Fixed market price per card, skewed so most cards in a rarity are cheap.
    function valueOf(cr, rarity) {
        if (cr === CHASE && rarity === 'sir') return CHASE_VALUE;
        const [lo, hi] = RARITIES[rarity].value;
        const u = makeRng(`${cr.name}:${rarity}`)();
        return Math.round((lo + (hi - lo) * u * u) * 100) / 100;
    }
    const meanValue = r => POOLS[r].reduce((a, c) => a + valueOf(c, r), 0) / POOLS[r].length;
    const slotValue = (table, fallback) => {
        let rest = 1;
        let ev = 0;
        for (const [r, p] of Object.entries(table)) { ev += p * meanValue(r); rest -= p; }
        return ev + rest * meanValue(fallback);
    };
    const BULK_VALUE = 4 * meanValue('common') + 3 * meanValue('uncommon');
    const PACK_EV = BULK_VALUE + meanValue('reverse') + slotValue(HIT_SLOT, 'reverse') + slotValue(RARE_SLOT, 'rare');
    const BOX_CHASE = 1 - Math.pow(1 - P_CHASE, BOX_PACKS);

    const anyOf = list => list[Math.floor(random() * list.length)];

    function rollSlot(table, fallback) {
        let r = random();
        for (const [id, p] of Object.entries(table)) {
            r -= p;
            if (r < 0) return id;
        }
        return fallback;
    }

    function makeCard(rarity, creature = anyOf(POOLS[rarity])) {
        return { rarity, creature, value: valueOf(creature, rarity), num: NUMBER_BASE[rarity] + creature.i };
    }

    // Real pack order: commons, uncommons, reverse holo, hit slot, rare last.
    function makePack(force) {
        const cards = [];
        for (let i = 0; i < 4; i++) cards.push(makeCard('common'));
        for (let i = 0; i < 3; i++) cards.push(makeCard('uncommon'));
        cards.push(makeCard('reverse'));
        const hit = force === 'chase' ? 'sir' : Object.hasOwn(HIT_SLOT, force) ? force : rollSlot(HIT_SLOT, 'reverse');
        const top = Object.hasOwn(RARE_SLOT, force) ? force : rollSlot(RARE_SLOT, 'rare');
        cards.push(makeCard(hit, force === 'chase' ? CHASE : undefined));
        cards.push(makeCard(top));
        return cards;
    }

    // ---------- Art (procedural SVG creatures) ----------
    const BODIES = {
        round: { d: 'M50 38C67 38 77 50 77 64C77 79 65 88 50 88C35 88 23 79 23 64C23 50 33 38 50 38Z', top: 38, eye: 58, eyeDx: 10, belly: 75, w: 27, earDx: 15, right: 77 },
        tall: { d: 'M50 26C65 26 72 44 72 62C72 80 63 89 50 89C37 89 28 80 28 62C28 44 35 26 50 26Z', top: 27, eye: 46, eyeDx: 9, belly: 73, w: 22, earDx: 11, right: 72 },
        drop: { d: 'M50 22C58 36 75 48 75 66C75 81 64 89 50 89C36 89 25 81 25 66C25 48 42 36 50 22Z', top: 33, eye: 60, eyeDx: 10, belly: 77, w: 25, earDx: 12, right: 75 },
        wide: { d: 'M50 46C71 46 85 56 85 69C85 81 71 88 50 88C29 88 15 81 15 69C15 56 29 46 50 46Z', top: 47, eye: 63, eyeDx: 13, belly: 77, w: 35, earDx: 19, right: 85 },
    };
    const INK = '#1b1b2b';
    const X = (s, dx) => 50 + s * dx;
    const both = f => f(-1) + f(1);

    const EARS = {
        cat: (t, dx, fill, line) => both(s =>
            `<path d="M${X(s, dx - 7)} ${t + 6}L${X(s, dx + 2)} ${t - 15}L${X(s, dx + 9)} ${t + 10}Z" fill="${fill}" ${line}/>` +
            `<path d="M${X(s, dx - 3)} ${t + 4}L${X(s, dx + 2)} ${t - 8}L${X(s, dx + 5)} ${t + 6}Z" fill="#ff9db5" opacity=".75"/>`),
        bunny: (t, dx, fill, line) => both(s =>
            `<g transform="rotate(${s * 14} ${X(s, dx - 4)} ${t - 10})"><ellipse cx="${X(s, dx - 4)}" cy="${t - 10}" rx="5.5" ry="15" fill="${fill}" ${line}/>` +
            `<ellipse cx="${X(s, dx - 4)}" cy="${t - 9}" rx="2.4" ry="10" fill="#ff9db5" opacity=".7"/></g>`),
        mouse: (t, dx, fill, line) => both(s =>
            `<circle cx="${X(s, dx + 2)}" cy="${t + 2}" r="10" fill="${fill}" ${line}/><circle cx="${X(s, dx + 2)}" cy="${t + 2}" r="5.5" fill="#ff9db5" opacity=".7"/>`),
        horns: (t, dx, fill, line, dark) => both(s =>
            `<path d="M${X(s, dx - 6)} ${t + 6}Q${X(s, dx)} ${t - 6} ${X(s, dx + 8)} ${t - 16}Q${X(s, dx + 4)} ${t - 2} ${X(s, dx + 2)} ${t + 8}Z" fill="#f4ecd8" stroke="${dark}" stroke-width="1.6"/>`),
        antenna: (t, dx, fill, line, dark) =>
            `<path d="M50 ${t + 2}Q48 ${t - 8} 54 ${t - 16}" fill="none" stroke="${dark}" stroke-width="2"/>` +
            `<circle cx="54" cy="${t - 17}" r="4.5" fill="#fffbe0" stroke="${dark}" stroke-width="1.6"/>`,
        fin: (t, dx, fill, line, dark) => `<path d="M40 ${t + 6}Q46 ${t - 16} 62 ${t - 12}Q56 ${t - 2} 60 ${t + 6}Z" fill="${dark}"/>`,
        leaf: t =>
            `<path d="M50 ${t + 3}Q36 ${t - 10} 46 ${t - 22}Q60 ${t - 12} 50 ${t + 3}Z" fill="#5cc94a" stroke="#2f7a24" stroke-width="1.5"/>` +
            `<path d="M50 ${t + 2}L47 ${t - 16}" stroke="#2f7a24" stroke-width="1"/>`,
    };

    const TAILS = {
        bolt: (fill, line) => `<path d="M70 74L86 60L82 68L96 58L84 80L86 72Z" fill="${fill}" ${line}/>`,
        flame: () => `<path d="M70 76Q92 76 90 56Q86 64 82 62Q90 48 80 38Q78 54 70 62Z" fill="#ffb347" stroke="#d9541e" stroke-width="2"/>` +
            '<path d="M72 74Q86 72 85 62Q82 66 79 64Q82 56 78 50Q76 60 72 66Z" fill="#ffe27a"/>',
        leaf: () => '<path d="M70 74Q96 74 96 50Q78 52 70 66Z" fill="#5cc94a" stroke="#2f7a24" stroke-width="2"/>',
        fin: (fill, line, dark) => `<path d="M72 74L94 62L90 84Z" fill="${dark}"/>`,
        whip: (fill, line, dark) => `<path d="M72 78Q92 84 90 66Q88 52 96 46" fill="none" stroke="${dark}" stroke-width="3.5" stroke-linecap="round"/>`,
    };

    function eye(x, y, s, kind) {
        if (kind === 'sleepy') {
            return `<path d="M${x - 5} ${y}Q${x} ${y + 4.5} ${x + 5} ${y}" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`;
        }
        let out = `<ellipse cx="${x}" cy="${y}" rx="5" ry="6.2" fill="#fff"/>` +
            `<circle cx="${x - s * 0.6}" cy="${y + 0.8}" r="3.6" fill="${INK}"/>` +
            `<circle cx="${x - s * 0.6 - 1.3}" cy="${y - 0.9}" r="1.3" fill="#fff"/>`;
        if (kind === 'fierce') out += `<path d="M${x + s * 6} ${y - 10}L${x - s * 5} ${y - 6}" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`;
        return out;
    }

    // Creature drawn in a 100×100 box, feet at y≈90.
    function creatureArt(cr, gold = false) {
        const t = TYPES[cr.type];
        const fill = gold ? '#f2c94c' : t.c;
        const dark = gold ? '#9a6a12' : t.d;
        const B = BODIES[cr.body];
        const line = `stroke="${dark}" stroke-width="2" stroke-linejoin="round"`;
        const out = [];
        if (cr.wings) {
            out.push(both(s => `<path d="M${X(s, 10)} 62Q${X(s, 30)} 30 ${X(s, 46)} 34Q${X(s, 40)} 44 ${X(s, 44)} 52Q${X(s, 34)} 52 ${X(s, 36)} 62Q${X(s, 26)} 60 ${X(s, 20)} 70Z" fill="${dark}" ${line}/>`));
        }
        if (TAILS[cr.tail]) out.push(`<g transform="translate(${B.right - 74} 0)">${TAILS[cr.tail](fill, line, dark)}</g>`);
        out.push(both(s => `<ellipse cx="${X(s, 11)}" cy="87" rx="8" ry="4.5" fill="${dark}"/>`));
        if (EARS[cr.ears]) out.push(EARS[cr.ears](B.top, B.earDx, fill, line, dark));
        out.push(`<path d="${B.d}" fill="${fill}" ${line}/>`);
        out.push(`<ellipse cx="50" cy="${B.belly}" rx="${B.w * 0.5}" ry="8" fill="#fff" opacity=".3"/>`);
        out.push(both(s => eye(X(s, B.eyeDx), B.eye, s, cr.eyes)));
        if (!cr.evolved && cr.eyes !== 'fierce') {
            out.push(both(s => `<circle cx="${X(s, B.eyeDx + 7)}" cy="${B.eye + 7}" r="3.6" fill="#ff6b8b" opacity=".55"/>`));
        }
        const m = B.eye + 9;
        out.push(`<path d="M46 ${m}Q50 ${m + 4} 54 ${m}" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>`);
        if (cr.eyes === 'fierce') out.push(`<path d="M51.5 ${m + 1.6}l1.6 3.2l1.6 -3.6z" fill="#fff"/>`);
        return out.join('');
    }

    // Sky, sun and hills behind illustration rares.
    function scene(cr, H) {
        const t = TYPES[cr.type];
        const rng = makeRng(`scene:${cr.name}`);
        let s = '';
        for (let i = 0; i < 16; i++) {
            s += `<circle cx="${(rng() * 100).toFixed(1)}" cy="${(rng() * H * 0.5).toFixed(1)}" r="${(0.3 + rng() * 0.9).toFixed(2)}" fill="#fff" opacity="${(0.4 + rng() * 0.6).toFixed(2)}"/>`;
        }
        s += `<circle cx="${(22 + rng() * 56).toFixed(1)}" cy="${H * 0.26}" r="${H * 0.12}" fill="${t.sky[1]}" opacity=".6"/>`;
        s += `<path d="M0 ${H * 0.6}Q25 ${H * 0.48} 50 ${H * 0.58}T100 ${H * 0.54}V${H}H0Z" fill="${t.d}" opacity=".55"/>`;
        s += `<path d="M0 ${H * 0.74}Q30 ${H * 0.64} 60 ${H * 0.72}T100 ${H * 0.68}V${H}H0Z" fill="${t.d}" opacity=".9"/>`;
        return s;
    }

    function artSVG(c, full) {
        const H = full ? 140 : 64;
        const sc = full ? 0.98 : 0.66;
        const ground = full ? H * 0.74 : H * 0.95;
        const tx = 50 - 50 * sc;
        const ty = ground - 88 * sc;
        const scenic = c.rarity === 'illus' || c.rarity === 'sir';
        return `<svg viewBox="0 0 100 ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">` +
            (scenic ? scene(c.creature, H) : '') +
            `<ellipse cx="50" cy="${ground}" rx="${24 * sc}" ry="${3.5 * sc}" fill="#000" opacity=".2"/>` +
            `<g transform="translate(${tx} ${ty}) scale(${sc})">${creatureArt(c.creature, c.rarity === 'hyper')}</g></svg>`;
    }

    function cardEl(c) {
        const r = c.rarity;
        const cr = c.creature;
        const t = TYPES[cr.type];
        const full = FULL_ART.has(r);
        const ex = isEx(r);
        const hp = (ex ? 200 : cr.evolved ? 110 : 50) + ((cr.i * 7) % 5) * 10;
        const dmg1 = (ex ? 60 : cr.evolved ? 30 : 10) + (cr.i % 3) * 10;
        const dmg2 = (ex ? 180 : cr.evolved ? 90 : 30) + (cr.i % 4) * 20;
        const move = (name, cost, dmg) => h('div', { class: 'tc-move' },
            h('span', { class: 'tc-cost' }, Array.from({ length: cost }, () => h('i'))),
            h('b', {}, name),
            h('span', { class: 'tc-dmg' }, dmg));
        return h('div', {
            class: `tc r-${r}${full ? ' is-full' : ''}`,
            style: `--tc:${t.c};--td:${t.d};--s1:${t.sky[0]};--s2:${t.sky[1]}`,
        },
            h('div', { class: 'tc-inner' },
                r === 'reverse' ? h('div', { class: 'tc-holo' }) : null,
                h('div', { class: 'tc-head' },
                    h('span', { class: 'tc-stage' }, cr.evolved ? 'STAGE 1' : 'BASIC'),
                    h('span', { class: 'tc-name' }, cardName(c)),
                    h('span', { class: 'tc-hp' }, h('small', {}, 'HP'), hp),
                    h('span', { class: 'tc-type' })),
                h('div', { class: 'tc-art', html: artSVG(c, full) }, r === 'rare' ? h('div', { class: 'tc-holo' }) : null),
                r === 'illus' ? null : h('div', { class: 'tc-moves' },
                    move(t.moves[0], 1, dmg1),
                    move(t.moves[1], 3, dmg2),
                    full ? null : h('div', { class: 'tc-lines' }, h('i'), h('i'))),
                h('div', { class: 'tc-foot' },
                    h('span', {}, `${String(c.num).padStart(3, '0')}/${SET_SIZE}`),
                    h('span', { class: 'tc-rar' }, RARITIES[r].sym))),
            full ? h('div', { class: 'tc-holo' }) : null,
            h('div', { class: 'tc-glare' }));
    }

    const BACK_SVG = '<svg viewBox="0 0 100 140" aria-hidden="true">' +
        '<g fill="none" stroke="#ffd23f" stroke-width="1.2"><circle cx="50" cy="70" r="31" opacity=".9"/><circle cx="50" cy="70" r="25" stroke-dasharray="2.5 2.5" opacity=".7"/>' +
        '<path d="M50 14V39M50 101V126M8 70H19M81 70H92" opacity=".5"/></g>' +
        '<path d="M44 52v6M50 52v6M56 52v6M44 82v6M50 82v6M56 82v6M32 64h6M32 70h6M32 76h6M62 64h6M62 70h6M62 76h6" stroke="#ffd23f" stroke-width="1.6" stroke-linecap="round"/>' +
        '<rect x="38" y="58" width="24" height="24" rx="3" fill="#ffd23f"/><rect x="43" y="63" width="14" height="14" rx="1.5" fill="#1b2a6b"/>' +
        '<text x="50" y="121" text-anchor="middle" font-size="6.4" font-weight="700" letter-spacing="1.6" fill="#ffd23f">SILICON SPIRITS</text></svg>';

    const backEl = () => h('div', { class: 'tc tc-back', html: BACK_SVG });

    function packArt() {
        const bolts = '<path d="M8 30L22 46L16 48L30 66" fill="none" stroke="#fff6c2" stroke-width="2.4" stroke-linejoin="round" opacity=".8"/>' +
            '<path d="M94 22L80 40L87 42L72 60" fill="none" stroke="#fff6c2" stroke-width="2.4" stroke-linejoin="round" opacity=".8"/>';
        return h('div', { class: 'pack-art' },
            h('div', { class: 'pack-crimp is-top' }),
            h('div', { class: 'pack-logo' },
                h('small', {}, 'Silicon'),
                h('strong', {}, 'Spirits'),
                h('span', {}, 'Trading card game')),
            h('div', { class: 'pack-hero', html: `<svg viewBox="-6 6 112 92" aria-hidden="true">${bolts}${creatureArt(CHASE)}</svg>` }),
            h('div', { class: 'pack-foot' }, h('span', { class: 'pack-badge' }, '10 cards'), h('span', {}, 'Booster pack')),
            h('div', { class: 'pack-crimp is-bottom' }),
            h('div', { class: 'pack-shine' }));
    }

    // A ragged tear line just under the top crimp, shared by both halves.
    function tearClips() {
        const N = 18;
        const line = Array.from({ length: N + 1 }, (_, i) =>
            `${((i / N) * 100).toFixed(1)}% ${(8.6 + (Math.random() - 0.5) * 1.8).toFixed(2)}%`);
        return {
            top: `polygon(0 0, 100% 0, ${line.slice().reverse().join(', ')})`,
            body: `polygon(${line.join(', ')}, 100% 100%, 0 100%)`,
        };
    }

    function makePackEl() {
        const clips = tearClips();
        const top = h('div', { class: 'pack-piece pack-top', style: `clip-path:${clips.top}` }, packArt());
        const body = h('div', { class: 'pack-piece pack-body', style: `clip-path:${clips.body}` }, packArt());
        return h('div', { class: 'pack' }, h('div', { class: 'pack-float' }, h('div', { class: 'pack-tilt' }, body, top)));
    }

    // ---------- Machine ----------
    let alive = false;
    let mountId = 0;
    let primaryAction = null;

    function mount(root) {
        alive = true;
        const id = ++mountId;
        const live = () => alive && id === mountId;

        let state = 'idle'; // idle → opening → open → done
        let pack = [];
        let cardEls = [];
        let pos = 0;
        let packValue = 0;
        let animating = false;
        let fast = false;
        let packEl = null;
        const session = { packs: 0, spent: 0, value: 0, best: null };

        const rays = h('div', { class: 'pack-rays' });
        const label = h('div', { class: 'hit-label' });
        const zone = h('div', { class: 'pack-zone', onclick: () => (state === 'idle' ? open() : state === 'open' ? next() : null) });
        const slots = Array.from({ length: 10 }, () => h('div', { class: 'pulled-slot' }));
        const pulled = h('div', { class: 'pulled' }, slots);
        const summary = h('div', { class: 'pack-summary' });
        const openBtn = h('button', { class: 'btn btn-primary', type: 'button', onclick: () => primaryAction() });
        const allBtn = h('button', { class: 'btn', type: 'button', onclick: revealAll }, 'Reveal all');
        const simBtn = h('button', { class: 'btn', type: 'button', onclick: untilChase }, `Open until I pull ${CHASE.name}`);
        const sim = h('div', { class: 'sim', hidden: true });
        const sessionFigures = h('div', { class: 'sim-figures' });
        const binder = h('div', { class: 'binder' }, h('div', { class: 'inventory-empty' }, 'Double Rares and better go in your binder.'));

        zone.addEventListener('pointermove', e => {
            const b = zone.getBoundingClientRect();
            const x = (e.clientX - b.left) / b.width;
            const y = (e.clientY - b.top) / b.height;
            zone.classList.add('is-pointer');
            zone.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
            zone.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
            zone.style.setProperty('--rx', `${((0.5 - y) * 18).toFixed(2)}deg`);
            zone.style.setProperty('--ry', `${((x - 0.5) * 24).toFixed(2)}deg`);
        });
        zone.addEventListener('pointerleave', () => {
            zone.classList.remove('is-pointer');
            ['--mx', '--my', '--rx', '--ry'].forEach(p => zone.style.removeProperty(p));
        });

        root.append(h('div', { class: 'split' },
            h('div', { class: 'split-main' },
                h('div', { class: 'pack-stage' }, zone, pulled, summary),
                h('div', { class: 'actions' }, openBtn, allBtn, simBtn),
                sim,
                h('section', { class: 'panel' },
                    h('h3', { class: 'panel-title' }, 'Your binder'),
                    sessionFigures,
                    binder)),
            h('aside', { class: 'split-side' }, ratesPanel())));

        renderSession();
        freshPack();

        function setButtons() {
            openBtn.disabled = state === 'opening';
            openBtn.textContent =
                state === 'idle' ? `Open pack · ${fmt.money(PACK_COST)}`
                    : state === 'opening' ? 'Opening…'
                        : state === 'open' ? `Next card · ${pos + 1}/${pack.length}`
                            : `Open another · ${fmt.money(PACK_COST)}`;
            allBtn.disabled = state !== 'open';
        }

        function setSummary(left, right = '') {
            summary.replaceChildren(h('span', {}, left), h('span', {}, right));
        }

        function freshPack() {
            state = 'idle';
            packEl = makePackEl();
            label.className = 'hit-label';
            rays.classList.remove('is-on');
            zone.replaceChildren(rays, label, packEl);
            packEl.animate([{ transform: 'translateY(-50px) scale(0.92)', opacity: 0 }, { transform: 'none', opacity: 1 }],
                { duration: 450, easing: 'cubic-bezier(0.2, 1.2, 0.4, 1)' });
            slots.forEach(s => { s.className = 'pulled-slot'; s.replaceChildren(); });
            setSummary('Tap the pack or press Space to tear it open.', `${fmt.oneIn(P_CHASE)} packs has ${CHASE.name}`);
            setButtons();
        }

        async function open() {
            if (state !== 'idle') return;
            state = 'opening';
            setButtons();
            sound.unlock();

            pack = makePack(params.get('force'));
            pos = 0;
            packValue = 0;
            stats.record({ tries: 1, spent: PACK_COST });
            session.packs++;
            session.spent += PACK_COST;
            renderSession();
            setSummary('Opening…');

            // The stack waits behind the wrapper, back of the first card facing us.
            const stack = h('div', { class: 'stack' });
            cardEls = pack.map((c, i) => h('div', { class: 'stack-card', style: `z-index:${20 - i};--k:${Math.min(i, 4)}` },
                h('div', { class: 'tilt' }, h('div', { class: 'flip' + (i === 0 ? ' is-back' : '') }, cardEl(c), i === 0 ? backEl() : null))));
            stack.append(...cardEls);
            stack.style.transform = 'translateY(46px)';
            zone.insertBefore(stack, packEl);

            await packEl.animate([
                { transform: 'none' }, { transform: 'translateX(-4px) rotate(-1.5deg)' }, { transform: 'translateX(4px) rotate(1.5deg)' },
                { transform: 'translateX(-3px) rotate(-1deg)' }, { transform: 'translateX(2px) rotate(0.5deg)' }, { transform: 'none' },
            ], { duration: 420 }).finished;
            if (live()) sound.rip();

            // Peel the top strip off from the left, then flick it away.
            const top = packEl.querySelector('.pack-top');
            top.style.transformOrigin = '100% 9%';
            await top.animate([
                { transform: 'none', opacity: 1 },
                { transform: 'rotate(-9deg)', opacity: 1, offset: 0.45 },
                { transform: 'translate(90px, -150px) rotate(-38deg)', opacity: 0 },
            ], { duration: 650, easing: 'cubic-bezier(0.3, 0.6, 0.4, 1)', fill: 'forwards' }).finished;

            // Cards up, wrapper down.
            stack.animate([{ transform: 'translateY(46px)' }, { transform: 'translateY(-42px)' }], { duration: 520, easing: 'ease-out', fill: 'forwards' });
            await wait(260);
            if (live()) sound.swish();
            await packEl.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(115%) rotate(4deg)', opacity: 0 }],
                { duration: 620, easing: 'cubic-bezier(0.55, 0, 0.75, 0.2)', fill: 'forwards' }).finished;
            packEl.remove();
            await stack.animate([{ transform: 'translateY(-42px)' }, { transform: 'none' }], { duration: 280, easing: 'ease-out', fill: 'forwards' }).finished;
            stack.getAnimations().forEach(a => a.cancel());
            stack.style.transform = '';

            const flip = cardEls[0].querySelector('.flip');
            if (live()) sound.thunk();
            await flip.animate([{ transform: 'rotateY(180deg)' }, { transform: 'rotateY(0deg)' }],
                { duration: 480, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' }).finished;
            flip.classList.remove('is-back');
            flip.querySelector('.tc-back')?.remove();

            state = 'open';
            reveal();
            setButtons();
        }

        // The card at `pos` is now face up at the front of the stack.
        function reveal() {
            const c = pack[pos];
            const el = cardEls[pos];
            const lv = levelOf(c);
            const color = isChase(c) ? '#ffd24a' : RARITIES[c.rarity].color;
            el.classList.add('is-front');
            packValue += c.value;
            stats.record({ won: c.value });

            slots[pos].className = `pulled-slot is-filled${lv ? ` lv-${lv}` : ''}`;
            slots[pos].style.setProperty('--rc', color);
            slots[pos].title = `${cardName(c)} · ${RARITIES[c.rarity].name} · ${fmt.money(c.value)}`;
            slots[pos].replaceChildren(cardEl(c));
            setSummary(`Card ${pos + 1} of ${pack.length} · ${RARITIES[c.rarity].name}`, `Pack value so far ${fmt.money(packValue)}`);

            if (!lv) return;
            el.classList.add(`lv-${lv}`);
            el.style.setProperty('--rc', color);
            zone.style.setProperty('--rc', color);
            label.replaceChildren(
                h('span', { class: 'reveal-rarity', style: `--rc:${color}` }, isChase(c) ? 'Chase card!' : RARITIES[c.rarity].name),
                h('b', {}, cardName(c)),
                h('span', { class: 'hit-odds' }, `${fmt.oneIn(oddsOf(c))} packs · ${fmt.money(c.value)}`));
            label.className = 'hit-label';
            void label.offsetWidth; // restart the pop animation
            label.classList.add('is-on');
            if (!live()) return;
            sound.reveal(Math.min(4, lv + 1));
            if (lv >= 3) {
                rays.classList.add('is-on');
                zone.classList.remove('is-flash');
                void zone.offsetWidth;
                zone.classList.add('is-flash');
                burst(zone, lv === 4 ? ['#ffd24a', '#fff', '#ff7ad9', '#7fd8ff'] : [color, '#fff'], lv === 4 ? 140 : 80);
            }
            if (lv === 4) for (let i = 0; i < 10; i++) sound.coin(0.3 + i * 0.08);
        }

        async function next() {
            if (state !== 'open' || animating) return;
            animating = true;
            const front = cardEls[pos];
            const upcoming = pack[pos + 1];
            const nextLv = upcoming ? levelOf(upcoming) : 0;

            if (!upcoming) { animating = false; return; }

            label.className = 'hit-label';
            rays.classList.remove('is-on');

            // Slow peek before a big hit: slide the front card just enough to see a corner.
            if (!fast && nextLv >= 2) {
                front.animate([{ transform: 'translateX(-26%) rotate(-5deg)' }], { duration: 520, easing: 'ease-out', fill: 'forwards' });
                if (live()) sound.tone({ freq: 70, dur: 0.5, type: 'sine', gain: 0.25 });
                await wait(nextLv >= 3 ? 1000 : 560);
                if (live() && nextLv >= 3) sound.tone({ freq: 70, dur: 0.5, type: 'sine', gain: 0.3 });
            }
            if (live()) sound.swish();
            await front.animate([{ transform: 'translate(-135%, -8%) rotate(-16deg)', opacity: 0 }],
                { duration: fast ? 150 : 300, easing: 'cubic-bezier(0.5, 0, 0.8, 0.4)', fill: 'forwards' }).finished;
            front.remove();
            pos++;
            cardEls.slice(pos).forEach((el, i) => el.style.setProperty('--k', Math.min(i, 4)));
            reveal();
            if (pos === pack.length - 1) finish();
            setButtons();
            animating = false;
        }

        function finish() {
            state = 'done';
            session.value += packValue;
            const hits = pack.filter(c => levelOf(c) > 0);
            for (const c of hits) {
                if (!session.best || c.value > session.best.value) session.best = c;
                binder.querySelector('.inventory-empty')?.remove();
                binder.prepend(h('div', { class: `binder-item lv-${levelOf(c)}`, style: `--rc:${isChase(c) ? '#ffd24a' : RARITIES[c.rarity].color}` },
                    h('div', { class: 'binder-card' }, cardEl(c)),
                    h('b', {}, cardName(c)),
                    h('span', {}, `${RARITIES[c.rarity].name} · ${fmt.money(c.value)}`)));
            }
            while (binder.children.length > 60) binder.lastChild.remove();
            renderSession();
            const net = packValue - PACK_COST;
            summary.replaceChildren(
                h('span', {}, 'This pack: ', h('b', {}, fmt.money(packValue)), ` in cards. You paid ${fmt.money(PACK_COST)}.`),
                h('b', { class: net >= 0 ? 'is-good' : 'is-bad' }, `${net >= 0 ? '+' : ''}${fmt.money(net)}`));
        }

        async function revealAll() {
            if (state !== 'open') return;
            fast = true;
            while (state === 'open' && live()) {
                if (animating) { await wait(40); continue; }
                await next();
                await wait(levelOf(pack[pos]) >= 2 ? 700 : 60);
            }
            fast = false;
        }

        function renderSession() {
            const net = session.value - session.spent;
            sessionFigures.replaceChildren(
                figure('Packs opened', fmt.int(session.packs)),
                figure('Spent', fmt.money(session.spent)),
                figure('Cards worth', fmt.money(session.value)),
                figure('Net', fmt.money(net), net < 0 ? 'is-bad' : net > 0 ? 'is-good' : ''),
                figure('Best pull', session.best ? `${cardName(session.best)} · ${fmt.money(session.best.value)}` : '–'));
        }

        function untilChase() {
            const counts = Object.fromEntries(Object.keys(RARITIES).map(r => [r, 0]));
            let n = 0;
            let value = 0;
            let got = false;
            while (!got && n < 100000) {
                n++;
                for (const c of makePack()) {
                    counts[c.rarity]++;
                    value += c.value;
                    if (isChase(c)) got = true;
                }
            }
            const spent = n * PACK_COST;
            stats.record({ tries: n, spent, won: value });

            // 2,000 other collectors, sampled straight from the geometric distribution.
            const players = Array.from({ length: 2000 }, () =>
                Math.max(1, Math.ceil(Math.log(1 - random()) / Math.log(1 - P_CHASE))));
            const BIN = 100;
            const bins = Array(30).fill(0);
            players.forEach(k => { bins[Math.min(bins.length - 1, Math.floor((k - 1) / BIN))]++; });
            const max = Math.max(...bins);
            const mineBin = Math.min(bins.length - 1, Math.floor((n - 1) / BIN));
            const sooner = players.filter(k => k < n).length / players.length;
            const hitRarities = ['double', 'ultra', 'illus', 'sir', 'hyper'];
            const maxHits = Math.max(...hitRarities.map(r => counts[r]));

            sim.hidden = false;
            sim.replaceChildren(
                h('div', { class: 'sim-headline' },
                    'It took ', h('b', {}, fmt.int(n)), ` packs (${fmt.money(spent)}, about ${(n / BOX_PACKS).toFixed(1)} booster boxes) to pull ${cardName({ creature: CHASE, rarity: 'sir' })}.`),
                h('div', { class: 'sim-figures' },
                    figure('Every card you pulled is worth', fmt.money(value)),
                    figure('Net', fmt.money(value - spent), value >= spent ? 'is-good' : 'is-bad'),
                    figure('Bulk cards you now own', fmt.int(counts.common + counts.uncommon + counts.reverse)),
                    figure('Collectors who got it sooner', `${Math.round(sooner * 100)}%`)),
                h('div', { class: 'sim-bars' }, hitRarities.map(r => h('div', { class: 'sim-bar', style: `--rc:${RARITIES[r].color}` },
                    h('span', { class: 'sim-bar-label' }, RARITIES[r].name),
                    h('span', { class: 'sim-bar-track' },
                        h('span', { class: 'sim-bar-fill', style: `width:${Math.max(0.6, (counts[r] / maxHits) * 100)}%` })),
                    h('span', { class: 'sim-bar-count' }, fmt.int(counts[r]))))),
                h('div', { class: 'histo pack-histo' }, bins.map((cnt, i) => h('div', {
                    class: 'histo-bar' + (i === mineBin ? ' is-mine' : ''),
                    style: `height:${(cnt / max) * 100}%`,
                    title: `${fmt.int(i * BIN + 1)}–${fmt.int((i + 1) * BIN)}${i === bins.length - 1 ? '+' : ''} packs: ${cnt} collectors`,
                }))),
                h('div', { class: 'histo-axis' }, h('span', {}, '1 pack'), h('span', {}, '1,500'), h('span', {}, '3,000+ packs')));
            sound.reveal(3);
        }

        primaryAction = () => {
            if (state === 'idle') open();
            else if (state === 'open') next();
            else if (state === 'done') { freshPack(); setTimeout(() => live() && open(), 480); }
        };
    }

    function ratesPanel() {
        const row = (label, color, p) => h('tr', {},
            h('td', {}, h('span', { class: 'dot', style: `background:${color}` }), label),
            h('td', { class: 'num' }, fmt.pct(p)),
            h('td', { class: 'num' }, fmt.oneIn(p)));
        const anyHit = Object.values(HIT_SLOT).reduce((a, p) => a + p, 0);
        return h('section', { class: 'panel' },
            h('h3', { class: 'panel-title' }, 'Pull rates per pack'),
            h('table', { class: 'odds-table' },
                h('thead', {}, h('tr', {}, h('th', {}, 'Pull'), h('th', {}, 'Chance'), h('th', {}, 'Odds'))),
                h('tbody', {},
                    ['double', 'ultra', 'illus', 'sir', 'hyper'].map(r => row(RARITIES[r].name, RARITIES[r].color, RATE[r])),
                    row('Any IR or better', '#ffffff', anyHit),
                    row(`${CHASE.name} ex SIR`, '#ffd24a', P_CHASE))),
            h('div', { class: 'panel-note' },
                h('p', {}, 'Nobody publishes these. The odds on real Pokémon TCG packs are worked out by collectors logging thousands of openings; these are rounded averages for recent sets.'),
                h('p', {}, 'A booster box (36 packs, about ', h('b', {}, fmt.money(BOX_PACKS * PACK_COST)), ') has a ',
                    h('b', {}, fmt.pct(BOX_CHASE)), ' chance of holding the chase card.'),
                h('p', {}, 'Average market value of a pack: ', h('b', {}, fmt.money(PACK_EV)), ` (${Math.round((PACK_EV / PACK_COST) * 100)}% of the price). The seven commons and uncommons are worth about `,
                    h('b', {}, `${Math.round(BULK_VALUE * 100)}¢`), ' together; almost all the value is in the last two cards.')));
    }

    Lottery.register({
        id: 'packs',
        name: 'Booster Packs',
        kicker: 'Lottery 06 · trading card packs',
        tagline: 'Ten cards, rare at the back. The one everyone wants is in roughly one pack out of 600.',
        headline: { label: 'Chase card per pack', p: P_CHASE },
        mount,
        unmount() { alive = false; },
        primary: () => primaryAction?.(),
    });
})();
