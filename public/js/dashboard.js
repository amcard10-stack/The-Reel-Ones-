////////////////////////////////////////////////////////////////
//DASHBOARD.JS
//THIS IS YOUR "CONTROLLER", IT ACTS AS THE MIDDLEMAN
// BETWEEN THE MODEL (datamodel.js) AND THE VIEW (dashboard.html)
////////////////////////////////////////////////////////////////

document.addEventListener('DOMContentLoaded', () => {

    const logoutButton = document.getElementById('logoutButton');
    const refreshButton = document.getElementById('refreshButton');
    const watchHistorySearch = document.getElementById('watchHistorySearch');
    const listsSearch = document.getElementById('listsSearch');
    const watchHistoryTitle = document.getElementById('watchHistoryTitle');
    const watchHistoryType = document.getElementById('watchHistoryType');
    const statusTitle = document.getElementById('statusTitle');
    const statusType = document.getElementById('statusType');
    const statusValue = document.getElementById('statusValue');
    const listItemTitle = document.getElementById('listItemTitle');
    const listSelect = document.getElementById('listSelect');
    const createListBtn = document.getElementById('createListBtn');

    logoutButton?.addEventListener('click', () => {
        localStorage.removeItem('jwtToken');
        window.location.href = '/';
    });

    refreshButton?.addEventListener('click', async () => {
        renderDashboard();
        updateFriendsNavBadges();
    });

    if (watchHistorySearch) {
        watchHistorySearch.addEventListener('input', () => filterBySearch());
        watchHistorySearch.addEventListener('keypress', (e) => { if (e.key === 'Enter') filterBySearch(); });
    }
    if (listsSearch) {
        listsSearch.addEventListener('input', () => filterBySearch());
        listsSearch.addEventListener('keypress', (e) => { if (e.key === 'Enter') filterBySearch(); });
    }

    createListBtn?.addEventListener('click', async () => {
        const name = document.getElementById('newListName')?.value?.trim() || '';
        if (!name) return;
        const result = await DataModel.createList(name);
        if (result.ok) {
            document.getElementById('newListName').value = '';
            filterBySearch();
        }
    });

    // TMDB search for Watch History add
    setupTMDBSearch(watchHistoryTitle, watchHistoryType, 'watchHistoryResults', async (item) => {
        const result = await DataModel.addWatchHistory(item.title, item.type);
        if (result.ok) {
            watchHistoryTitle.value = '';
            document.getElementById('watchHistoryResults').innerHTML = '';
            renderDashboard();
        }
    });

    // TMDB search for Status add
    setupTMDBSearch(statusTitle, statusType, 'statusResults', async (item) => {
        const status = statusValue?.value;
        if (!status) return;
        const result = await DataModel.setStatus(item.title, item.type, status);
        if (result.ok) {
            statusTitle.value = '';
            document.getElementById('statusResults').innerHTML = '';
            renderDashboard();
        }
    });

    // TMDB search for List item add
    setupTMDBSearch(listItemTitle, null, 'listItemResults', async (item) => {
        const listId = listSelect?.value;
        if (!listId) {
            alert('Please select a list first.');
            return;
        }
        const result = await DataModel.addToList(listId, item.title);
        if (result.ok) {
            listItemTitle.value = '';
            document.getElementById('listItemResults').innerHTML = '';
            renderDashboard();
        }
    }, true);

    // Item popup
    const popup = document.getElementById('itemPopup');
    const popupClose = document.getElementById('popupClose');
    const popupCancel = document.getElementById('popupCancel');
    const popupSave = document.getElementById('popupSave');
    const popupStars = document.getElementById('popupStars');
    const popupStatusSection = document.getElementById('popupStatusSection');
    const popupStatusSelect = document.getElementById('popupStatusSelect');
    const popupDelete = document.getElementById('popupDelete');
    popupClose?.addEventListener('click', () => { popup.style.display = 'none'; });
    popupCancel?.addEventListener('click', () => { popup.style.display = 'none'; });
    popup?.addEventListener('click', (e) => { if (e.target === popup) popup.style.display = 'none'; });
    popupStars?.addEventListener('click', (e) => {
        const span = e.target.closest('span[data-rating]');
        if (!span) return;
        const r = parseInt(span.dataset.rating, 10);
        currentPopupItem._rating = r;
        [...popupStars.querySelectorAll('span')].forEach((s, i) => {
            s.textContent = i < r ? '★' : '☆';
            s.classList.toggle('filled', i < r);
        });
    });
    popupSave?.addEventListener('click', async () => {
        if (!currentPopupItem) return;
        const rating = currentPopupItem._rating || 0;
        const review = document.getElementById('popupReview')?.value?.trim() || '';
        const status = popupStatusSection?.style.display !== 'none' ? popupStatusSelect?.value : null;
        if (rating >= 1 && rating <= 5) {
            const hasExisting = (currentPopupItem.rating != null && currentPopupItem.rating > 0);
            const result = hasExisting
                ? await DataModel.updateRating(currentPopupItem.title, currentPopupItem.type, rating, review)
                : await DataModel.addRating(currentPopupItem.title, currentPopupItem.type, rating, review);
            if (result.ok) { /* ok */ }
        }
        if (status) {
            await DataModel.setStatus(currentPopupItem.title, currentPopupItem.type, status);
        }
        popup.style.display = 'none';
        renderDashboard();
    });
    popupDelete?.addEventListener('click', async () => {
        if (!currentPopupItem) return;
        if (!confirm('Remove this from watch history, status, and all lists?')) return;
        if (DataModel.deleteWatchHistory) await DataModel.deleteWatchHistory(currentPopupItem.title, currentPopupItem.type);
        if (DataModel.deleteStatus) await DataModel.deleteStatus(currentPopupItem.title, currentPopupItem.type);
        if (DataModel.deleteRating) await DataModel.deleteRating(currentPopupItem.title, currentPopupItem.type);
        const listsWithItem = (cachedLists || []).map(l => {
            const item = (l.items || []).find(i => (i.title || '').trim().toLowerCase() === (currentPopupItem.title || '').trim().toLowerCase());
            return item ? { listId: l.id, itemTitle: item.title } : null;
        }).filter(Boolean);
        for (const { listId, itemTitle } of listsWithItem) {
            if (DataModel.removeFromList) await DataModel.removeFromList(listId, itemTitle);
        }
        popup.style.display = 'none';
        renderDashboard();
    });

    document.getElementById('listsContainer')?.addEventListener('click', (e) => {
        const itemEl = e.target.closest('.list-item-poster, .list-item');
        if (!itemEl) return;
        const title = itemEl.dataset.title;
        if (!title) return;
        showItemPopup({ title, type: 'movie' });
    });

    document.getElementById('popupListsContainer')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('.popup-remove-from-list');
        if (!btn || !currentPopupItem) return;
        const listId = btn.dataset.listId;
        const itemTitle = btn.dataset.itemTitle;
        if (!listId || !itemTitle) return;
        const result = await DataModel.removeFromList?.(listId, itemTitle);
        if (result?.ok) {
            cachedLists = await DataModel.getLists();
            showItemPopup(currentPopupItem);
            renderDashboard();
        }
    });

    const token = localStorage.getItem('jwtToken');
    if (!token) {
        window.location.href = '/';
    } else {
        DataModel.setToken(token);
        renderDashboard();
        function tickDashboardFriendBadges() {
            if (document.visibilityState === 'hidden') return;
            updateFriendsNavBadges();
            updateFriendActivityTeaser();
        }
        tickDashboardFriendBadges();
        setInterval(tickDashboardFriendBadges, 6000);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') tickDashboardFriendBadges();
        });

