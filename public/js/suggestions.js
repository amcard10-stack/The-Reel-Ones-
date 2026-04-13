//////////////////////////////////////////////////////////////
// SUGGESTIONS.JS
//////////////////////////////////////////////////////////////

function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

const TMDB_POSTER_W154 = 'https://image.tmdb.org/t/p/w154';

/** TMDB watch provider ids — aligned with server subscription map. */
const PICK_STREAMING_PILLS = [
    { id: '8', label: 'Netflix' },
    { id: '9', label: 'Prime Video' },
    { id: '15', label: 'Hulu' },
    { id: '337', label: 'Disney+' },
    { id: '384', label: 'Max' },
];

const SUBSCRIPTION_KEY_TO_PROVIDER_ID = {
    netflix: '8',
    prime: '9',
    amazon: '9',
    hulu: '15',
    disney: '337',
    max: '384',
};

function posterKey(title, type) {
    return `${title}|${type === 'show' ? 'show' : 'movie'}`;
}

function posterMarkup(posterPath, title) {
    if (!posterPath) {
        return '<div class="suggestion-poster-ph" aria-hidden="true"></div>';
    }
    const src = `${TMDB_POSTER_W154}${posterPath}`;
    return `<img class="suggestion-poster" src="${escapeHtml(src)}" alt="${escapeHtml(title)}" loading="lazy">`;
}

function recommendationCardHtml(item, posterPath, extraLine, buttonHtml) {
    const t = item.type === 'show' ? 'TV Show' : 'Movie';
    return `
        <div class="recommendation-card recommendation-card--with-poster">
            <div class="recommendation-card__poster">${posterMarkup(posterPath, item.title)}</div>
            <div class="recommendation-card__content">
                <h3>${escapeHtml(item.title)}</h3>
                <p>${escapeHtml(extraLine(t))}</p>
                ${buttonHtml}
            </div>
        </div>`;
}

function setupPickRandom() {
    const btn = document.getElementById('pickRandomBtn');
    const out = document.getElementById('pickResult');
    const segment = document.getElementById('pickTypeSegment');
    const subCheck = document.getElementById('pickRequireSubscription');

    function getPickType() {
        const active = segment?.querySelector('.pick-segment-btn.is-active');
        const t = active?.dataset?.pickType || 'all';
        return t === 'movie' || t === 'show' ? t : 'all';
    }

    function getSelectedGenreIds() {
        return [...document.querySelectorAll('.pick-genre-pill.is-selected')]
            .map((b) => parseInt(b.dataset.genreId, 10))
            .filter((n) => !isNaN(n));
    }

    function getSelectedProviderIds() {
        return [...document.querySelectorAll('.pick-provider-pill.is-selected')]
            .map((b) => b.dataset.providerId)
            .filter(Boolean);
    }

    async function refreshGenrePills() {
        const row = document.getElementById('pickGenreRow');
        const wrap = document.getElementById('pickGenrePills');
        const hint = document.getElementById('pickGenreHint');
        if (!row || !wrap) return;

        const t = getPickType();
        if (t === 'all') {
            row.hidden = true;
            wrap.innerHTML = '';
            return;
        }

        row.hidden = false;
        if (hint) {
            hint.textContent = t === 'movie' ? 'Movie genres (optional).' : 'TV genres (optional).';
        }
        wrap.innerHTML = '<p class="pick-pill-loading">Loading genres…</p>';

        const genres = await DataModel.getTmdbGenres(t === 'show' ? 'show' : 'movie');
        if (!genres.length) {
            wrap.innerHTML = '<p class="empty-message">Could not load genres.</p>';
            return;
        }

        wrap.innerHTML = genres
            .map(
                (g) =>
                    `<button type="button" class="pick-pill pick-genre-pill" data-genre-id="${g.id}" aria-pressed="false">${escapeHtml(g.name)}</button>`
            )
            .join('');

        wrap.querySelectorAll('.pick-genre-pill').forEach((pill) => {
            pill.addEventListener('click', () => {
                const on = !pill.classList.contains('is-selected');
                pill.classList.toggle('is-selected', on);
                pill.setAttribute('aria-pressed', on ? 'true' : 'false');
            });
        });
    }

    function renderProviderPills() {
        const wrap = document.getElementById('pickProviderPills');
        if (!wrap || wrap.dataset.ready === '1') return;
        wrap.dataset.ready = '1';
        wrap.innerHTML = PICK_STREAMING_PILLS.map(
            (p) =>
                `<button type="button" class="pick-pill pick-provider-pill" data-provider-id="${escapeHtml(p.id)}" aria-pressed="false">${escapeHtml(p.label)}</button>`
        ).join('');
        wrap.querySelectorAll('.pick-provider-pill').forEach((pill) => {
            pill.addEventListener('click', () => {
                const on = !pill.classList.contains('is-selected');
                pill.classList.toggle('is-selected', on);
                pill.setAttribute('aria-pressed', on ? 'true' : 'false');
            });
        });
    }

    renderProviderPills();

    if (segment) {
        segment.querySelectorAll('.pick-segment-btn').forEach((b) => {
            b.addEventListener('click', () => {
                segment.querySelectorAll('.pick-segment-btn').forEach((x) => {
                    const on = x === b;
                    x.classList.toggle('is-active', on);
                    x.setAttribute('aria-pressed', on ? 'true' : 'false');
                });
                refreshGenrePills();
            });
        });
    }

    document.getElementById('pickApplySubscriptionsBtn')?.addEventListener('click', async () => {
        const keys = await DataModel.getSubscriptions();
        if (!Array.isArray(keys) || keys.length === 0) {
            alert('No saved services found. Add them on the Subscriptions page.');
            return;
        }
        document.querySelectorAll('.pick-provider-pill').forEach((pill) => {
            pill.classList.remove('is-selected');
            pill.setAttribute('aria-pressed', 'false');
        });
        keys.forEach((raw) => {
            const k = String(raw).toLowerCase().trim();
            let pid = SUBSCRIPTION_KEY_TO_PROVIDER_ID[k];
            if (!pid && k.includes('netflix')) pid = '8';
            else if (!pid && k.includes('hulu')) pid = '15';
            else if (!pid && (k.includes('disney'))) pid = '337';
            else if (!pid && (k.includes('prime') || k.includes('amazon'))) pid = '9';
            else if (!pid && (k.includes('max') || k.includes('hbo'))) pid = '384';
            if (!pid) return;
            const btn = document.querySelector(`.pick-provider-pill[data-provider-id="${pid}"]`);
            if (btn) {
                btn.classList.add('is-selected');
                btn.setAttribute('aria-pressed', 'true');
            }
        });
    });

    refreshGenrePills();

    if (!btn || !out) return;

    btn.addEventListener('click', async () => {
        btn.disabled = true;
        out.innerHTML = '<p class="section-hint">Choosing…</p>';
        const res = await DataModel.getRandomWatchlistPick({
            type: getPickType(),
            requireSubscriptionMatch: Boolean(subCheck?.checked),
            genreIds: getSelectedGenreIds(),
            providerIds: getSelectedProviderIds(),
        });
        btn.disabled = false;

        if (!res) {
            out.innerHTML = '<p class="empty-message">Could not load a pick. Try again.</p>';
            return;
        }
        if (!res.pick) {
            out.innerHTML = `<p class="empty-message">${escapeHtml(res.message || 'Nothing to pick.')}</p>`;
            return;
        }

        const p = res.pick;
        const typeLabel = p.type === 'show' ? 'TV Show' : 'Movie';
        const subscriptionNames = (p.streamingProviders || []).map((x) => x.provider_name).filter(Boolean);
        let providerLabel = 'Streaming';
        let names = subscriptionNames;
        if (names.length === 0 && Array.isArray(p.allProviders) && p.allProviders.length > 0) {
            names = p.allProviders;
            providerLabel = 'Available on';
        }

        let streamingBlock = '';
        if (names.length > 0) {
            streamingBlock = `
                <p class="streaming-label">${escapeHtml(providerLabel)}</p>
                <ul class="streaming-list">
                    ${names.map((name) => `<li>${escapeHtml(name)}</li>`).join('')}
                </ul>`;
        } else {
            streamingBlock =
                '<p class="pick-note">No streaming or rental availability was found for this title in the current region lookup.</p>';
        }

        const posterCol = `<div class="pick-card__poster">${posterMarkup(p.posterPath, p.title)}</div>`;
        out.innerHTML = `
            <div class="pick-card pick-card--with-poster">
                ${posterCol}
                <div class="pick-card__body">
                    <h3>${escapeHtml(p.title)}</h3>
                    <p class="pick-meta">${typeLabel}</p>
                    ${streamingBlock}
                </div>
            </div>`;
    });
}

