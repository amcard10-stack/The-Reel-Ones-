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

    // Rec inbox toggle
    document.getElementById('recInboxToggleRow')?.addEventListener('click', () => {
        const body = document.getElementById('recInboxBody');
        const btn = document.getElementById('recInboxToggle');
        if (!body) return;
        const open = body.style.display !== 'none';
        body.style.display = open ? 'none' : 'block';
        if (btn) btn.textContent = open ? 'Show ▾' : 'Hide ▴';
    });

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
        } else {
            const msg = result?.data?.message || 'Could not save status. Try again.';
            alert(msg);
        }
    });

    // TMDB search for List item add (owned + shared lists)
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

    function populateListSelect() {
        if (!listSelect) return;
        const allLists = [
            ...(cachedLists || []).map(l => ({ ...l, _owned: true })),
            ...(cachedSharedLists || []).map(l => ({ ...l, _owned: false }))
        ];
        if (allLists.length === 0) {
            document.getElementById('addToListForm').style.display = 'none';
            return;
        }
        document.getElementById('addToListForm').style.display = 'flex';
        listSelect.innerHTML = '<option value="">Select a list</option>';
        if (cachedLists.length > 0) {
            const grp1 = document.createElement('optgroup');
            grp1.label = 'My Lists';
            cachedLists.forEach(l => {
                const opt = document.createElement('option');
                opt.value = l.id; opt.textContent = l.name;
                grp1.appendChild(opt);
            });
            listSelect.appendChild(grp1);
        }
        if (cachedSharedLists.length > 0) {
            const grp2 = document.createElement('optgroup');
            grp2.label = 'Shared With Me';
            cachedSharedLists.forEach(l => {
                const opt = document.createElement('option');
                opt.value = l.id; opt.textContent = l.name;
                grp2.appendChild(opt);
            });
            listSelect.appendChild(grp2);
        }
    }

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

    document.getElementById('listsContainer')?.addEventListener('click', async (e) => {
        const delBtn = e.target.closest('.delete-list-btn');
        if (delBtn) {
            e.preventDefault();
            const listId = delBtn.dataset.listId;
            const listName = delBtn.dataset.listName || 'this list';
            if (!listId) return;
            if (!confirm(`Delete list "${listName}" and all titles in it? This cannot be undone.`)) return;
            delBtn.disabled = true;
            const result = await DataModel.deleteList?.(listId);
            delBtn.disabled = false;
            if (result?.ok) {
                cachedLists = await DataModel.getLists();
                renderDashboard();
            } else {
                const msg = result?.data?.message || 'Could not delete list.';
                alert(msg);
            }
            return;
        }
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
        setupStatusBoardDragDrop();
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

async function updateFriendInviteBadge() {
    const badge = document.getElementById('friendInviteBadge');
    if (!badge) return;
    try {
        const res = await fetch('/api/invitations/pending', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('jwtToken')}` }
        });
        if (!res.ok) { badge.textContent = ''; badge.classList.remove('has-count'); return; }
        const data = await res.json();
        const count = (data.invitations || []).length;
        badge.textContent = count > 0 ? (count > 99 ? '99+' : String(count)) : '';
        badge.classList.toggle('has-count', count > 0);
    } catch (err) {
        badge.textContent = '';
        badge.classList.remove('has-count');
    }
}

async function updateFriendsNavBadges() {
    await Promise.all([updateFriendRequestBadge(), updateFriendMessageBadge(), updateFriendInviteBadge()]);
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
        if (results.length === 0) {
            container.innerHTML = '<p class="empty-message">No results. Try a different search.</p>';
            return;
        }
        results.forEach(item => {
            const card = document.createElement('div');
            card.className = 'tmdb-result-card';

            let posterEl = null;
            if (item.poster_path) {
                const img = document.createElement('img');
                img.src = `https://image.tmdb.org/t/p/w154${item.poster_path}`;
                img.alt = item._title || '';
                posterEl = img;
            } else {
                const ph = document.createElement('div');
                ph.className = 'poster-placeholder tmdb-result-poster-ph';
                ph.setAttribute('aria-hidden', 'true');
                posterEl = ph;
            }

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

            card.appendChild(posterEl);
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
let popupFriendsRatingsFetchGen = 0;

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

    loadPopupFriendsRatings(merged);

    if (popup) popup.style.display = 'flex';
}

function friendsSummaryLine(data) {
    if (!data || typeof data.friends !== 'object') {
        return 'Friends: unavailable';
    }
    const f = data.friends;
    if (f.count > 0) {
        const n = f.count;
        return `Friends ★ ${f.average} (${n} rating${n === 1 ? '' : 's'})`;
    }
    return 'No friend ratings yet';
}

function renderPopupFriendsRatings(el, data, isError) {
    if (!el) return;
    el.classList.remove('popup-friends-ratings--loading', 'popup-friends-ratings--error');
    el.innerHTML = '';
    el.setAttribute('aria-busy', 'false');
    if (isError) {
        el.classList.add('popup-friends-ratings--error');
        el.textContent = 'Friends: unavailable';
        return;
    }
    el.textContent = friendsSummaryLine(data);
}

function loadPopupFriendsRatings(merged) {
    const el = document.getElementById('popupFriendsRatings');
    const section = document.getElementById('popupFriendsRatingsSection');
    if (!el || !section) return;
    const title = (merged.title || '').trim();
    const mediaType = merged.type === 'show' ? 'show' : 'movie';
    if (!title) {
        section.style.display = 'none';
        el.innerHTML = '';
        return;
    }
    const gen = ++popupFriendsRatingsFetchGen;
    section.style.display = 'block';
    el.setAttribute('aria-busy', 'true');
    el.className = 'popup-friends-ratings popup-friends-ratings--loading';
    el.textContent = 'Loading friends…';
    DataModel.getRatingSummary(title, mediaType)
        .then((data) => {
            if (gen !== popupFriendsRatingsFetchGen) return;
            renderPopupFriendsRatings(el, data, !data);
        })
        .catch(() => {
            if (gen !== popupFriendsRatingsFetchGen) return;
            renderPopupFriendsRatings(el, null, true);
        });
}

async function renderDashboard() {
    [cachedWatchHistory, cachedLists, cachedStatuses] = await Promise.all([
        DataModel.getWatchHistory(),
        DataModel.getLists(),
        DataModel.getStatuses ? DataModel.getStatuses() : Promise.resolve([])
    ]);

    const posterItems = [
        ...cachedWatchHistory.map(w => ({ title: w.title, type: w.type || 'movie' })),
        ...cachedStatuses.map(s => ({ title: s.title, type: s.type || 'movie' })),
        ...cachedLists.flatMap(l => (l.items || []).map(i => ({ title: i.title, type: 'movie' })))
    ];
    posterCache = (DataModel.getPostersForItems && posterItems.length > 0)
        ? await DataModel.getPostersForItems(posterItems)
        : {};

    filterBySearch();
    renderStatuses();
    renderRecommendationsInbox();
}

async function renderRecommendationsInbox() {
    const listEl = document.getElementById('recInboxList');
    const badgeEl = document.getElementById('recBadge');
    if (!listEl) return;

    const recs = await DataModel.getRecommendationsInbox();
    const unread = recs.filter(r => !r.read_at).length;
    if (badgeEl) badgeEl.textContent = unread > 0 ? unread : '';

    // Auto-expand if there are unread recs
    if (unread > 0) {
        const body = document.getElementById('recInboxBody');
        const btn = document.getElementById('recInboxToggle');
        if (body) body.style.display = 'block';
        if (btn) btn.textContent = 'Hide ▴';
    }

    if (recs.length === 0) {
        listEl.innerHTML = '<p class="empty-message">No recommendations yet. Friends can recommend movies and shows to you!</p>';
        return;
    }

    // Fetch posters for all recommended titles
    const posterItems = recs.map(r => ({ title: r.title, type: r.type || 'movie' }));
    const recPosters = posterItems.length > 0 ? await DataModel.getPostersForItems(posterItems) : {};

    listEl.innerHTML = '';
    recs.forEach(rec => {
        const div = document.createElement('div');
        div.className = 'rec-card' + (rec.read_at ? ' rec-card--read' : ' rec-card--unread');
        const senderName = rec.senderFirstName
            ? `${rec.senderFirstName} ${rec.senderLastName}`
            : rec.sender_email;
        const typeLabel = rec.type === 'show' ? 'TV Show' : 'Movie';
        const date = new Date(rec.sent_at).toLocaleDateString();
        const posterPath = recPosters[`${rec.title}|${rec.type || 'movie'}`];
        const posterHtml = posterPath
            ? `<img src="https://image.tmdb.org/t/p/w154${posterPath}" alt="${rec.title}" class="rec-card-poster">`
            : `<div class="rec-card-poster rec-card-poster-ph"></div>`;

        div.innerHTML = `
            <div class="rec-card-header">
                <span class="rec-from">From <strong>${senderName}</strong>${rec.senderUsername ? ` (@${rec.senderUsername})` : ''}</span>
                <span class="rec-date meta">${date}</span>
                ${!rec.read_at ? '<span class="rec-unread-dot" title="New">●</span>' : ''}
            </div>
            <div class="rec-card-body">
                ${posterHtml}
                <div class="rec-card-info">
                    <strong class="rec-title">${rec.title}</strong>
                    <span class="type-badge">${typeLabel}</span>
                    ${rec.note ? `<p class="rec-note">"${rec.note}"</p>` : ''}
                </div>
            </div>
            <div class="rec-card-actions">
                ${!rec.read_at ? `<button class="rec-mark-read-btn">Mark as read</button>` : ''}
                <button class="rec-delete-btn">Delete</button>
            </div>
        `;
        if (!rec.read_at) {
            div.querySelector('.rec-mark-read-btn').addEventListener('click', async (e) => {
                e.stopPropagation();
                await DataModel.markRecommendationRead(rec.id);
                renderRecommendationsInbox();
            });
        }
        div.querySelector('.rec-delete-btn').addEventListener('click', async (e) => {
            e.stopPropagation();
            const result = await DataModel.deleteRecommendation(rec.id);
            if (result.ok) renderRecommendationsInbox();
        });
        listEl.appendChild(div);
    });
}


function posterUrl(item) {
    const key = `${item.title}|${item.type || 'movie'}`;
    const path = posterCache[key];
    return path ? `https://image.tmdb.org/t/p/w154${path}` : null;
}

function renderStatuses() {
    const want = document.getElementById('statusWant');
    const watching = document.getElementById('statusWatching');
    const completed = document.getElementById('statusCompleted');
    if (!watching || !completed || !want) return;

    const byStatus = {
        want_to_watch: cachedStatuses.filter(s => s.status === 'want_to_watch'),
        watching: cachedStatuses.filter(s => s.status === 'watching'),
        completed: cachedStatuses.filter(s => s.status === 'completed'),
    };

    [want, watching, completed].forEach((el) => {
        el.innerHTML = '';
    });
    byStatus.want_to_watch.forEach((s) => {
        want.appendChild(createPosterCard(s));
    });
    byStatus.watching.forEach((s) => {
        watching.appendChild(createPosterCard(s));
    });
    byStatus.completed.forEach((s) => {
        completed.appendChild(createPosterCard(s));
    });

    if (byStatus.want_to_watch.length === 0) want.innerHTML = '<p class="empty-message">None</p>';
    if (byStatus.watching.length === 0) watching.innerHTML = '<p class="empty-message">None</p>';
    if (byStatus.completed.length === 0) completed.innerHTML = '<p class="empty-message">None</p>';
}

function setupStatusBoardDragDrop() {
    document.querySelectorAll('.status-col[data-status-drop]').forEach((col) => {
        if (col.dataset.dropBound === '1') return;
        col.dataset.dropBound = '1';
        const status = col.dataset.statusDrop;
        if (!status) return;

        col.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        });
        col.addEventListener('dragenter', (e) => {
            e.preventDefault();
            col.classList.add('status-col-drag-over');
        });
        col.addEventListener('dragleave', (e) => {
            if (!col.contains(e.relatedTarget)) col.classList.remove('status-col-drag-over');
        });
        col.addEventListener('drop', async (e) => {
            e.preventDefault();
            col.classList.remove('status-col-drag-over');
            let raw = e.dataTransfer.getData('application/x-status-item');
            if (!raw) raw = e.dataTransfer.getData('text/plain');
            let payload;
            try {
                payload = JSON.parse(raw);
            } catch {
                return;
            }
            if (!payload || !payload.title) return;
            const type = payload.type === 'show' ? 'show' : 'movie';
            const title = String(payload.title).trim();
            if (!title) return;

            const existing = cachedStatuses.find(
                (s) => s.title === title && (s.type || 'movie') === type
            );
            if (existing && existing.status === status) return;

            const result = await DataModel.setStatus(title, type, status);
            if (result?.ok) {
                if (existing) existing.status = status;
                else cachedStatuses.push({ title, type, status });
                renderStatuses();
            } else {
                const msg = result?.data?.message || 'Could not update status.';
                alert(msg);
            }
        });
    });
}