// profile popup
    async function checkProfileComplete() {
        try {
            const res = await fetch('/api/profile', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            const isIncomplete = !data.firstName || !data.lastName || !data.profilePicture || !data.username;
            if (isIncomplete) {
                document.getElementById('profilePrompt').style.display = 'flex';
            }
        } catch (err) {
            console.error('Profile check failed:', err);
            }
        }

        document.getElementById('profilePromptGoNow').addEventListener('click', () => {
             window.location.href = '/profile';
        });

        document.getElementById('profilePromptLater').addEventListener('click', () => {
            document.getElementById('profilePrompt').style.display = 'none';
}       );

        checkProfileComplete();
    }
});

async function updateFriendRequestBadge() {
    const badge = document.getElementById('friendRequestBadge');
    if (!badge) return;
    try {
        const res = await fetch('/api/friends/requests/count', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('jwtToken')}` }
        });
        const data = await res.json();
        const count = data.count ?? 0;
        badge.textContent = count > 0 ? (count > 99 ? '99+' : count) : '';
        badge.classList.toggle('has-count', count > 0);
    } catch (err) {
        badge.textContent = '';
        badge.classList.remove('has-count');
    }
}

async function updateFriendMessageBadge() {
    const badge = document.getElementById('friendMessageBadge');
    if (!badge) return;
    try {
        const res = await fetch('/api/friends/messages/unread/count', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('jwtToken')}` }
        });
        if (!res.ok) {
            badge.textContent = '';
            badge.classList.remove('has-count');
            return;
        }
        const data = await res.json().catch(() => ({}));
        const count = data.count ?? 0;
        badge.textContent = count > 0 ? (count > 99 ? '99+' : String(count)) : '';
        badge.classList.toggle('has-count', count > 0);
    } catch (err) {
        badge.textContent = '';
        badge.classList.remove('has-count');
    }
}

