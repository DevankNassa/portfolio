'use strict';

(() => {
    const { h, figure, random, fmt, sound, stats, tween, ease, wait, burst, params } = Lottery;

    // ---------- Sourced rates ----------
    // Interview rate per application, by resume type. Huntr Q2 2026 report,
    // ~2M applications saved Oct 2024 - Jun 2026 (self-reported, so likely low).
    const INTERVIEW = { generic: 0.0309, tailored: 0.0571 };
    // Ashby (May 2026, 100M+ applications): open roles get 300+ applications per hire.
    const APPS_PER_HIRE = 300;
    // Gem 2025 Recruiting Benchmarks: 84% of offers are accepted.
    const ACCEPT = 0.84;
    // Not published anywhere directly. Derived so the generic chain multiplies
    // out to 1 hire per 300 applications: 1/300 = interview x offer x accept.
    const OFFER = 1 / APPS_PER_HIRE / (INTERVIEW.generic * ACCEPT);

    // ?force=hired | offer | interview: every application lands on that branch.
    const FORCED = { hired: 'hired', offer: 'declined', interview: 'noOffer' }[params.get('force')];

    // ---------- Tree layout (viewBox units) ----------
    const W = 150;
    const H = 54;
    const NODES = {
        applied:     { x: 16,  y: 200, label: 'Applications sent', color: '#111111' },
        interview:   { x: 236, y: 104, label: 'Interview',         color: '#111111' },
        silence:     { x: 236, y: 316, label: 'No interview',      color: '#bdbdbd', sub: 'rejected or ghosted' },
        offer:       { x: 456, y: 50,  label: 'Offer',             color: '#111111' },
        noOffer:     { x: 456, y: 168, label: 'No offer',          color: '#bdbdbd' },
        hired:       { x: 676, y: 22,  label: 'Hired',             color: '#d7261e' },
        declined:    { x: 676, y: 104, label: 'Offer declined',    color: '#9a9a9a' },
    };
    const EDGES = [
        ['applied', 'interview'], ['applied', 'silence'],
        ['interview', 'offer'], ['interview', 'noOffer'],
        ['offer', 'hired'], ['offer', 'declined'],
    ];
    const LEAVES = ['silence', 'noOffer', 'hired', 'declined'];
    const ROUTES = {
        silence:  ['applied', 'silence'],
        noOffer:  ['applied', 'interview', 'noOffer'],
        declined: ['applied', 'interview', 'offer', 'declined'],
        hired:    ['applied', 'interview', 'offer', 'hired'],
    };

    // Expected share of all applications reaching each node.
    function expectedShares(interviewRate) {
        const i = interviewRate;
        const o = i * OFFER;
        return { applied: 1, interview: i, silence: 1 - i, offer: o, noOffer: i - o, hired: o * ACCEPT, declined: o * (1 - ACCEPT) };
    }

    function roll(resume) {
        if (FORCED) return FORCED;
        if (random() >= INTERVIEW[resume]) return 'silence';
        if (random() >= OFFER) return 'noOffer';
        return random() < ACCEPT ? 'hired' : 'declined';
    }

    // fmt.pct can't format exactly zero.
    const pct = p => (p > 0 ? fmt.pct(p) : '0%');

    const emptyCounts = () => Object.fromEntries(Object.keys(NODES).map(k => [k, 0]));

    function addOutcome(counts, leaf, n = 1) {
        for (const id of ROUTES[leaf]) counts[id] += n;
    }

    // ---------- Personal log (this browser only) ----------
    const LOG_KEY = 'lottery.jobs.log';
    const LOG_FIELDS = [
        { id: 'applied',   label: 'Applications sent' },
        { id: 'tailored',  label: '…with a tailored resume' },
        { id: 'interview', label: 'Got an interview' },
        { id: 'offer',     label: 'Got an offer' },
        { id: 'hired',     label: 'Accepted' },
    ];
    function loadLog() {
        try {
            const saved = JSON.parse(localStorage.getItem(LOG_KEY) || '{}');
            return Object.fromEntries(LOG_FIELDS.map(f => [f.id, Math.max(0, Math.floor(Number(saved[f.id]) || 0))]));
        } catch {
            return Object.fromEntries(LOG_FIELDS.map(f => [f.id, 0]));
        }
    }
    function saveLog(log) {
        try { localStorage.setItem(LOG_KEY, JSON.stringify(log)); } catch { /* private mode */ }
    }

    // Each stage can't exceed the one before it.
    function logToCounts(log) {
        const applied = log.applied;
        const interview = Math.min(log.interview, applied);
        const offer = Math.min(log.offer, interview);
        const hired = Math.min(log.hired, offer);
        return {
            applied, interview, offer, hired,
            silence: applied - interview, noOffer: interview - offer, declined: offer - hired,
        };
    }

    let alive = false;
    let primaryAction = null;

    function mount(root) {
        alive = true;
        let busy = false;
        let mode = 'sim';          // 'sim' | 'mine'
        let resume = 'generic';
        let sim = emptyCounts();
        let log = loadLog();
        const untilRuns = [];

        // ---------- SVG tree ----------
        const NS = 'http://www.w3.org/2000/svg';
        const el = (tag, attrs = {}) => {
            const e = document.createElementNS(NS, tag);
            for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
            return e;
        };
        const svg = el('svg', { viewBox: '0 0 842 400', class: 'jobs-svg', role: 'img', 'aria-label': 'Application outcome tree' });
        const gGhost = el('g');
        const gLinks = el('g');
        const gNodes = el('g');
        const gTokens = el('g');
        svg.append(gGhost, gLinks, gNodes, gTokens);

        const edgePath = (a, b) => {
            const p = NODES[a], c = NODES[b];
            const x1 = p.x + W, y1 = p.y + H / 2, x2 = c.x, y2 = c.y + H / 2;
            const mx = (x1 + x2) / 2;
            return `M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`;
        };
        const links = {};
        const ghosts = {};
        for (const [a, b] of EDGES) {
            const d = edgePath(a, b);
            ghosts[b] = el('path', { d, class: 'jobs-ghost' });
            links[b] = el('path', { d, class: 'jobs-link', stroke: NODES[b].color });
            gGhost.append(ghosts[b]);
            gLinks.append(links[b]);
        }
        const nodeEls = {};
        for (const [id, n] of Object.entries(NODES)) {
            const g = el('g', { class: 'jobs-node', transform: `translate(${n.x} ${n.y})` });
            g.style.setProperty('--nc', n.color);
            g.append(el('rect', { width: W, height: H, rx: 9 }));
            g.append(el('rect', { width: 4, height: H - 16, x: 0, y: 8, rx: 2, class: 'jobs-node-bar' }));
            const title = el('text', { x: 14, y: 17, class: 'jobs-node-title' });
            title.textContent = n.label;
            const count = el('text', { x: 14, y: 39, class: 'jobs-node-count' });
            const pct = el('text', { x: W - 10, y: 39, class: 'jobs-node-pct', 'text-anchor': 'end' });
            const bench = el('text', { x: 14, y: H + 14, class: 'jobs-node-bench' });
            g.append(title, count, pct, bench);
            gNodes.append(g);
            nodeEls[id] = { g, title, count, pct, bench };
        }

        // Thickness on a square-root scale so 0.3% branches stay visible.
        const widthFor = share => (share > 0 ? 2 + 30 * Math.sqrt(share) : 0);

        function render() {
            const counts = mode === 'sim' ? sim : logToCounts(log);
            const total = counts.applied;
            const rate = mode === 'mine' && total
                ? (Math.min(log.tailored, total) * INTERVIEW.tailored + (total - Math.min(log.tailored, total)) * INTERVIEW.generic) / total
                : INTERVIEW[resume];
            const exp = expectedShares(rate);

            for (const [a, b] of EDGES) {
                ghosts[b].setAttribute('stroke-width', widthFor(exp[b]));
                links[b].setAttribute('stroke-width', total ? widthFor(counts[b] / total) : 0);
            }
            for (const id of Object.keys(NODES)) {
                const n = nodeEls[id];
                n.count.textContent = fmt.int(counts[id]);
                n.pct.textContent = total && id !== 'applied' ? pct(counts[id] / total) : '';
                n.g.classList.toggle('is-empty', counts[id] === 0);
                if (id === 'declined') n.title.textContent = mode === 'mine' ? 'Not accepted (yet)' : NODES.declined.label;
                if (id === 'applied') n.bench.textContent = '';
                else if (mode === 'mine') n.bench.textContent = total ? `typical: ${fmtExpected(exp[id] * total)}` : `typical: ${fmt.pct(exp[id])}`;
                else n.bench.textContent = `odds: ${fmt.pct(exp[id])}`;
            }
            renderSummary(counts, exp);
        }

        const fmtExpected = v => (v >= 10 ? fmt.int(v) : v >= 1 ? v.toFixed(1) : v.toFixed(2));

        // ---------- Tokens (the lottery tickets) ----------
        async function flyToken(leaf, delay) {
            await wait(delay);
            if (!alive) return;
            const route = ROUTES[leaf];
            const tok = el('g', { class: 'jobs-token' });
            tok.append(el('rect', { x: -7, y: -9, width: 14, height: 18, rx: 2 }),
                el('line', { x1: -4, y1: -4, x2: 4, y2: -4 }),
                el('line', { x1: -4, y1: 0, x2: 4, y2: 0 }),
                el('line', { x1: -4, y1: 4, x2: 2, y2: 4 }));
            gTokens.append(tok);
            const start = NODES.applied;
            tok.setAttribute('transform', `translate(${start.x + W} ${start.y + H / 2})`);
            for (let i = 1; i < route.length; i++) {
                const path = links[route[i]];
                const len = path.getTotalLength();
                await tween(i === 1 ? 520 : 420, ease.outQuad, p => {
                    const pt = path.getPointAtLength(p * len);
                    tok.setAttribute('transform', `translate(${pt.x} ${pt.y})`);
                });
                if (!alive) break;
                const id = route[i];
                sim[id]++;
                if (i === 1) sim.applied++;
                pulse(id);
                render();
                if (id === 'interview') sound.reveal(1);
                else if (id === 'offer') sound.reveal(3);
            }
            if (alive) {
                if (leaf === 'hired') { sound.reveal(4); burst(treeWrap, ['#d7261e', '#111111', '#bdbdbd'], 70); }
                else if (leaf === 'silence') sound.tone({ freq: 220, dur: 0.06, type: 'triangle', gain: 0.05 });
                else sound.thunk();
            }
            tok.classList.add('is-done');
            setTimeout(() => tok.remove(), 400);
        }

        function pulse(id) {
            const g = nodeEls[id].g;
            g.classList.remove('is-hit');
            void g.getBoundingClientRect();
            g.classList.add('is-hit');
        }

        // Send n applications. Interesting outcomes always get a token;
        // the long tail of silence is capped so 100 sends don't take a minute.
        async function send(n) {
            if (busy) return;
            busy = true;
            setMode('sim');
            syncButtons();
            sound.unlock();
            stats.record({ tries: n });

            const outcomes = Array.from({ length: n }, () => roll(resume));
            const MAX_TOKENS = 36;
            const loud = outcomes.filter(o => o !== 'silence');
            const quiet = outcomes.filter(o => o === 'silence');
            const animated = [...loud.slice(0, MAX_TOKENS), ...quiet.slice(0, Math.max(0, MAX_TOKENS - loud.length))]
                .sort(() => Math.random() - 0.5);
            const rest = outcomes.length - animated.length;
            const restLeaves = [...loud.slice(MAX_TOKENS), ...quiet.slice(Math.max(0, MAX_TOKENS - loud.length))];

            const gap = n === 1 ? 0 : Math.max(55, Math.min(260, 2600 / animated.length));
            await Promise.all(animated.map((o, i) => flyToken(o, i * gap)));

            if (alive && rest) {
                for (const leaf of restLeaves) addOutcome(sim, leaf);
                pulse('silence');
                render();
            }
            busy = false;
            syncButtons();
            if (alive) showResults(outcomes);
        }

        // Keep applying until someone says yes. Only the winning ticket flies.
        async function untilHired() {
            if (busy) return;
            busy = true;
            setMode('sim');
            syncButtons();
            sound.unlock();

            const tally = emptyCounts();
            let apps = 0;
            const CAP = 20000;
            let leaf;
            do { leaf = roll(resume); addOutcome(tally, leaf); apps++; } while (leaf !== 'hired' && apps < CAP);
            stats.record({ tries: apps });

            // Spin the counter up first, then fly the last ticket.
            const before = { ...sim };
            const shown = { ...tally };
            addOutcome(shown, leaf, -1);
            await tween(Math.min(2400, 500 + apps * 4), ease.outCubic, p => {
                for (const k of Object.keys(sim)) sim[k] = before[k] + Math.round(shown[k] * p);
                render();
                if (alive && Math.random() < 0.3) sound.tick();
            });
            for (const k of Object.keys(sim)) sim[k] = before[k] + shown[k];
            if (alive) await flyToken(leaf, 0);

            untilRuns.push({ apps, interviews: tally.interview, hired: leaf === 'hired', resume });
            busy = false;
            syncButtons();
            if (alive) showUntil(untilRuns[untilRuns.length - 1]);
        }

        // ---------- Controls ----------
        const resumeChips = ['generic', 'tailored'].map(r => h('button', {
            class: 'jobs-chip', type: 'button', 'data-r': r,
            onclick: () => { if (!busy) { resume = r; syncButtons(); render(); } },
        }, r === 'generic' ? `Generic resume · ${fmt.pct(INTERVIEW.generic)}` : `Tailored resume · ${fmt.pct(INTERVIEW.tailored)}`));

        const sendBtns = [1, 10, 100].map(n => h('button', {
            class: 'btn' + (n === 1 ? ' btn-primary' : ''), type: 'button', onclick: () => send(n),
        }, n === 1 ? 'Send 1 application' : `Send ${n}`));
        const untilBtn = h('button', { class: 'btn', type: 'button', onclick: untilHired }, 'Apply until hired');
        const clearBtn = h('button', { class: 'btn', type: 'button', onclick: () => { if (!busy) { sim = emptyCounts(); untilRuns.length = 0; results.hidden = true; render(); } } }, 'Clear');

        const tabs = [['sim', 'Lottery'], ['mine', 'My numbers']].map(([m, label]) => h('button', {
            class: 'jobs-tab', type: 'button', 'data-m': m, onclick: () => { if (!busy) setMode(m); },
        }, label));

        function syncButtons() {
            resumeChips.forEach(c => c.classList.toggle('is-active', c.dataset.r === resume));
            [...sendBtns, untilBtn, clearBtn, ...resumeChips].forEach(b => { b.disabled = busy; });
            tabs.forEach(t => t.classList.toggle('is-active', t.dataset.m === mode));
        }

        function setMode(m) {
            mode = m;
            simControls.hidden = m !== 'sim';
            logForm.hidden = m !== 'mine';
            if (m === 'mine') results.hidden = true;
            syncButtons();
            render();
        }

        // ---------- My numbers form ----------
        const inputs = {};
        const logWarn = h('p', { class: 'jobs-warn', hidden: true });
        const logForm = h('div', { class: 'jobs-log', hidden: true },
            h('div', { class: 'jobs-log-grid' }, LOG_FIELDS.map(f => {
                inputs[f.id] = h('input', {
                    type: 'number', min: '0', step: '1', inputmode: 'numeric', value: String(log[f.id]),
                    oninput: () => {
                        log[f.id] = Math.max(0, Math.floor(Number(inputs[f.id].value) || 0));
                        saveLog(log);
                        render();
                    },
                });
                return h('label', { class: 'jobs-field' }, h('span', {}, f.label), inputs[f.id]);
            })),
            logWarn,
            h('p', { class: 'jobs-log-note' }, 'Saved in this browser only. Nothing is sent anywhere.'));

        // ---------- Summary under the tree ----------
        const summary = h('div', { class: 'jobs-summary' });
        function renderSummary(counts, exp) {
            if (mode === 'sim') {
                summary.replaceChildren(
                    figure('Sent', fmt.int(counts.applied)),
                    figure('Interview rate', counts.applied ? pct(counts.interview / counts.applied) : '-'),
                    figure('Hires', fmt.int(counts.hired), counts.hired ? 'is-good' : ''),
                    figure('Expected hires', fmtExpected(exp.hired * counts.applied)));
                return;
            }
            const raw = log;
            const issues = [];
            if (raw.tailored > raw.applied) issues.push('tailored resumes');
            if (raw.interview > raw.applied) issues.push('interviews');
            if (raw.offer > Math.min(raw.interview, raw.applied)) issues.push('offers');
            if (raw.hired > Math.min(raw.offer, raw.interview, raw.applied)) issues.push('accepted');
            logWarn.hidden = !issues.length;
            logWarn.textContent = issues.length ? `Each stage can't be more than the one before it. Capped: ${issues.join(', ')}.` : '';

            if (!counts.applied) {
                summary.replaceChildren(h('p', { class: 'jobs-empty' }, 'Enter what you\'ve sent so far to see your own tree next to the typical one.'));
                return;
            }
            const ratio = exp.interview ? (counts.interview / counts.applied) / exp.interview : 0;
            summary.replaceChildren(
                figure('Your interview rate', pct(counts.interview / counts.applied), ratio >= 1 ? 'is-good' : ''),
                figure('Typical for your mix', fmt.pct(exp.interview)),
                figure('vs typical', counts.interview ? `${ratio.toFixed(1)}×` : '0×', ratio >= 1 ? 'is-good' : 'is-bad'),
                figure('Applications per offer', counts.offer ? fmt.int(counts.applied / counts.offer) : 'no offer yet'));
        }

        // ---------- Results ----------
        const results = h('div', { class: 'sim', hidden: true });

        function showResults(outcomes) {
            const n = outcomes.length;
            const c = leaf => outcomes.filter(o => o === leaf).length;
            const interviews = n - c('silence');
            const offers = c('hired') + c('declined');
            let headline;
            if (n === 1) {
                headline = {
                    silence: ['Nothing. ', h('b', {}, 'No reply'), ', like ', h('b', {}, fmt.pct(1 - INTERVIEW[resume])), ' of applications.'],
                    noOffer: ['You got an ', h('b', {}, 'interview'), '… and then a polite no.'],
                    declined: ['An ', h('b', {}, 'offer'), '! It didn\'t fit, so you turned it down.'],
                    hired: [h('b', {}, 'Hired.'), ` From a single application. That's a ${fmt.oneIn(expectedShares(INTERVIEW[resume]).hired)} ticket.`],
                }[outcomes[0]];
            } else {
                headline = [h('b', {}, fmt.int(n)), ' applications → ', h('b', {}, fmt.int(interviews)), ` interview${interviews === 1 ? '' : 's'} → `,
                    h('b', {}, fmt.int(offers)), ` offer${offers === 1 ? '' : 's'} → `, h('b', {}, fmt.int(c('hired'))), ' hired.'];
            }
            results.hidden = false;
            results.replaceChildren(h('div', { class: 'sim-headline' }, headline), bars(outcomes));
        }

        function bars(outcomes) {
            const max = Math.max(1, ...LEAVES.map(l => outcomes.filter(o => o === l).length));
            return h('div', { class: 'sim-bars' }, LEAVES.map(l => {
                const k = outcomes.filter(o => o === l).length;
                return h('div', { class: 'sim-bar', style: `--rc:${NODES[l].color}` },
                    h('span', { class: 'sim-bar-label' }, NODES[l].label),
                    h('span', { class: 'sim-bar-track' }, h('span', { class: 'sim-bar-fill', style: `width:${k ? Math.max(1.5, (k / max) * 100) : 0}%` })),
                    h('span', { class: 'sim-bar-count' }, fmt.int(k)));
            }));
        }

        function showUntil(run) {
            const avg = untilRuns.reduce((a, r) => a + r.apps, 0) / untilRuns.length;
            results.hidden = false;
            results.replaceChildren(
                h('div', { class: 'sim-headline' },
                    run.hired ? ['It took ', h('b', {}, fmt.int(run.apps)), ` applications and `, h('b', {}, fmt.int(run.interviews)), ` interview${run.interviews === 1 ? '' : 's'} to get hired.`]
                        : ['Still nothing after ', h('b', {}, fmt.int(run.apps)), ' applications. Stopped there.']),
                h('div', { class: 'sim-figures' },
                    figure('Runs', fmt.int(untilRuns.length)),
                    figure('Average applications', fmt.int(avg)),
                    figure('Luckiest', fmt.int(Math.min(...untilRuns.map(r => r.apps))), 'is-good'),
                    figure('Unluckiest', fmt.int(Math.max(...untilRuns.map(r => r.apps))), 'is-bad')),
                h('div', { class: 'jobs-runs' }, untilRuns.slice(-24).map(r => h('span', {
                    class: 'jobs-run' + (r.resume === 'tailored' ? ' is-tailored' : ''),
                    title: `${r.apps} applications, ${r.resume} resume`,
                    style: `--h:${Math.min(100, 8 + (r.apps / Math.max(...untilRuns.map(x => x.apps))) * 92)}%`,
                })))
            );
        }

        // ---------- Assemble ----------
        const treeWrap = h('div', { class: 'jobs-tree' }, h('div', { class: 'jobs-tree-scroll' }, svg));
        const simControls = h('div', { class: 'jobs-controls' },
            h('div', { class: 'jobs-chips' }, resumeChips),
            h('div', { class: 'actions' }, sendBtns, untilBtn, clearBtn));

        root.append(h('div', { class: 'split' },
            h('div', { class: 'split-main' },
                h('div', { class: 'jobs-stage' },
                    h('div', { class: 'jobs-tabs', role: 'tablist' }, tabs),
                    treeWrap,
                    h('div', { class: 'jobs-legend' },
                        h('span', {}, h('i', { class: 'jobs-key is-real' }), 'what happened'),
                        h('span', {}, h('i', { class: 'jobs-key is-ghost' }), 'typical odds'),
                        h('span', { class: 'jobs-legend-note' }, 'branch width on a square-root scale, so rare branches stay visible')),
                    summary),
                simControls,
                logForm,
                results),
            h('aside', { class: 'split-side' }, oddsPanel())));

        syncButtons();
        render();
        primaryAction = () => send(1);
    }

    function oddsPanel() {
        const g = expectedShares(INTERVIEW.generic);
        const t = expectedShares(INTERVIEW.tailored);
        const src = (href, text) => h('a', { href, target: '_blank', rel: 'noopener' }, text);
        return h('section', { class: 'panel' },
            h('h3', { class: 'panel-title' }, 'Odds per application'),
            h('table', { class: 'odds-table' },
                h('thead', {}, h('tr', {}, h('th', {}, 'Reach'), h('th', {}, 'Generic'), h('th', {}, 'Tailored'))),
                h('tbody', {}, ['interview', 'offer', 'hired'].map(id => h('tr', {},
                    h('td', {}, h('span', { class: 'dot', style: `background:${NODES[id].color}` }), NODES[id].label),
                    h('td', { class: 'num' }, fmt.oneIn(g[id])),
                    h('td', { class: 'num' }, fmt.oneIn(t[id])))))),
            h('div', { class: 'panel-note' },
                h('p', {}, 'Interview: ', h('b', {}, fmt.pct(INTERVIEW.generic)), ' with a generic resume, ', h('b', {}, fmt.pct(INTERVIEW.tailored)),
                    ' tailored. ', src('https://huntr.co/research/job-search-trends-q2-2026', 'Huntr, Q2 2026'), ', ~2M applications.'),
                h('p', {}, 'Hire: open roles get ', h('b', {}, `${APPS_PER_HIRE}+`), ' applications per hire. ',
                    src('https://www.hrdive.com/news/recruiters-see-job-applications-triple-to-more-than-300-per-role/820096/', 'Ashby via HR Dive, May 2026'), '.'),
                h('p', {}, 'Accept: ', h('b', {}, fmt.pct(ACCEPT)), ' of offers are accepted. ',
                    src('https://vercel.gem.com/blog/10-takeaways-from-the-2025-recruiting-benchmarks-report', 'Gem 2025 benchmarks'), '.'),
                h('p', {}, 'Interview → offer (', h('b', {}, fmt.pct(OFFER)), ') isn\'t published anywhere. It\'s derived so the generic chain comes out to 1 hire per 300, and it\'s assumed the same for tailored resumes.'),
                h('p', {}, 'These are averages over everyone, including mass auto-applies. Gem found a candidate a recruiter reaches out to is ',
                    h('b', {}, '5×'), ' more likely to be hired than one who applies cold.')));
    }

    Lottery.register({
        id: 'jobs',
        name: 'Job Hunt',
        kicker: 'Lottery 08 · the one you\'re in right now',
        tagline: 'Every application is a ticket. Send a few and watch where they land.',
        headline: { label: 'Chance one application gets you hired', p: expectedShares(INTERVIEW.generic).hired },
        mount,
        unmount() { alive = false; },
        primary: () => primaryAction?.(),
    });
})();
