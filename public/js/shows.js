document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('jwtToken');

    if (!token) {
        window.location.href = '/';
        return;
    }

    DataModel.setToken(token);

    const logoutButton = document.getElementById('logoutButton');
    const showsRow = document.getElementById('showsRow');
    const sectionTitle = document.getElementById('showsSectionTitle');

    const saveBtn = document.getElementById('saveFilterBtn');
    const clearBtn = document.getElementById('clearFilterBtn');
    const searchInput = document.getElementById('showSearch');
    const searchBtn = document.getElementById('showSearchBtn');

    const genreTabs = document.querySelectorAll('.genre-tab');

    const LOAD_BATCH = 20;
    const MAX_TRENDING_PAGES = 3;

    let currentPage = 1;
    let isLoadingMore = false;
    let currentGenre = 'all';

    if (!showsRow) return;

    const PROVIDER_IDS = {
        netflix: ['8'],
        prime: ['9'],
        hulu: ['15'],
        disney: ['337'],
        max: ['384', '189', '1899']
    };

    logoutButton?.addEventListener('click', () => {
        localStorage.removeItem('jwtToken');
        window.location.href = '/';
    });

    function getSelectedSubscriptions() {
        return Array.from(
            document.querySelectorAll('.filter-panel input[type="checkbox"]:checked')
        ).map(cb => cb.value);
    }

    saveBtn?.addEventListener('click', async () => {
        const selected = getSelectedSubscriptions();
        await DataModel.saveSubscriptions(selected);
        alert('Saved!');
    });

    clearBtn?.addEventListener('click', async () => {
        document.querySelectorAll('.filter-panel input[type="checkbox"]').forEach(box => {
            box.checked = false;
        });

        await DataModel.saveSubscriptions([]);
        await loadSelectedGenre();
    });

    function buildUrl(page) {
    const selectedFilters = getSelectedSubscriptions();
    const providerIds = selectedFilters.flatMap(f => PROVIDER_IDS[f] || []);

    const providerQuery = providerIds.length
        ? `&with_watch_providers=${providerIds.join('|')}&watch_region=US`
        : '';

    if (currentGenre === 'all') {
        return `/api/discover/tv?page=${page}${providerQuery}`;
    } else if (currentGenre === 'trending') {
        return `/api/trending/tv?page=${page}`; // TMDB limitation
    } else {
        return `/api/tv/by-genre?genreId=${currentGenre}&page=${page}${providerQuery}`;
    }
}

    async function renderShowsWithFilter(shows, selectedFilters, reset = true) {
        if (reset) {
            showsRow.innerHTML = '';
        }

        let added = 0;

        for (const show of shows) {
            if (added >= LOAD_BATCH) break;

            const card = createCardElement(show);
            showsRow.appendChild(card);
            added++;
        }

        addLoadMoreButton(selectedFilters);

        if (reset && !shows.length) {
            showsRow.innerHTML = `<p style="padding:20px">No shows found.</p>`;
        }
    }

    function createCardElement(show) {
        const card = document.createElement('div');
        card.className = 'media-card';

        const label = show.name || show.title || 'Title';
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', `View details: ${label}`);

        const img = document.createElement('img');
        img.src = show.poster_path
            ? `https://image.tmdb.org/t/p/w342${show.poster_path}`
            : 'https://via.placeholder.com/300x450?text=No+Image';

        const title = document.createElement('p');
        title.textContent = label;

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

    function addLoadMoreButton(selectedFilters) {
        const existing = document.querySelector('.load-more-wrap');
        if (existing) existing.remove();

        const wrap = document.createElement('div');
        wrap.className = 'load-more-wrap';

        const btn = document.createElement('button');
        btn.id = 'loadMoreBtn';
        btn.textContent = 'Load More';

        btn.onclick = async () => {
            if (isLoadingMore) return;
            isLoadingMore = true;

            currentPage++;

            if (currentGenre === 'trending' && currentPage > MAX_TRENDING_PAGES) {
                btn.textContent = 'No More Results';
                btn.disabled = true;
                isLoadingMore = false;
                return;
            }

            const url = buildUrl(currentPage);

            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` }
            });

            const data = await res.json();
            const newShows = data.results || [];

            if (!newShows.length) {
                wrap.remove();
                isLoadingMore = false;
                return;
            }

            await renderShowsWithFilter(newShows, selectedFilters, false);

            isLoadingMore = false;
        };

        wrap.appendChild(btn);
        showsRow.parentElement.appendChild(wrap);
    }

    async function searchShows() {
        const query = searchInput?.value.trim();

        if (!query) {
            await loadSelectedGenre();
            return;
        }

        showsRow.innerHTML = `<p style="padding:20px">Loading...</p>`;
        sectionTitle.textContent = `Search Results`;

        const res = await fetch(`/api/tmdb/search?q=${encodeURIComponent(query)}&type=tv`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        const data = await res.json();
        currentPage = 1;

        await renderShowsWithFilter(data.results || [], getSelectedSubscriptions(), true);
    }

    searchBtn?.addEventListener('click', async () => {
        await searchShows();
    });

    searchInput?.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            await searchShows();
        }
    });

    async function loadSavedSubscriptions() {
        const result = await DataModel.getSubscriptions();
        const saved = result.subscriptions || result || [];

        document.querySelectorAll('.filter-panel input[type="checkbox"]').forEach(box => {
            box.checked = saved.includes(box.value);
        });
    }

    async function loadSelectedGenre() {
        showsRow.innerHTML = `<p style="padding:20px">Loading...</p>`;

        currentPage = 1;

        if (currentGenre === 'all') {
            sectionTitle.textContent = 'All Shows';
        } else if (currentGenre === 'trending') {
            sectionTitle.textContent = 'Trending';
        } else {
            sectionTitle.textContent = 'Shows';
        }

        const url = buildUrl(1);

        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` }
        });

        const data = await res.json();

        await renderShowsWithFilter(data.results || [], getSelectedSubscriptions(), true);
    }

    genreTabs.forEach((btn) => {
        btn.addEventListener('click', async () => {
            genreTabs.forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');

            currentGenre = btn.dataset.genre;
            await loadSelectedGenre();
        });
    });

    document.querySelectorAll('.filter-panel input[type="checkbox"]').forEach((cb) => {
        cb.addEventListener('change', async () => {
            await loadSelectedGenre();
        });
    });

    await loadSavedSubscriptions();
    await loadSelectedGenre();
});