async function updateFriendsNavBadges() {
    await Promise.all([updateFriendRequestBadge(), updateFriendMessageBadge()]);
}

async function updateFriendActivityTeaser() {
    const wrap = document.getElementById('friendActivityTeaser');
    const textEl = document.getElementById('friendActivityTeaserText');
    if (!wrap || !textEl) return;
    try {
        const res = await fetch('/api/friends/activity/summary?days=7', {
            headers: { Authorization: `Bearer ${localStorage.getItem('jwtToken')}` },
        });
        if (!res.ok) {
            wrap.style.display = 'none';
            return;
        }
        const data = await res.json().catch(() => ({}));
        const count = Number(data.count) || 0;
        if (count > 0) {
            textEl.textContent = `${count} friend update${count === 1 ? '' : 's'} this week — see all on Friends`;
            wrap.style.display = 'block';
        } else {
            wrap.style.display = 'none';
        }
    } catch (err) {
        wrap.style.display = 'none';
    }
}

//////////////////////////////////////////
//TMDB SEARCH HELPERS
//////////////////////////////////////////
const DEBOUNCE_MS = 400;
const MIN_CHARS = 2;

function setupTMDBSearch(inputEl, typeSelectEl, resultsContainerId, onSelect, searchBoth = false) {
    if (!inputEl || !resultsContainerId) return;
    let debounceTimer = null;

    inputEl.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => loadTMDBResults(), DEBOUNCE_MS);
    });
    inputEl.addEventListener('focus', () => {
        const q = inputEl.value?.trim();
        if (!q || q.length < MIN_CHARS) loadTMDBResults(true);
    });

    async function loadTMDBResults(showTrending = false) {
        const container = document.getElementById(resultsContainerId);
        if (!container) return;
        const query = inputEl.value?.trim();
        const type = typeSelectEl?.value || 'movie';

        if (showTrending || !query || query.length < MIN_CHARS) {
            container.innerHTML = '<p class="loading-message">Loading...</p>';
            try {
                let results = [];
                if (searchBoth) {
                    const [moviesRes, showsRes] = await Promise.all([
                        fetch('/api/trending/movies', { headers: { 'Authorization': `Bearer ${localStorage.getItem('jwtToken')}` } }),
                        fetch('/api/trending/shows', { headers: { 'Authorization': `Bearer ${localStorage.getItem('jwtToken')}` } })
                    ]);
                    const moviesData = await moviesRes.json();
                    const showsData = await showsRes.json();
                    const movies = (moviesData.results || []).slice(0, 10).map(m => ({ ...m, _type: 'movie', _title: m.title }));
                    const shows = (showsData.results || []).slice(0, 10).map(s => ({ ...s, _type: 'show', _title: s.name }));
                    results = [...movies, ...shows];
                } else {
                    const res = await fetch(`/api/trending/${type === 'tv' ? 'shows' : 'movies'}`, {
                        headers: { 'Authorization': `Bearer ${localStorage.getItem('jwtToken')}` }
                    });
                    const data = await res.json();
                    results = (data.results || []).map(r => ({
                        ...r,
                        _type: type === 'tv' ? 'show' : 'movie',
                        _title: type === 'tv' ? r.name : r.title
                    }));
                }
                renderTMDBResults(container, results, onSelect);
            } catch (err) {
                console.error(err);
                container.innerHTML = '<p class="empty-message">Failed to load.</p>';
            }
            return;
        }

        container.innerHTML = '<p class="loading-message">Searching...</p>';
        try {
            let results = [];
            if (searchBoth) {
                const [moviesRes, showsRes] = await Promise.all([
                    fetch(`/api/tmdb/search?q=${encodeURIComponent(query)}&type=movie`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('jwtToken')}` } }),
                    fetch(`/api/tmdb/search?q=${encodeURIComponent(query)}&type=tv`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('jwtToken')}` } })
                ]);
                const moviesData = await moviesRes.json();
                const showsData = await showsRes.json();
                const movies = (moviesData.results || []).map(m => ({ ...m, _type: 'movie', _title: m.title }));
                const shows = (showsData.results || []).map(s => ({ ...s, _type: 'show', _title: s.name }));
                results = [...movies, ...shows];
            } else {
                const tmdbType = type === 'show' ? 'tv' : 'movie';
                const res = await fetch(`/api/tmdb/search?q=${encodeURIComponent(query)}&type=${tmdbType}`, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('jwtToken')}` }
                });
                const data = await res.json();
                results = (data.results || []).map(r => ({
                    ...r,
                    _type: type,
                    _title: type === 'show' ? r.name : r.title
                }));
            }
            renderTMDBResults(container, results, onSelect);
        } catch (err) {
            console.error(err);
            container.innerHTML = '<p class="empty-message">Search failed.</p>';
        }
    }

    function renderTMDBResults(container, results, onSelect) {
        container.innerHTML = '';
        const withPoster = results.filter(r => r.poster_path);
        if (withPoster.length === 0) {
            container.innerHTML = '<p class="empty-message">No results. Try a different search.</p>';
            return;
        }
        withPoster.forEach(item => {
            const card = document.createElement('div');
            card.className = 'tmdb-result-card';

            const img = document.createElement('img');
            img.src = `https://image.tmdb.org/t/p/w154${item.poster_path}`;
            img.alt = item._title || '';

            const titleP = document.createElement('p');
            titleP.textContent = item._title || 'Untitled';

            const preview = document.createElement('p');
            preview.className = 'tmdb-overview-preview';
            const ov = (item.overview && String(item.overview).trim()) || '';
            preview.textContent = ov || 'No description yet.';

            const actions = document.createElement('div');
            actions.className = 'tmdb-card-actions';
            const infoBtn = document.createElement('button');
            infoBtn.type = 'button';
            infoBtn.className = 'tmdb-info-btn';
            infoBtn.textContent = 'Details';
            infoBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (typeof openTitleDetailModal === 'function') {
                    openTitleDetailModal(item, item._type === 'show' ? 'tv' : 'movie');
                }
            });
            actions.appendChild(infoBtn);

            const hint = document.createElement('span');
            hint.className = 'add-hint';
            hint.textContent = 'Click card to add';

            card.appendChild(img);
            card.appendChild(titleP);
            card.appendChild(preview);
            card.appendChild(actions);
            card.appendChild(hint);

            card.addEventListener('click', () => {
                onSelect({ title: item._title, type: item._type });
            });
            container.appendChild(card);
        });
    }
}

