// Tab switching
const loginTab = document.getElementById('login-tab');
const createAccountTab = document.getElementById('create-account-tab');
const logonForm = document.getElementById('logon-form');
const createAccountForm = document.getElementById('create-account-form');
const messageEl = document.getElementById('message');
const loginSubmit = document.getElementById('login-submit');
const createSubmit = document.getElementById('create-submit');

function showLoginTab(clearMessage = true) {
    logonForm.classList.add('active-form');
    createAccountForm.classList.remove('active-form');
    logonForm.setAttribute('aria-hidden', 'false');
    createAccountForm.setAttribute('aria-hidden', 'true');
    loginTab.classList.add('active');
    createAccountTab.classList.remove('active');
    loginTab.setAttribute('aria-selected', 'true');
    createAccountTab.setAttribute('aria-selected', 'false');
    if (clearMessage) {
        messageEl.textContent = '';
        messageEl.classList.remove('error', 'success');
    }
    document.getElementById('login-email')?.focus();
}

function showCreateTab() {
    createAccountForm.classList.add('active-form');
    logonForm.classList.remove('active-form');
    createAccountForm.setAttribute('aria-hidden', 'false');
    logonForm.setAttribute('aria-hidden', 'true');
    createAccountTab.classList.add('active');
    loginTab.classList.remove('active');
    createAccountTab.setAttribute('aria-selected', 'true');
    loginTab.setAttribute('aria-selected', 'false');
    messageEl.textContent = '';
    messageEl.classList.remove('error', 'success');
    document.getElementById('create-email')?.focus();
}

loginTab.addEventListener('click', () => showLoginTab(true));

createAccountTab.addEventListener('click', showCreateTab);

function wirePasswordToggle(toggleBtn, input) {
    if (!toggleBtn || !input) return;
    toggleBtn.addEventListener('click', () => {
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        toggleBtn.textContent = show ? 'Hide' : 'Show';
        toggleBtn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        toggleBtn.setAttribute('aria-pressed', show ? 'true' : 'false');
    });
}

wirePasswordToggle(document.getElementById('login-password-toggle'), document.getElementById('login-password'));
wirePasswordToggle(document.getElementById('create-password-toggle'), document.getElementById('create-password'));

logonForm.setAttribute('aria-hidden', 'false');
createAccountForm.setAttribute('aria-hidden', 'true');

// Logon form submission
logonForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    loginSubmit.disabled = true;
    const prevLabel = loginSubmit.textContent;
    loginSubmit.textContent = 'Signing in…';

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        const result = await response.json();
        if (response.ok) {
            loginSubmit.textContent = 'Success — redirecting…';
            localStorage.setItem('jwtToken', result.token);
            window.location.href = '/dashboard';
            return;
        }
        messageEl.textContent = result.message || 'Could not sign in.';
        messageEl.classList.remove('success');
        messageEl.classList.add('error');
    } catch (error) {
        console.error('Error:', error);
        messageEl.textContent = 'An error occurred. Please try again later.';
        messageEl.classList.remove('success');
        messageEl.classList.add('error');
    } finally {
        loginSubmit.disabled = false;
        loginSubmit.textContent = prevLabel;
    }
});

// Create account form submission
createAccountForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.getElementById('create-email').value;
    const password = document.getElementById('create-password').value;

    createSubmit.disabled = true;
    const prevLabel = createSubmit.textContent;
    createSubmit.textContent = 'Creating account…';

    try {
        const response = await fetch('/api/create-account', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        const result = await response.json();
        if (response.ok) {
            document.getElementById('login-email').value = email;
            document.getElementById('login-password').value = password;
            showLoginTab(false);
            messageEl.textContent = 'Account created! You can sign in below.';
            messageEl.classList.remove('error');
            messageEl.classList.add('success');
        } else {
            messageEl.textContent = result.message || 'Could not create account.';
            messageEl.classList.remove('success');
            messageEl.classList.add('error');
        }
    } catch (error) {
        console.error('Error:', error);
        messageEl.textContent = 'An error occurred. Please try again later.';
        messageEl.classList.remove('success');
        messageEl.classList.add('error');
    } finally {
        createSubmit.disabled = false;
        createSubmit.textContent = prevLabel;
    }
});

/** Minimum stacked posters per column for a continuous, tall strip */
const MARQUEE_MIN_CELLS_PER_COLUMN = 14;

/**
 * Split poster URLs into 4 columns (same idea as React ThreeDMarquee).
 */
function chunkPostersIntoFour(images) {
    const list = images.filter(Boolean);
    if (list.length === 0) return [[], [], [], []];
    const chunkSize = Math.ceil(list.length / 4);
    const chunks = [[], [], [], []];
    for (let c = 0; c < 4; c++) {
        const start = c * chunkSize;
        chunks[c] = list.slice(start, start + chunkSize);
        if (chunks[c].length === 0) {
            chunks[c] = [list[c % list.length]];
        }
    }
    return chunks;
}

/** Rotate so each column starts on a different poster (less repetition across columns). */
function rotateArray(arr, offset) {
    if (!arr.length) return arr;
    const o = ((offset % arr.length) + arr.length) % arr.length;
    return arr.slice(o).concat(arr.slice(0, o));
}

/**
 * Repeat a column’s unique posters until the stack is tall enough for a continuous look.
 */
function tileColumnForContinuity(urls, minCells, columnIndex) {
    if (!urls.length) return [];
    const base = rotateArray(urls, columnIndex * 3);
    const out = [];
    let i = 0;
    while (out.length < minCells) {
        out.push(base[i % base.length]);
        i += 1;
    }
    return out;
}

function initHeroMarquee() {
    const root = document.getElementById('heroMarquee');
    const heroBg = document.getElementById('heroBg');
    if (!root) return;

    fetch('/api/public/hero-posters')
        .then((r) => r.json())
        .then((j) => {
            let posters = Array.isArray(j.posters) ? j.posters : [];
            if (posters.length < 8) {
                posters = posters.concat(posters);
            }
            if (posters.length < 4) return;

            const chunks = chunkPostersIntoFour(posters);

            const stage = document.createElement('div');
            stage.className = 'marquee-stage';

            const scale = document.createElement('div');
            scale.className = 'marquee-scale';

            const grid = document.createElement('div');
            grid.className = 'marquee-grid-3d';

            chunks.forEach((subarray, colIndex) => {
                const col = document.createElement('div');
                col.className =
                    'marquee-col ' +
                    (colIndex % 2 === 0 ? 'marquee-col--even' : 'marquee-col--odd');

                const tiled = tileColumnForContinuity(
                    subarray,
                    MARQUEE_MIN_CELLS_PER_COLUMN,
                    colIndex
                );

                tiled.forEach((src, imageIndex) => {
                    const cell = document.createElement('div');
                    cell.className = 'marquee-cell';
                    const img = document.createElement('img');
                    img.src = src;
                    img.alt = '';
                    img.loading = imageIndex < 8 ? 'eager' : 'lazy';
                    img.decoding = 'async';
                    img.width = 970;
                    img.height = 700;
                    cell.appendChild(img);
                    col.appendChild(cell);
                });
                grid.appendChild(col);
            });

            scale.appendChild(grid);
            stage.appendChild(scale);
            root.appendChild(stage);
        })
        .catch(() => {})
        .finally(() => {
            heroBg?.classList.remove('hero-bg--loading');
        });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHeroMarquee);
} else {
    initHeroMarquee();
}