// Mini-games inside the pet's own window (right-click → Main):
//  - suit: rock-paper-scissors, first to two round wins;
//  - tebak: guess which hand holds the gift;
//  - serangga: squash as many bugs as you can in 15 seconds.
// behavior.js keeps tricks and reminders out of the way while one runs
// (window.clawd.setGame) and keeps the results (window.clawd.stats).

(() => {
    const layer = document.getElementById('game');

    const RESULT_FOR = 3500;   // ms the final result stays up
    const ROUND_PAUSE = 1600;  // ms between rock-paper-scissors rounds
    const BUG_TIME = 15000;
    const BUG_EVERY = 650;
    const BUG_LIFE = 1100;
    const BUGS = ['🐞', '🪲', '🦟'];
    // Batu, kertas, gunting: each one beats the one before it (wrapping round).
    const HANDS = ['✊', '✋', '✌️'];
    const beats = (a, b) => (a - b + 3) % 3 === 1;

    let current = null;  // name of the running game
    let timers = [];

    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    const clearLayer = () => layer.replaceChildren();
    const show = (state, prompt) => window.clawd.setGame({ state, prompt });
    const count = (name, key) => window.clawd.stats(name, (s) => { s[key] = (s[key] || 0) + 1; });

    function add(tag, className, text, x, y) {
        const el = document.createElement(tag);
        el.className = className;
        el.textContent = text;
        if (x !== undefined) {
            el.style.left = `${x}%`;
            el.style.top = `${y}%`;
        }
        layer.appendChild(el);
        return el;
    }

    function button(text, x, y, onClick, className = 'choice') {
        const b = add('button', className, text, x, y);
        b.addEventListener('click', (e) => {
            e.stopPropagation();
            onClick(b);
        });
        return b;
    }

    function stop() {
        timers.forEach(clearTimeout);
        timers = [];
        clearLayer();
        layer.classList.remove('on');
        if (!current) return;
        current = null;
        window.clawd.setGame(null);
    }

    function begin(name, state, prompt) {
        stop();
        current = name;
        layer.classList.add('on');
        show(state, prompt);
    }

    const GAMES = {
        suit() {
            const score = { you: 0, me: 0 };
            const round = () => {
                clearLayer();
                show('thinking', `Suit! ${score.you}–${score.me} · pilih 👇`);
                HANDS.forEach((hand, i) => button(hand, 20 + i * 30, 52, () => play(i)));
            };
            const over = () => {
                clearLayer();
                add('div', 'banner', `${score.you} – ${score.me}`);
                if (score.you === 2) {
                    const stats = count('suit', 'win');
                    window.clawd.react('react-annoyed', { label: 'Kalah suit', burst: 'confetti', ms: 2500 });
                    show('idle', `Kamu juara! 🏆 (menang ${stats.win}×)`);
                } else {
                    const stats = count('suit', 'lose');
                    window.clawd.react('happy', { label: 'Menang suit', burst: 'stars', ms: 2500 });
                    show('idle', `Aku juara! 😎 (kamu kalah ${stats.lose}×)`);
                }
                later(stop, RESULT_FOR);
            };
            const play = (you) => {
                clearLayer();
                const me = Math.floor(Math.random() * HANDS.length);
                add('div', 'banner', `${HANDS[you]} vs ${HANDS[me]}`);
                if (you === me) {
                    window.clawd.react('react-double', { label: 'Seri', ms: ROUND_PAUSE });
                    show('idle', 'Seri! Lagi...');
                } else if (beats(you, me)) {
                    score.you += 1;
                    window.clawd.react('react-annoyed', { label: 'Kalah ronde', ms: ROUND_PAUSE });
                    show('idle', `Yah, ronde ini punya kamu (${score.you}–${score.me})`);
                } else {
                    score.me += 1;
                    window.clawd.react('happy', { label: 'Menang ronde', ms: ROUND_PAUSE });
                    show('idle', `Hehe, ronde ini punyaku (${score.you}–${score.me})`);
                }
                later(score.you === 2 || score.me === 2 ? over : round, ROUND_PAUSE);
            };
            begin('suit', 'thinking', 'Suit!');
            round();
        },

        tebak() {
            const gift = Math.random() < 0.5 ? 'left' : 'right';
            const guess = (side) => {
                clearLayer();
                const right = side === gift;
                add('div', 'prize', '🎁', gift === 'left' ? 12 : 88, 40);
                window.clawd.react(gift === 'left' ? 'react-left' : 'react-right', {
                    label: 'Buka tangan',
                    burst: right ? 'confetti' : undefined,
                    ms: 2500,
                });
                const stats = count('tebak', right ? 'win' : 'lose');
                show('idle', right ? `Betul! 🎁 (${stats.win}× benar)` : 'Salah, di sini! 😜');
                later(stop, RESULT_FOR);
            };
            begin('tebak', 'idle', 'Hadiahnya di tangan mana? 🎁');
            button('👈', 14, 62, () => guess('left'));
            button('👉', 86, 62, () => guess('right'));
        },

        serangga() {
            const startedAt = Date.now();
            let score = 0;
            const status = () => {
                const left = Math.max(0, Math.ceil((BUG_TIME - (Date.now() - startedAt)) / 1000));
                show('idle-look', `Tepuk serangganya! 🐞 ${score} · ${left}s`);
            };
            const over = () => {
                clearLayer();
                const best = window.clawd.stats('serangga').best || 0;
                window.clawd.stats('serangga', (s) => {
                    s.played = (s.played || 0) + 1;
                    s.best = Math.max(best, score);
                });
                add('div', 'banner', `🐞 ${score}`);
                if (score > best) {
                    window.clawd.react('happy', { label: 'Rekor baru', burst: 'confetti', ms: 2500 });
                    show('idle', `Rekor baru! ${score} serangga 🏆`);
                } else {
                    window.clawd.react('react-double-jump', { label: 'Selesai main', ms: 2500 });
                    show('idle', `Skor ${score} (rekor ${best}) — lagi?`);
                }
                later(stop, RESULT_FOR);
            };
            const spawn = () => {
                if (Date.now() - startedAt >= BUG_TIME) {
                    over();
                    return;
                }
                const bug = button(BUGS[Math.floor(Math.random() * BUGS.length)],
                    12 + Math.random() * 76, 34 + Math.random() * 52, (el) => {
                        score += 1;
                        el.disabled = true;
                        el.textContent = '💥';
                        el.classList.add('hit');
                        status();
                    }, 'bug');
                later(() => bug.remove(), BUG_LIFE);
                status();
                later(spawn, BUG_EVERY);
            };
            begin('serangga', 'idle-look', 'Siap-siap... 🐞');
            later(spawn, 800);
        },
    };

    window.games = {
        start(name) {
            if (GAMES[name]) GAMES[name]();
        },
        stop,
        active: () => Boolean(current),
    };
})();
