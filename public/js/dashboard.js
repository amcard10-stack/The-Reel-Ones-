////////////////////////////////////////////////////////////////
//DASHBOARD.JS
//THIS IS YOUR "CONTROLLER", IT ACTS AS THE MIDDLEMAN
// BETWEEN THE MODEL (datamodel.js) AND THE VIEW (dashboard.html)
////////////////////////////////////////////////////////////////


//ADD ALL EVENT LISTENERS INSIDE DOMCONTENTLOADED
//AT THE BOTTOM OF DOMCONTENTLOADED, ADD ANY CODE THAT NEEDS TO RUN IMMEDIATELY
document.addEventListener('DOMContentLoaded', () => {
    
    //////////////////////////////////////////
    //ELEMENTS TO ATTACH EVENT LISTENERS
    //////////////////////////////////////////
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
    //////////////////////////////////////////
    //END ELEMENTS TO ATTACH EVENT LISTENERS
    //////////////////////////////////////////


    //////////////////////////////////////////
    //EVENT LISTENERS
    //////////////////////////////////////////
    logoutButton.addEventListener('click', () => {
        localStorage.removeItem('jwtToken');
        window.location.href = '/';
    });

    refreshButton.addEventListener('click', async () => {
        renderDashboard();
    });

    if (watchHistorySearch) {
        watchHistorySearch.addEventListener('input', () => filterBySearch());
        watchHistorySearch.addEventListener('keypress', (e) => { if (e.key === 'Enter') filterBySearch(); });
    }
    if (listsSearch) {
        listsSearch.addEventListener('input', () => filterBySearch());
        listsSearch.addEventListener('keypress', (e) => { if (e.key === 'Enter') filterBySearch(); });
    }

    createListBtn.addEventListener('click', async () => {
        const name = document.getElementById('newListName').value.trim();
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
    //////////////////////////////////////////
    //END EVENT LISTENERS
    //////////////////////////////////////////


    //////////////////////////////////////////////////////
    //CODE THAT NEEDS TO RUN IMMEDIATELY AFTER PAGE LOADS
    //////////////////////////////////////////////////////
    // Initial check for the token
    const token = localStorage.getItem('jwtToken');
    if (!token) {
        window.location.href = '/';
    } else {
        DataModel.setToken(token);
        renderDashboard();
    }
    //////////////////////////////////////////
    //END CODE THAT NEEDS TO RUN IMMEDIATELY AFTER PAGE LOADS
    //////////////////////////////////////////
});
//END OF DOMCONTENTLOADED


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
            card.innerHTML = `
                <img src="https://image.tmdb.org/t/p/w154${item.poster_path}" alt="${item._title || ''}">
                <p>${item._title || 'Untitled'}</p>
                <span class="add-hint">Click to add</span>
            `;
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

async function renderDashboard() {
    cachedWatchHistory = await DataModel.getWatchHistory();
    cachedLists = await DataModel.getLists();
    cachedStatuses = await DataModel.getStatuses();

    const posterItems = [
        ...cachedWatchHistory.map(w => ({ title: w.title, type: w.type || 'movie' })),
        ...cachedStatuses.map(s => ({ title: s.title, type: s.type || 'movie' })),
        ...cachedLists.flatMap(list => (list.items || []).map(i => ({ title: i.title, type: 'movie' })))
    ];
    posterCache = await DataModel.getPostersForItems(posterItems);

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
                return url
                    ? `<div class="list-item-poster"><img src="${url}" alt="${name}"><span>${name}</span></div>`
                    : `<div class="list-item">${name}</div>`;
            }).join('');
        } else {
            itemsHtml = '<p class="empty-message">' + (searchTerm ? 'No matching items.' : 'Empty list') + '</p>';
        }
        listDiv.innerHTML = `<h3 class="list-name">${list.name}</h3><div class="list-items list-items-posters">${itemsHtml}</div>`;
        el.appendChild(listDiv);
    });
}
//////////////////////////////////////////
//END FUNCTIONS TO MANIPULATE THE DOM
//////////////////////////////////////////