document.addEventListener('DOMContentLoaded', () => {

    const token = localStorage.getItem('jwtToken');

    if (!token) {
        window.location.href = '/';
        return;
    } else {
        DataModel.setToken(token);
    }

    const logoutButton = document.getElementById('logoutButton');

    logoutButton.addEventListener('click', () => {
        localStorage.removeItem('jwtToken');
        window.location.href = '/';
    });

    setupPickRandom();
    loadSuggestions();
});

async function loadSuggestions() {
    const data = await DataModel.getSuggestions();
    if (!data) {
        document.getElementById('ratingsSummary').textContent = 'Unable to load suggestions.';
        return;
    }

    // Ratings summary
    const summaryEl = document.getElementById('ratingsSummary');
    if (data.ratingsCount > 0) {
        summaryEl.textContent = `You've rated ${data.ratingsCount} title${data.ratingsCount === 1 ? '' : 's'}. More ratings = better recommendations!`;
    } else {
        summaryEl.textContent = 'Rate movies and shows to get personalized recommendations.';
    }

    const toRate = data.toRate || [];
    const recommendations = data.recommendations || [];
    const posterItems = [
        ...toRate.map((i) => ({ title: i.title, type: i.type })),
        ...recommendations.map((i) => ({ title: i.title, type: i.type })),
    ];
    const posterMap = await DataModel.getPostersForItems(posterItems);

    // To-rate list (from watch history)
    const toRateList = document.getElementById('toRateList');
    if (toRate.length > 0) {
        toRateList.innerHTML = toRate.map((item) => {
            const path = posterMap[posterKey(item.title, item.type)];
            return recommendationCardHtml(
                item,
                path,
                (typeLabel) => typeLabel,
                '<a href="/ratings" class="primary">Rate Now</a>'
            );
        }).join('');
    } else {
        document.getElementById('toRateSection').style.display = 'none';
    }

    // Recommendations (from other users' high ratings)
    const recList = document.getElementById('recommendationsList');
    if (recommendations.length > 0) {
        recList.innerHTML = recommendations.map((item) => {
            const path = posterMap[posterKey(item.title, item.type)];
            return recommendationCardHtml(
                item,
                path,
                (typeLabel) => `${typeLabel} · Avg ${item.avgRating}★`,
                '<a href="/ratings" class="primary">Rate It</a>'
            );
        }).join('');
    } else {
        recList.innerHTML = '<p class="empty-message">Rate more titles to see personalized recommendations!</p>';
    }
}