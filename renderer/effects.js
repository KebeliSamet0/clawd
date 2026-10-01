// Visual extras drawn over the pet: a speech bubble and small particle bursts.
// None of it takes mouse input (pointer-events: none in style.css).
// fx.level: 'full', 'min' (a couple of particles, no wobble) or 'off'.

(() => {
    const layer = document.getElementById('fx');
    const bubble = document.getElementById('bubble');
    const bubbleText = document.getElementById('bubble-text');
    const image = document.getElementById('pet-img');

    // Positions are % of the window (the pet stands in its lower middle);
    // offsets are px at the medium size (176) and scale with the window.
    const BURSTS = {
        hearts: { glyphs: ['♥'], colors: ['#ff5c8a', '#ff8fab'], count: 5, at: [50, 58], dx: [-25, 25], dy: [-70, -40] },
        stars: { glyphs: ['★', '✦'], colors: ['#ffd23f', '#fff3a3'], count: 6, at: [50, 55], dx: [-45, 45], dy: [-35, -5] },
        confetti: {
            glyphs: ['■', '▲', '●'],
            colors: ['#d97757', '#ffd23f', '#5ec2ff', '#7be07b', '#ff8fab'],
            count: 14, at: [50, 60], dx: [-75, 75], dy: [-65, 35],
        },
        dust: { glyphs: ['●'], colors: ['#c9b9a6', '#e0d6c8'], count: 6, at: [50, 90], dx: [-55, 55], dy: [-18, -4] },
        fire: { glyphs: ['🔥'], count: 5, at: [62, 66], dx: [8, 45], dy: [-60, -25] },
        sparks: { glyphs: ['✦', '⚡'], colors: ['#ffd23f'], count: 5, at: [50, 55], dx: [-40, 40], dy: [-50, -15] },
    };

    const pick = (list) => list[Math.floor(Math.random() * list.length)];
    const between = ([min, max]) => min + Math.random() * (max - min);

    let sticky = null;     // text that stays until replaced (reminder, permission prompt)
    let sayTimer = null;
    let poseTimer = null;

    function show(text) {
        bubbleText.textContent = text || '';
        bubble.classList.toggle('show', Boolean(text));
    }

    function pose(name, ms) {
        clearTimeout(poseTimer);
        image.classList.remove('wobble', 'bounce');
        if (!name || fx.level !== 'full') return;
        void image.offsetWidth;  // restart the CSS animation
        image.classList.add(name);
        poseTimer = setTimeout(() => image.classList.remove(name), ms);
    }

    window.fx = {
        level: 'full',

        burst(kind) {
            const spec = BURSTS[kind];
            if (!spec || fx.level === 'off') return;
            const scale = window.innerWidth / 176;
            const count = fx.level === 'min' ? Math.min(2, spec.count) : spec.count;
            for (let i = 0; i < count; i++) {
                const p = document.createElement('span');
                p.className = 'particle';
                p.textContent = pick(spec.glyphs);
                p.style.left = `${spec.at[0]}%`;
                p.style.top = `${spec.at[1]}%`;
                p.style.color = spec.colors ? pick(spec.colors) : '';
                p.style.fontSize = `${Math.round(between([9, 15]) * scale)}px`;
                p.style.setProperty('--dx', `${Math.round(between(spec.dx) * scale)}px`);
                p.style.setProperty('--dy', `${Math.round(between(spec.dy) * scale)}px`);
                p.style.setProperty('--rot', `${Math.round(between([-180, 180]))}deg`);
                p.style.animationDuration = `${Math.round(between([700, 1300]))}ms`;
                p.style.animationDelay = `${Math.round(between([0, 200]))}ms`;
                p.addEventListener('animationend', () => p.remove());
                layer.appendChild(p);
            }
        },

        // Show a line for a moment, then go back to the sticky text (if any).
        say(text, ms = 2500) {
            clearTimeout(sayTimer);
            show(text);
            sayTimer = setTimeout(() => {
                sayTimer = null;
                show(sticky);
            }, ms);
        },

        // Text that stays up while it matters and cuts off any passing line;
        // null clears it (after a passing line, if one is showing).
        sticky(text) {
            if (text === sticky) return;
            sticky = text;
            if (text) {
                clearTimeout(sayTimer);
                sayTimer = null;
                show(text);
            } else if (!sayTimer) {
                show(null);
            }
        },

        // Drop particles and poses, e.g. when an important message comes up.
        clear() {
            layer.replaceChildren();
            pose(null);
        },

        wobble: (ms = 3000) => pose('wobble', ms),
        bounce: () => pose('bounce', 900),
    };
})();