function createPosterCard(item) {
    const div = document.createElement('div');
    div.classList.add('poster-card-small', 'poster-card-draggable');
    div.draggable = true;
    const t = item.type === 'show' ? 'show' : 'movie';

    const url = posterUrl(item);
    const name = item.title || 'Untitled';
    div.innerHTML = url
        ? `<img src="${url}" alt="${name}" draggable="false"><p>${name}</p>`
        : `<div class="poster-placeholder"></div><p>${name}</p>`;
    div.addEventListener('dragstart', (e) => {
        const payload = JSON.stringify({ title: item.title, type: t });
        e.dataTransfer.setData('application/x-status-item', payload);
        e.dataTransfer.setData('text/plain', payload);
        e.dataTransfer.effectAllowed = 'move';
        div.classList.add('poster-card-dragging');
    });
    let ignoreNextClick = false;
    div.addEventListener('dragend', () => {
        div.classList.remove('poster-card-dragging');
        document.querySelectorAll('.status-col-drag-over').forEach((c) => c.classList.remove('status-col-drag-over'));
        ignoreNextClick = true;
        setTimeout(() => {
            ignoreNextClick = false;
        }, 120);
    });
    div.addEventListener('click', () => {
        if (ignoreNextClick) return;
        showItemPopup(item);
    });
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

// Build an inline TMDB search grid inside a container, calls onSelect({title,type}) on card click
function buildInlineListSearch(_containerEl, placeholder, onSelect) {
    const wrap = document.createElement('div');
    wrap.className = 'inline-list-search-wrap';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:6px;margin-top:8px;';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tmdb-search-input';
    input.placeholder = placeholder || 'Search movies or shows to add...';
    input.style.flex = '1';
    const typeSelect = document.createElement('select');
    typeSelect.className = 'inline-type-select';
    typeSelect.innerHTML = '<option value="both">All</option><option value="movie">Movie</option><option value="show">TV Show</option>';
    row.appendChild(input);
    row.appendChild(typeSelect);
    wrap.appendChild(row);
    const resultsGrid = document.createElement('div');
    resultsGrid.className = 'tmdb-results-grid inline-list-results';
    wrap.appendChild(resultsGrid);

    let debounceTimer = null;
    const doSearch = async () => {
        const query = input.value.trim();
        const type = typeSelect.value;
        resultsGrid.innerHTML = '';
        if (!query) return;
        resultsGrid.innerHTML = '<p class="loading-message">Searching...</p>';
        try {
            const token = localStorage.getItem('jwtToken');
            let results = [];
            if (type === 'both') {
                const [mRes, sRes] = await Promise.all([
                    fetch(`/api/tmdb/search?q=${encodeURIComponent(query)}&type=movie`, { headers: { Authorization: `Bearer ${token}` } }),
                    fetch(`/api/tmdb/search?q=${encodeURIComponent(query)}&type=tv`, { headers: { Authorization: `Bearer ${token}` } })
                ]);
                const mData = await mRes.json(); const sData = await sRes.json();
                results = [
                    ...(mData.results || []).map(r => ({ ...r, _type: 'movie', _title: r.title })),
                    ...(sData.results || []).map(r => ({ ...r, _type: 'show', _title: r.name }))
                ];
            } else {
                const tmdbType = type === 'show' ? 'tv' : 'movie';
                const res = await fetch(`/api/tmdb/search?q=${encodeURIComponent(query)}&type=${tmdbType}`, { headers: { Authorization: `Bearer ${token}` } });
                const data = await res.json();
                results = (data.results || []).map(r => ({ ...r, _type: type, _title: type === 'show' ? r.name : r.title }));
            }
            resultsGrid.innerHTML = '';
            if (results.length === 0) { resultsGrid.innerHTML = '<p class="empty-message">No results.</p>'; return; }
            results.slice(0, 12).forEach(item => {
                const card = document.createElement('div');
                card.className = 'tmdb-result-card inline-list-card';
                const posterEl = item.poster_path
                    ? Object.assign(document.createElement('img'), { src: `https://image.tmdb.org/t/p/w154${item.poster_path}`, alt: item._title })
                    : Object.assign(document.createElement('div'), { className: 'poster-placeholder tmdb-result-poster-ph' });
                const titleP = document.createElement('p');
                titleP.textContent = item._title || 'Untitled';
                const hint = document.createElement('span');
                hint.className = 'add-hint';
                hint.textContent = 'Click to add';
                card.appendChild(posterEl);
                card.appendChild(titleP);
                card.appendChild(hint);
                card.addEventListener('click', async () => {
                    card.style.opacity = '0.5';
                    await onSelect({ title: item._title, type: item._type });
                    card.style.opacity = '1';
                    resultsGrid.innerHTML = '';
                    input.value = '';
                });
                resultsGrid.appendChild(card);
            });
        } catch (e) {
            resultsGrid.innerHTML = '<p class="empty-message">Search failed.</p>';
        }
    };
    input.addEventListener('input', () => { clearTimeout(debounceTimer); debounceTimer = setTimeout(doSearch, 350); });
    input.addEventListener('keypress', (e) => { if (e.key === 'Enter') { clearTimeout(debounceTimer); doSearch(); } });
    typeSelect.addEventListener('change', () => { if (input.value.trim()) doSearch(); });
    return wrap;
}

function buildListCard(list, { isShared, ownerName, searchTerm }) {
    const listDiv = document.createElement('div');
    listDiv.className = isShared ? 'list-card shared-list-card' : 'list-card';

    const safeNameAttr = (list.name || '').replace(/"/g, '&quot;');

    const collabNames = (!isShared && (list.collaborators || []).length > 0)
        ? (list.collaborators || []).map(c => c.firstName ? `${c.firstName} ${c.lastName}` : c.email)
        : [];

    listDiv.innerHTML = `
        <div class="list-card-header">
            <h3 class="list-name">${list.name}${isShared ? `<span class="meta" style="font-weight:normal;font-size:12px;"> · by ${ownerName}</span>` : ''}</h3>
            <div class="list-card-btns">
                ${!isShared
                    ? `<button type="button" class="share-list-btn">Share</button>
                       <button type="button" class="delete-list-btn" data-list-id="${list.id}" data-list-name="${safeNameAttr}">Delete list</button>`
                    : `<button type="button" class="leave-list-btn">Leave list</button>`
                }
            </div>
        </div>
        ${collabNames.length > 0 ? `<span class="list-collab-info meta">Shared with: ${collabNames.join(', ')}</span>` : ''}
        ${!isShared ? `<div class="share-list-form" style="display:none;margin-top:8px;">
            <select class="share-friend-select"><option value="">Loading friends...</option></select>
            <button type="button" class="share-invite-btn">Invite</button>
            <span class="share-feedback meta" style="margin-left:6px;"></span>
        </div>` : ''}
        <div class="list-items list-items-posters"></div>`;

    // Render item cards — click toggles a Remove button inside the card
    const itemsEl = listDiv.querySelector('.list-items');
    let items = list.items || [];
    if (searchTerm) items = items.filter(i => i.title.toLowerCase().includes(searchTerm));

    if (items.length > 0) {
        items.forEach(i => {
            const url = posterUrl({ title: i.title, type: 'movie' });
            const name = i.title || 'Untitled';
            const card = document.createElement('div');
            card.className = url ? 'list-item-poster list-item-clickable' : 'list-item list-item-clickable';

            if (url) {
                card.innerHTML = `<img src="${url}" alt="${name}"><span>${name}</span>
                    <div class="list-item-remove-overlay" style="display:none;">
                        <button class="list-item-remove-btn">Remove</button>
                    </div>`;
            } else {
                card.innerHTML = `<span>${name}</span>
                    <div class="list-item-remove-overlay" style="display:none;">
                        <button class="list-item-remove-btn">Remove</button>
                    </div>`;
            }

            const overlay = card.querySelector('.list-item-remove-overlay');
            card.addEventListener('click', (e) => {
                if (e.target.classList.contains('list-item-remove-btn')) return;
                const isOpen = overlay.style.display === 'flex';
                // Close all other open overlays in this list
                itemsEl.querySelectorAll('.list-item-remove-overlay').forEach(o => { o.style.display = 'none'; });
                overlay.style.display = isOpen ? 'none' : 'flex';
            });
            card.querySelector('.list-item-remove-btn').addEventListener('click', async (e) => {
                e.stopPropagation();
                const result = await DataModel.removeFromList(list.id, i.title);
                if (result.ok) renderDashboard();
                else alert(result?.data?.message || 'Could not remove item.');
            });
            itemsEl.appendChild(card);
        });
    } else {
        itemsEl.innerHTML = '<p class="empty-message">' + (searchTerm ? 'No matching items.' : 'Empty list') + '</p>';
    }

    // Share button wiring (owned lists only)
    if (!isShared) {
        const shareBtn = listDiv.querySelector('.share-list-btn');
        const shareForm = listDiv.querySelector('.share-list-form');
        const friendSelectEl = listDiv.querySelector('.share-friend-select');
        const inviteBtn = listDiv.querySelector('.share-invite-btn');
        const shareFeedback = listDiv.querySelector('.share-feedback');
        shareBtn.addEventListener('click', async () => {
            const open = shareForm.style.display === 'flex';
            shareForm.style.display = open ? 'none' : 'flex';
            if (!open) {
                friendSelectEl.innerHTML = '<option value="">Loading...</option>';
                const friends = await DataModel.getFriends();
                friendSelectEl.innerHTML = friends.length === 0
                    ? '<option value="">No friends yet</option>'
                    : '<option value="">Select a friend</option>' + friends.map(f => {
                        const fname = f.firstName ? `${f.firstName} ${f.lastName}` : f.email;
                        const already = (list.collaborators || []).some(c => c.email === f.email);
                        return `<option value="${f.email}" ${already ? 'disabled' : ''}>${fname}${already ? ' (shared)' : ''}</option>`;
                    }).join('');
            }
        });
        inviteBtn.addEventListener('click', async () => {
            const email = friendSelectEl.value;
            if (!email) return;
            inviteBtn.disabled = true;
            const result = await DataModel.inviteCollaborator(list.id, email);
            inviteBtn.disabled = false;
            if (result.ok) {
                shareFeedback.textContent = 'Invited!';
                setTimeout(() => { shareFeedback.textContent = ''; }, 3000);
                renderDashboard();
            } else {
                shareFeedback.textContent = result?.data?.message || 'Failed.';
            }
        });
    }

    // Leave button (shared lists the user joined)
    if (isShared) {
        listDiv.querySelector('.leave-list-btn').addEventListener('click', async () => {
            if (!confirm(`Leave "${list.name}"?`)) return;
            const result = await DataModel.leaveSharedList(list.id);
            if (result.ok) renderDashboard();
            else alert(result?.data?.message || 'Could not leave list.');
        });
    }

    return listDiv;
}

function renderLists(searchTerm) {
    const el = document.getElementById('listsContainer');
    const listSelect = document.getElementById('listSelect');
    const addToListForm = document.getElementById('addToListForm');
    if (!el) return;

    const lists = cachedLists;
    el.innerHTML = '';

    if (lists.length === 0) {
        el.innerHTML = '<p class="empty-message">No lists yet.</p>';
        if (addToListForm) addToListForm.style.display = 'none';
        return;
    }

    if (addToListForm) addToListForm.style.display = 'flex';
    if (listSelect) {
        listSelect.innerHTML = '<option value="">Select a list</option>';
        lists.forEach(list => {
            listSelect.innerHTML += `<option value="${list.id}">${list.name}</option>`;
        });
    }

    lists.forEach(list => {
        el.appendChild(buildListCard(list, { isShared: false, searchTerm }));
    });
}
