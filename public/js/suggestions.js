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
            <div class="recommendation-card__main">
                <div class="recommendation-card__poster">${posterMarkup(posterPath, item.title)}</div>

                <div class="recommendation-card__content">
                    <h3>${escapeHtml(item.title)}</h3>
                    <p class="recommendation-meta">${escapeHtml(extraLine(t))}</p>
                    <div class="recommendation-card__top-actions">
                        ${buttonHtml || ''}
                    </div>
                </div>
            </div>
        </div>
    `;
}

// interested, not interested, add to list buttons for each recommendation card
function recommendationActionsHtml(item) {
    const safeTitle = escapeHtml(item.title);
    const safeType = escapeHtml(item.type === 'show' ? 'show' : 'movie');

    return `
        <div class="recommendation-actions" data-title="${safeTitle}" data-type="${safeType}">
            <button type="button" class="suggestion-btn suggestion-btn--interested" data-action="interested">
                Interested
            </button>
            <button type="button" class="suggestion-btn suggestion-btn--not-interested" data-action="not_interested">
                Not Interested
            </button>
            <button type="button" class="suggestion-btn suggestion-btn--add-to-list" data-action="add_to_list">
                Add to My List
            </button>
            <div class="add-to-list-panel" hidden>
                <p class="add-to-list-panel__title">Choose a list to add it to</p>
                <div class="add-to-list-panel__content"></div>
            </div>
        </div>
    `;
}

async function openAddToListPanel(actionsWrap, title, type) {
    const panel = actionsWrap.querySelector('.add-to-list-panel');
    const content = actionsWrap.querySelector('.add-to-list-panel__content');
    if (!panel || !content) return;

    panel.hidden = false;
    content.innerHTML = '<p class="section-hint">Loading lists…</p>';

    const lists = await DataModel.getLists();

    if (!lists || lists.length === 0) {
        content.innerHTML = `
            <p class="empty-message">You don’t have any lists yet.</p>
            <p class="section-hint">Go create one on your Lists page first.</p>
        `;
        return;
    }

    content.innerHTML = lists.map((list) => `
        <button type="button" class="list-choice-btn" data-list-id="${list.id}">
            ${escapeHtml(list.name)}
        </button>
    `).join('');

    content.querySelectorAll('.list-choice-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const listId = btn.dataset.listId;
            btn.disabled = true;
            btn.textContent = 'Adding…';

            const result = await DataModel.addToList(listId, title);

            if (result.ok) {
                content.innerHTML = `<p class="section-hint">Added to list.</p>`;
            } else {
                const msg = result?.data?.message || 'Could not add to list.';
                content.innerHTML = `<p class="empty-message">${escapeHtml(msg)}</p>`;
            }
        });
    });
}

function wireRecommendationActions() {
    document.querySelectorAll('.recommendation-actions').forEach((actionsWrap) => {
        if (actionsWrap.dataset.wired === '1') return;
        actionsWrap.dataset.wired = '1';

        const title = actionsWrap.dataset.title || '';
        const type = actionsWrap.dataset.type === 'show' ? 'show' : 'movie';

        actionsWrap.querySelectorAll('.suggestion-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const action = btn.dataset.action;
                const card = actionsWrap.closest('.recommendation-card');

                if (action === 'interested') {
                    btn.disabled = true;
                    const result = await DataModel.saveSuggestionAction(title, type, 'interested');
                    btn.disabled = false;

                    if (result.ok) {
                        btn.textContent = 'Saved';
                    } else {
                        alert(result?.data?.message || 'Could not save as interested.');
                    }
                    return;
                }

                if (action === 'not_interested') {
                    btn.disabled = true;
                    const result = await DataModel.saveSuggestionAction(title, type, 'not_interested');

                    if (result.ok) {
                        if (card) card.remove();
                    } else {
                        btn.disabled = false;
                        alert(result?.data?.message || 'Could not save not interested.');
                    }
                    return;
                }

                if (action === 'add_to_list') {
                    await openAddToListPanel(actionsWrap, title, type);
                }
            });
        });
    });
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

    // Wire up the type toggle to re-fetch recommendations
    const toggle = document.getElementById('recommendationTypeToggle');
    if (toggle) {
        toggle.addEventListener('click', (e) => {
            const btn = e.target.closest('.type-tab');
            if (!btn) return;
            toggle.querySelectorAll('.type-tab').forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            loadSuggestions(btn.dataset.type || 'both', false, false);
        });
    }

    document.getElementById('moreRecsBtn')?.addEventListener('click', () => {
        const activeType = toggle?.querySelector('.type-tab.active')?.dataset?.type || 'both';
        loadSuggestions(activeType, true, true);
    });

    // Re-fetch only when the user actually changed their ratings or watch history
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && localStorage.getItem('recsStale') === '1') {
            localStorage.removeItem('recsStale');
            const activeType = toggle?.querySelector('.type-tab.active')?.dataset?.type || 'both';
            loadSuggestions(activeType, false, false);
        }
    });

    setupPickRandom();
    loadSuggestions('both', false, false);
});

async function loadSuggestions(type, append, refresh) {
    const activeType = type || 'both';
    const moreBtn = document.getElementById('moreRecsBtn');

    if (moreBtn && refresh) { moreBtn.disabled = true; moreBtn.textContent = 'Loading…'; }

    const data = await DataModel.getSuggestions(activeType, refresh);

    if (moreBtn) { moreBtn.disabled = false; moreBtn.textContent = 'Generate More Recommendations'; }

    if (!data) {
        document.getElementById('ratingsSummary').textContent = 'Unable to load recommendations.';
        return;
    }

    // Ratings summary and title — only update on full (non-refresh) loads
    if (!refresh) {
        const summaryEl = document.getElementById('ratingsSummary');
        summaryEl.textContent = data.ratingsCount > 0
            ? `You've rated ${data.ratingsCount} title${data.ratingsCount === 1 ? '' : 's'}. More ratings = better recommendations!`
            : 'Rate movies and shows to get personalized recommendations.';

        const titleEl = document.getElementById('recommendationsSectionTitle');
        if (titleEl) {
            const label = activeType === 'movie' ? 'Movies' : activeType === 'show' ? 'Shows' : 'Titles';
            titleEl.textContent = `Recommended ${label} For You`;
        }
    }

    const toRate = data.toRate || [];
    const recommendations = data.recommendations || [];
    const posterItems = [
        ...(!append ? toRate.map((i) => ({ title: i.title, type: i.type })) : []),
        ...recommendations.map((i) => ({ title: i.title, type: i.type })),
    ];
    const posterMap = await DataModel.getPostersForItems(posterItems);

    // To-rate list — only render on initial load
    if (!append) {
        const toRateSection = document.getElementById('toRateSection');
        const toRateList = document.getElementById('toRateList');
        if (toRate.length > 0) {
            toRateSection.style.display = '';
            toRateList.innerHTML = toRate.map((item) => {
                const path = posterMap[posterKey(item.title, item.type)];
                const rateUrl = `/ratings?title=${encodeURIComponent(item.title)}&type=${encodeURIComponent(item.type)}`;
                return recommendationCardHtml(item, path, (t) => t, `<a href="${rateUrl}" class="primary">Rate Now</a>`);
            }).join('');
        } else {
            toRateSection.style.display = 'none';
        }
    }

    // Recommendations — replace on refresh, set fresh on initial load
    const recList = document.getElementById('recommendationsList');
    if (recommendations.length > 0) {
        recList.innerHTML = recommendations.map((item) => {
            const path = posterMap[posterKey(item.title, item.type)];
            const rateUrl = `/ratings?title=${encodeURIComponent(item.title)}&type=${encodeURIComponent(item.type)}`;
            return recommendationCardHtml(item, path, (t) => `${t} · Avg ${item.avgRating}★`, `<a href="${rateUrl}" class="primary">Rate It</a>
                ${recommendationActionsHtml(item)}`);
        }).join('');
                wireRecommendationActions();
    } else if (!refresh) {
        const typeLabel = activeType === 'movie' ? 'movies' : activeType === 'show' ? 'shows' : 'titles';
        recList.innerHTML = `<p class="empty-message">Rate more ${typeLabel} to see personalized recommendations!</p>`;
    }

    // Always show button once there are any recommendations
    if (moreBtn) {
        moreBtn.style.display = recommendations.length > 0 ? '' : 'none';
    }
}