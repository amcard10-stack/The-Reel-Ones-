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
    const addWatchHistoryBtn = document.getElementById('addWatchHistoryBtn');
    const createListBtn = document.getElementById('createListBtn');
    const addToListBtn = document.getElementById('addToListBtn');
    //////////////////////////////////////////
    //END ELEMENTS TO ATTACH EVENT LISTENERS
    //////////////////////////////////////////


    //////////////////////////////////////////
    //EVENT LISTENERS
    //////////////////////////////////////////
    // Log out and redirect to login
    logoutButton.addEventListener('click', () => {
        localStorage.removeItem('jwtToken');
        window.location.href = '/';
    });

    // Refresh dashboard when the button is clicked
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

    addWatchHistoryBtn.addEventListener('click', async () => {
        const title = document.getElementById('watchHistoryTitle').value.trim();
        const type = document.getElementById('watchHistoryType').value;
        if (!title) return;
        const result = await DataModel.addWatchHistory(title, type);
        if (result.ok) {
            document.getElementById('watchHistoryTitle').value = '';
            filterBySearch();
        }
    });

    createListBtn?.addEventListener('click', async () => {
        const name = document.getElementById('newListName')?.value?.trim() || '';
        if (!name) return;

        const result = await DataModel.createList(name);
        if (result.ok) {
            const inp = document.getElementById('newListName');
            if (inp) inp.value = '';
            await renderDashboard();
        }
    });

    addToListBtn.addEventListener('click', async () => {
        const listId = document.getElementById('listSelect').value;
        const title = document.getElementById('listItemTitle').value.trim();
        if (!listId || !title) return;
        const result = await DataModel.addToList(listId, title);
        if (result.ok) {
            document.getElementById('listItemTitle').value = '';
            filterBySearch();
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
;
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

async function renderDashboard() {
    cachedWatchHistory = await DataModel.getWatchHistory();
    cachedLists = await DataModel.getLists();
    filterBySearch();
}

function filterBySearch() {
    const watchHistoryTerm = document.getElementById('watchHistorySearch')?.value?.trim().toLowerCase() || '';
    const listsTerm = document.getElementById('listsSearch')?.value?.trim().toLowerCase() || '';
    renderWatchHistory(watchHistoryTerm);
    renderLists(listsTerm);
}

function renderWatchHistory(searchTerm) {
    const el = document.getElementById('watchHistory');
    if (!el) return;

    let items = cachedWatchHistory || [];
    if (searchTerm) {
        items = items.filter(item => (item.title || '').toLowerCase().includes(searchTerm));
    }

    el.innerHTML = '';
    if (items.length === 0) {
        el.innerHTML = '<p class="empty-message">' +
            (searchTerm ? 'No matching items in watch history.' : 'No watch history yet.') +
            '</p>';
        return;
    }

    items.forEach(item => {
        const div = document.createElement('div');
        div.classList.add('dashboard-item');
        const date = new Date(item.watched_at).toLocaleDateString();
        div.innerHTML = `<strong>${item.title}</strong> <span class="meta">(${item.type}) · ${date}</span>`;
        el.appendChild(div);
    });
}

function renderLists(searchTerm) {
    const el = document.getElementById('listsContainer');
    const listSelect = document.getElementById('listSelect');
    const addToListForm = document.getElementById('addToListForm');
    if (!el || !listSelect || !addToListForm) return;

    const lists = cachedLists || [];
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
            items = items.filter(i => (i.title || '').toLowerCase().includes(searchTerm));
        }

        let itemsHtml = '';
        if (items.length > 0) {
            itemsHtml = items.map(i => {
                const itemForPoster = { title: i.title, type: 'movie' };
                const url = posterUrl(itemForPoster);
                const name = i.title || 'Untitled';
                return url
                ? `<div class="list-item-poster" data-title="${name}" data-type="movie">
                <img src="${url}" alt="${name}">
                <span>${name}</span>
                </div>`
                : `<div class="list-item" data-title="${name}" data-type="movie">
                ${name}
            </div>`;
            }).join('');
        } else {
            itemsHtml = '<p class="empty-message">' + (searchTerm ? 'No matching items.' : 'Empty list') + '</p>';
        }
        listDiv.innerHTML = `<h3 class="list-name">${list.name}</h3><div class="list-items">${itemsHtml}</div>`;
        el.appendChild(listDiv);
        
        listDiv.querySelectorAll('.list-item-poster, .list-item').forEach(item => {

    item.addEventListener('click', () => {

        const title = item.dataset.title;
        const type = item.dataset.type;

        showItemPopup({ title, type });

    });

});
    });
}

// NEW: render statuses
function renderStatuses(searchTerm) {
    const elW = document.getElementById('statusWatching');
    const elC = document.getElementById('statusCompleted');
    const elWT = document.getElementById('statusWant');
    if (!elW || !elC || !elWT) return;

    const items = (cachedStatuses || []).filter(x =>
        !searchTerm ? true : ((x.title || '').toLowerCase().includes(searchTerm))
    );

    const buckets = {
        watching: [],
        completed: [],
        want_to_watch: [],
    };

    items.forEach(x => {
        if (buckets[x.status]) buckets[x.status].push(x);
    });

    function renderInto(el, arr) {
        el.innerHTML = '';
        if (arr.length === 0) {
            el.innerHTML = `<p class="empty-message">Empty</p>`;
            return;
        }

        arr.forEach(item => {
            const div = document.createElement('div');
            div.className = 'status-card';
            div.innerHTML = `
        <div class="status-title">
          <strong>${item.title}</strong>
          <span class="meta">(${item.type})</span>
        </div>

        <select data-title="${encodeURIComponent(item.title)}" data-type="${item.type}">
          <option value="watching" ${item.status === 'watching' ? 'selected' : ''}>watching</option>
          <option value="completed" ${item.status === 'completed' ? 'selected' : ''}>completed</option>
          <option value="want_to_watch" ${item.status === 'want_to_watch' ? 'selected' : ''}>want to watch</option>
        </select>
      `;
            el.appendChild(div);

            const select = div.querySelector('select');
            select.addEventListener('change', async (e) => {
                const newStatus = e.target.value;
                const title = decodeURIComponent(e.target.dataset.title);
                const type = e.target.dataset.type;

                await DataModel.setStatus(title, type, newStatus);
                await renderDashboard(); // titles move automatically
            });
        });
    }

    renderInto(elW, buckets.watching);
    renderInto(elC, buckets.completed);
    renderInto(elWT, buckets.want_to_watch);
}
//////////////////////////////////////////
//END FUNCTIONS TO MANIPULATE THE DOM
//////////////////////////////////////////
});