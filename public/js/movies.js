document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('jwtToken');

    if (!token) {
        window.location.href = '/';
        return;
    }

    if (typeof DataModel !== 'undefined') {
        DataModel.setToken(token);
    }

    const logoutButton = document.getElementById('logoutButton');
    const row = document.getElementById('moviesRow');
    const searchInput = document.getElementById('movieSearch');
    const searchBtn = document.getElementById('movieSearchBtn');

    const sectionTitle = document.getElementById('moviesSectionTitle');
    const browseTitle = document.getElementById('browseSectionTitle');

    const applyBtn = document.getElementById('applyFilterBtn');
    const clearBtn = document.getElementById('clearFilterBtn');
    const saveBtn = document.getElementById('saveFilterBtn');

    if (!row || !allMoviesGrid) return;


    logoutButton?.addEventListener('click', () => {
        localStorage.removeItem('jwtToken');
        window.location.href = '/';
    });

    const PROVIDER_MAP = {
        netflix: ['8'],
        hulu: ['15'],
        disney: ['337'],
        max: ['189', '384'],
        prime: ['9']
    };

    let debounceTimer = null;
    const DEBOUNCE_MS = 400;
    const MIN_CHARS = 2;

    let browsePage = 1;
    let isSearchMode = false;
    let currentSearchQuery = '';
    let currentSearchPage = 1;
    let isLoadingMore = false;

    // ================= SEARCH =================
    searchBtn.addEventListener('click', handleSearchOrBrowseReset);

    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSearchOrBrowseReset();
    });

    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(handleSearchOrBrowseReset, DEBOUNCE_MS);
    });

    // ================= FILTER BUTTONS =================
    applyBtn?.addEventListener('click', refreshPageContent);

    clearBtn?.addEventListener('click', async () => {
        document.querySelectorAll('#filterPanel input[type="checkbox"]').forEach(box => {
            box.checked = false;
        });
        await refreshPageContent();
    });

    saveBtn?.addEventListener('click', async () => {
    const selectedProviders = getSelectedProviderKeys();

    console.log("SELECTED:", selectedProviders); 

    const result = await DataModel.saveSubscriptions(selectedProviders);
    console.log("RESULT:", result);

    alert(result.ok ? 'Subscriptions saved.' : 'Failed to save.');
});

    // ================= LOAD MORE =================
    loadMoreBtn?.addEventListener('click', async () => {
        if (isLoadingMore) return;

        isLoadingMore = true;
        loadMoreBtn.disabled = true;

        try {
            if (isSearchMode) {
                currentSearchPage++;
                const movies = await fetchSearchMovies(currentSearchQuery, currentSearchPage);
                renderGridMovies(movies, true);
            } else {
                browsePage++;
                const movies = await fetchBrowseMovies(browsePage);
                renderGridMovies(movies, true);
            }
        } finally {
            isLoadingMore = false;
            loadMoreBtn.disabled = false;
        }
    });

    // ================= HELPERS =================
    function getSelectedProviderKeys() {
        return Array.from(document.querySelectorAll('#filterPanel input:checked'))
            .map(box => box.value);
    }

    function getSelectedProviderIds() {
        return getSelectedProviderKeys()
            .flatMap(key => PROVIDER_MAP[key] || []);
    }

    async function loadSavedSubscriptions() {
        const saved = await DataModel.getSubscriptions();
        document.querySelectorAll('#filterPanel input').forEach(box => {
            box.checked = saved.includes(box.value);
        });
    }

    // ================= FILTER (SEARCH ONLY) =================
    async function filterMoviesByProviders(movies, selectedProviderIds) {
        if (!selectedProviderIds.length) return movies;

        const checks = await Promise.all(
            movies.map(async (movie) => {
                try {
                    const res = await fetch(`/api/movie/${movie.id}/providers`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });

                    const data = await res.json();
                    if (!res.ok) return null;

                    const providers = data.results?.US?.flatrate || [];
                    const ids = providers.map(p => String(p.provider_id));

                    return selectedProviderIds.some(id => ids.includes(id)) ? movie : null;
                } catch {
                    return null;
                }
            })
        );

        return checks.filter(Boolean);
    }

    // ================= FETCH =================
    async function fetchBrowseMovies(page = 1) {
    const ids = getSelectedProviderIds();
    const query = ids.length ? `&providers=${ids.join('|')}` : '';

    const res = await fetch(`/api/discover/movies?page=${page}${query}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await res.json();

    let movies = data.results || [];

    //apply filter
    movies = await filterMoviesByProviders(movies, ids);

    return movies;
}
    async function fetchSearchMovies(query, page = 1) {
        const res = await fetch(`/api/tmdb/search?q=${encodeURIComponent(query)}&type=movie&page=${page}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await res.json();
        let movies = data.results || [];

        movies = await filterMoviesByProviders(movies, getSelectedProviderIds());
        return movies;
    }

    // ================= LOAD TRENDING =================
    async function loadMovies() {
        const res = await fetch('/api/trending/movies', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await res.json();
        let movies = data.results || [];

        movies = await filterMoviesByProviders(movies, getSelectedProviderIds());
        renderMovies(movies);
    }

    function renderMovies(movies) {
        row.innerHTML = '';

        if (!movies.length) {
            row.innerHTML = `<p>No movies found.</p>`;
            return;
        }

        movies.forEach(movie => {
            if (!movie.poster_path) return;

            row.innerHTML += `
                <div class="media-card">
                    <img src="https://image.tmdb.org/t/p/w342${movie.poster_path}">
                    <p>${movie.title}</p>
                </div>
            `;
        });
    }

    function renderGridMovies(movies, append = false) {
        if (!append) allMoviesGrid.innerHTML = '';

        const valid = movies.filter(m => m.poster_path);

        if (!valid.length) {
            allMoviesGrid.innerHTML = `<p>No movies found.</p>`;
            return;
        }

        valid.forEach(movie => {
            allMoviesGrid.innerHTML += `
                <div class="media-card grid-card">
                    <img src="https://image.tmdb.org/t/p/w342${movie.poster_path}">
                    <p>${movie.title}</p>
                </div>
            `;
        });
    }

    // ================= MAIN LOGIC =================
    async function handleSearchOrBrowseReset() {
        const query = searchInput.value.trim();

        if (query.length >= MIN_CHARS) {
            isSearchMode = true;
            currentSearchQuery = query;
            currentSearchPage = 1;
            browseTitle.textContent = `Search: ${query}`;
            renderGridMovies(await fetchSearchMovies(query), false);
        } else {
            isSearchMode = false;
            browsePage = 1;
            browseTitle.textContent = 'Browse Movies';
            renderGridMovies(await fetchBrowseMovies(1), false);
        }

        await loadMovies();
    }

    async function refreshPageContent() {
        await handleSearchOrBrowseReset();
    }

    // ================= INIT =================
    await loadSavedSubscriptions();
    await handleSearchOrBrowseReset();
});
   