//////////////////////////////////////////
//FUNCTIONS TO MANIPULATE THE DOM
//////////////////////////////////////////
let cachedWatchHistory = [];
let cachedLists = [];
let cachedStatuses = [];
let posterCache = {};
let currentPopupItem = null;

function showItemPopup(item) {
    const whItem = cachedWatchHistory.find(w => w.title === item.title && (w.type || 'movie') === (item.type || 'movie'));
    const merged = whItem ? { ...item, rating: whItem.rating, review: whItem.review, watched_at: whItem.watched_at } : item;
    if (!merged.status && cachedStatuses?.length) {
        const statusItem = cachedStatuses.find(s => s.title === merged.title);
        if (statusItem) merged.status = statusItem.status;
    }
    currentPopupItem = { ...merged, _rating: merged.rating || 0 };
    const popup = document.getElementById('itemPopup');
    const posterEl = document.getElementById('popupPoster');
    const titleEl = document.getElementById('popupTitle');
    const metaEl = document.getElementById('popupMeta');
    const statusEl = document.getElementById('popupStatus');
    const reviewEl = document.getElementById('popupReview');
    const starsEl = document.getElementById('popupStars');
    const statusSection = document.getElementById('popupStatusSection');
    const statusSelect = document.getElementById('popupStatusSelect');
    const placeholderEl = document.getElementById('popupPosterPlaceholder');
    const listsSection = document.getElementById('popupListsSection');
    const listsContainer = document.getElementById('popupListsContainer');

    const url = posterUrl(merged);
    if (posterEl) {
        posterEl.src = url || '';
        posterEl.style.display = url ? 'block' : 'none';
    }
    if (placeholderEl) placeholderEl.style.display = url ? 'none' : 'block';
    if (titleEl) titleEl.textContent = merged.title || 'Untitled';
    if (metaEl) metaEl.textContent = `${merged.type || 'movie'}${merged.watched_at ? ' · ' + new Date(merged.watched_at).toLocaleDateString() : ''}`;
    if (statusEl) {
        statusEl.textContent = merged.status ? `Status: ${merged.status.replace('_', ' ')}` : '';
        statusEl.style.display = merged.status ? 'block' : 'none';
    }
    if (reviewEl) reviewEl.value = merged.review || '';
    if (starsEl) {
        const r = merged.rating || 0;
        [...starsEl.querySelectorAll('span')].forEach((s, i) => {
            s.textContent = i < r ? '★' : '☆';
            s.classList.toggle('filled', i < r);
        });
    }
    if (statusSection) statusSection.style.display = 'block';
    if (statusSelect) statusSelect.value = merged.status || 'completed';

    const listsWithExactItem = (cachedLists || []).map(l => {
        const item = (l.items || []).find(i => (i.title || '').trim().toLowerCase() === (merged.title || '').trim().toLowerCase());
        return item ? { list: l, itemTitle: item.title } : null;
    }).filter(Boolean);
    if (listsSection && listsContainer) {
        if (listsWithExactItem.length > 0) {
            listsSection.style.display = 'block';
            listsContainer.innerHTML = listsWithExactItem.map(({ list, itemTitle }) =>
                `<button type="button" class="popup-btn popup-remove-from-list" data-list-id="${list.id}" data-item-title="${(itemTitle || '').replace(/"/g, '&quot;')}">Remove from ${list.name || 'list'}</button>`
            ).join('');
        } else {
            listsSection.style.display = 'none';
            listsContainer.innerHTML = '';
        }
    }

    if (popup) popup.style.display = 'flex';
}

