document.addEventListener('DOMContentLoaded', async () => {
    console.log('SHOWS JS RUNNING'); //debug tool

    const token = localStorage.getItem('jwtToken');

    if (!token) {
        window.location.href = '/';
        return;
    }

    DataModel.setToken(token);

    const trendingRow = document.getElementById('trendingShowsRow');
    const showsGrid = document.getElementById('showsGrid');
    const searchInput = document.getElementById('showSearch');
    const searchBtn = document.getElementById('showSearchBtn');
    const browseTitle = document.getElementById('browseSectionTitle');
    const loadMoreBtn = document.getElementById('loadMoreBtn');

    const applyBtn = document.getElementById('applyFilterBtn');
    const clearBtn = document.getElementById('clearFilterBtn');
    const saveBtn = document.getElementById('saveFilterBtn');

    if (!trendingRow || !showsGrid) return;

    const PROVIDER_MAP = {
        netflix: ['8'],
        hulu: ['15'],
        disney: ['337'],
        max: ['1899'],
        prime: ['9']
    };

    let browsePage = 1;
    let isSearchMode = false;
    let currentSearchQuery = '';
    let currentSearchPage = 1;

    function getSelectedProviderKeys() {
        return Array.from(document.querySelectorAll('.subscription-filter:checked'))
            .map(box => box.value);
    }

    function getSelectedProviderIds() {
        return getSelectedProviderKeys()
            .flatMap(key => PROVIDER_MAP[key] || []);
    }

    saveBtn?.addEventListener('click', async () => {
        const selected = getSelectedProviderKeys();
        await DataModel.saveSubscriptions(selected);
        alert('Saved!');
    });

    clearBtn?.addEventListener('click', async () => {
        document.querySelectorAll('.subscription-filter').forEach(box => {
            box.checked = false;
        });
        await loadContent();
    });

    applyBtn?.addEventListener('click', loadContent);

    async function loadSavedSubscriptions() {
        const result = await DataModel.getSubscriptions();
        const saved = result.subscriptions || result || [];

        document.querySelectorAll('.subscription-filter').forEach(box => {
            box.checked = saved.includes(box.value);
        });
    }

    async function fetchBrowseShows(page = 1) {
        const ids = getSelectedProviderIds();
        const query = ids.length ? `&providers=${ids.join(',')}` : '';

        const res = await fetch(`/api/discover/tv?page=${page}${query}`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        const data = await res.json();
        return data.results || [];
    }

    async function fetchSearchShows(query, page = 1) {
        const res = await fetch(`/api/tmdb/search?q=${encodeURIComponent(query)}&type=tv&page=${page}`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        const data = await res.json();
        return data.results || [];
    }

    async function filterShowsByProviders(shows, selectedProviderIds) {
        if (!selectedProviderIds.length) return shows;

        const checks = await Promise.all(
            shows.map(async (show) => {
                try {
                    const res = await fetch(`/api/tv/${show.id}/providers`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });

                    const data = await res.json();
                    if (!res.ok) return null;

                    const providers = data.results?.US?.flatrate || [];
                    const ids = providers.map(p => String(p.provider_id));

                    return selectedProviderIds.some(id => ids.includes(id)) ? show : null;
                } catch {
                    return null;
                }
            })
        );

        return checks.filter(Boolean);
    }

    async function loadTrending() {
        console.log('TRENDING FUNCTION RUNNING'); // debug

        const res = await fetch('/api/trending/tv', { 
            headers: { Authorization: `Bearer ${token}` }
        });

        const data = await res.json();
        console.log('TRENDING DATA:', data); // debug

        let shows = data.results || [];

        shows = await filterShowsByProviders(shows, getSelectedProviderIds());

        renderTrending(shows.slice(0, 10)); 
    }

    function createShowCard(show, extraClass) {
        const card = document.createElement('div');
        card.className = extraClass ? `media-card ${extraClass}` : 'media-card';
        const name = show.name || 'Show';
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', `View details: ${name}`);

        const img = document.createElement('img');
        img.src = `https://image.tmdb.org/t/p/w342${show.poster_path}`;
        img.alt = name;

        const title = document.createElement('p');
        title.textContent = name;

        card.appendChild(img);
        card.appendChild(title);

        const openDetail = () => {
            if (typeof openTitleDetailModal === 'function') {
                openTitleDetailModal(show, 'tv');
            }
        };
        card.addEventListener('click', openDetail);
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openDetail();
            }
        });

        return card;
    }

    function renderTrending(shows) {
        trendingRow.innerHTML = '';

        shows.forEach(show => {
            if (!show.poster_path) return;
            trendingRow.appendChild(createShowCard(show, ''));
        });
    }

    function renderGrid(shows, append = false) {
        if (!append) showsGrid.innerHTML = '';

        shows.forEach(show => {
            if (!show.poster_path) return;
            showsGrid.appendChild(createShowCard(show, 'grid-card'));
        });
    }

    async function loadContent() {
        console.log('LOADING CONTENT');// debug

        const query = searchInput?.value?.trim() || '';

        if (query.length >= 2) {
            isSearchMode = true;
            currentSearchQuery = query;
            currentSearchPage = 1;
            browseTitle.textContent = `Search: ${query}`;
            renderGrid(await fetchSearchShows(query));
        } else {
            isSearchMode = false;
            browsePage = 1;
            browseTitle.textContent = 'Browse Shows';
            renderGrid(await fetchBrowseShows(1));
        }

        console.log('CALLING TRENDING...'); // debug
        await loadTrending();
    }

    loadMoreBtn?.addEventListener('click', async () => {
        if (isSearchMode) {
            currentSearchPage++;
            const more = await fetchSearchShows(currentSearchQuery, currentSearchPage);
            renderGrid(more, true);
        } else {
            browsePage++;
            const more = await fetchBrowseShows(browsePage);
            renderGrid(more, true);
        }
    });

    searchBtn?.addEventListener('click', loadContent);

    await loadSavedSubscriptions();
    await loadContent();
});