async function renderDashboard() {
    cachedWatchHistory = await DataModel.getWatchHistory();
    cachedLists = await DataModel.getLists();
    cachedStatuses = DataModel.getStatuses ? await DataModel.getStatuses() : [];

    const posterItems = [
        ...cachedWatchHistory.map(w => ({ title: w.title, type: w.type || 'movie' })),
        ...cachedStatuses.map(s => ({ title: s.title, type: s.type || 'movie' })),
        ...cachedLists.flatMap(list => (list.items || []).map(i => ({ title: i.title, type: 'movie' })))
    ];
    posterCache = (DataModel.getPostersForItems && posterItems.length > 0) ? await DataModel.getPostersForItems(posterItems) : {};

    filterBySearch();
    renderStatuses();
}

function posterUrl(item) {
    const key = `${item.title}|${item.type || 'movie'}`;
    const path = posterCache[key];
    return path ? `https://image.tmdb.org/t/p/w154${path}` : null;
}

function renderStatuses() {
    const watching = document.getElementById('statusWatching');
    const completed = document.getElementById('statusCompleted');
    const want = document.getElementById('statusWant');
    if (!watching || !completed || !want) return;

    const byStatus = {
        watching: cachedStatuses.filter(s => s.status === 'watching'),
        completed: cachedStatuses.filter(s => s.status === 'completed'),
        want_to_watch: cachedStatuses.filter(s => s.status === 'want_to_watch')
    };

    [watching, completed, want].forEach(el => el.innerHTML = '');
    byStatus.watching.forEach(s => {
        watching.appendChild(createPosterCard(s));
    });
    byStatus.completed.forEach(s => {
        completed.appendChild(createPosterCard(s));
    });
    byStatus.want_to_watch.forEach(s => {
        want.appendChild(createPosterCard(s));
    });

    if (byStatus.watching.length === 0) watching.innerHTML = '<p class="empty-message">None</p>';
    if (byStatus.completed.length === 0) completed.innerHTML = '<p class="empty-message">None</p>';
    if (byStatus.want_to_watch.length === 0) want.innerHTML = '<p class="empty-message">None</p>';
}

function createPosterCard(item) {
    const div = document.createElement('div');
    div.classList.add('poster-card-small');
    const url = posterUrl(item);
    const name = item.title || 'Untitled';
    div.innerHTML = url
        ? `<img src="${url}" alt="${name}"><p>${name}</p>`
        : `<div class="poster-placeholder"></div><p>${name}</p>`;
    div.addEventListener('click', () => showItemPopup(item));
    return div;
}

function filterBySearch() {
    const watchHistoryTerm = document.getElementById('watchHistorySearch')?.value?.trim().toLowerCase() || '';
    const listsTerm = document.getElementById('listsSearch')?.value?.trim().toLowerCase() || '';
    renderWatchHistory(watchHistoryTerm);
    renderLists(listsTerm);
}

function renderWatchHistory(searchTerm) {
    const el = document.getElementById('watchHistory');
    let items = cachedWatchHistory;
    if (searchTerm) {
        items = items.filter(item => item.title.toLowerCase().includes(searchTerm));
    }
    el.innerHTML = '';
    if (items.length === 0) {
        el.innerHTML = '<p class="empty-message">' + (searchTerm ? 'No matching items in watch history.' : 'No watch history yet.') + '</p>';
        return;
    }
    items.forEach(item => {
        const div = document.createElement('div');
        div.classList.add('dashboard-item', 'watch-history-item');
        const date = new Date(item.watched_at).toLocaleDateString();
        const ratingStars = item.rating
            ? `<span class="rating-stars">${'★'.repeat(item.rating)}${'☆'.repeat(5 - item.rating)}</span>`
            : '';
        const poster = posterUrl(item);
        const name = item.title || 'Untitled';
        const posterHtml = poster
            ? `<img src="${poster}" alt="${name}" class="wh-poster">`
            : '<div class="poster-placeholder wh-poster"></div>';
        div.innerHTML = `
            <div class="wh-poster-wrap">${posterHtml}</div>
            <div class="wh-details">
                <strong>${item.title}</strong>
                <span class="meta">(${item.type}) · ${date}${ratingStars ? ' · ' + ratingStars : ''}</span>
                ${item.review ? `<p class="review-text">${item.review}</p>` : ''}
            </div>
        `;
        div.addEventListener('click', () => showItemPopup({ ...item, status: 'completed' }));
        el.appendChild(div);
    });
}

function renderLists(searchTerm) {
    const el = document.getElementById('listsContainer');
    const listSelect = document.getElementById('listSelect');
    const addToListForm = document.getElementById('addToListForm');
    const lists = cachedLists;
    el.innerHTML = '';
    if (lists.length === 0) {
        el.innerHTML = '<p class="empty-message">No lists yet.</p>';
        addToListForm.style.display = 'none';
        return;
    }
    addToListForm.style.display = 'flex';
    listSelect.innerHTML = '<option value="">Select a list</option>';
    lists.forEach(list => {
        listSelect.innerHTML += `<option value="${list.id}">${list.name}</option>`;
        const listDiv = document.createElement('div');
        listDiv.classList.add('list-card');
        let items = list.items || [];
        if (searchTerm) {
            items = items.filter(i => i.title.toLowerCase().includes(searchTerm));
        }
        let itemsHtml = '';
        if (items.length > 0) {
            itemsHtml = items.map(i => {
                const itemForPoster = { title: i.title, type: 'movie' };
                const url = posterUrl(itemForPoster);
                const name = i.title || 'Untitled';
                const dataAttrs = `data-title="${(i.title || '').replace(/"/g, '&quot;')}" data-list-id="${list.id}"`;
                return url
                    ? `<div class="list-item-poster list-item-clickable" ${dataAttrs}><img src="${url}" alt="${name}"><span>${name}</span></div>`
                    : `<div class="list-item list-item-clickable" ${dataAttrs}>${name}</div>`;
            }).join('');
        } else {
            itemsHtml = '<p class="empty-message">' + (searchTerm ? 'No matching items.' : 'Empty list') + '</p>';
        }
        listDiv.innerHTML = `<h3 class="list-name">${list.name}</h3><div class="list-items list-items-posters">${itemsHtml}</div>`;
        el.appendChild(listDiv);
    });
}
