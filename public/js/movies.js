document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('jwtToken');

    if (!token) {
        window.location.href = '/';
        return;
    }

    DataModel.setToken(token);

    const logoutButton = document.getElementById('logoutButton');
    const trendingRow = document.getElementById('moviesRow');
    const actionRow = document.getElementById('actionMoviesRow');
    const comedyRow = document.getElementById('comedyMoviesRow');
    const horrorRow = document.getElementById('horrorMoviesRow');

    const searchInput = document.getElementById('movieSearch');
    const searchBtn = document.getElementById('movieSearchBtn');
    const sectionTitle = document.getElementById('moviesSectionTitle');

    const clearFilterBtn = document.getElementById('clearFilterBtn');
    const saveBtn = document.getElementById('saveFilterBtn');
    const applyBtn = document.getElementById('applyFilterBtn');

    const DEBOUNCE_MS = 400;
    const MIN_CHARS = 2;
    const MAX_PAGES_TO_SCAN = 5;
    const TARGET_ROW_COUNT = 8;

    if (!trendingRow) return;

    logoutButton?.addEventListener('click', () => {
        localStorage.removeItem('jwtToken');
        window.location.href = '/';
    });

    let debounceTimer = null;

    searchBtn?.addEventListener('click', () => loadTrendingMovies());

    searchInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') loadTrendingMovies();
    });

    searchInput?.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            loadTrendingMovies();
        }, DEBOUNCE_MS);
    });

    function setupScrollButtons() {
        document.querySelectorAll('.row-container').forEach((container) => {
            const row = container.querySelector('.movie-row');
            const leftBtn = container.querySelector('.scroll-btn.left');
            const rightBtn = container.querySelector('.scroll-btn.right');

            if (!row) return;

            leftBtn?.addEventListener('click', () => {
                row.scrollBy({ left: -400, behavior: 'smooth' });
            });

            rightBtn?.addEventListener('click', () => {
                row.scrollBy({ left: 400, behavior: 'smooth' });
            });
        });
    }

    function getSelectedSubscriptions() {
        return Array.from(
            document.querySelectorAll('#filterPanel input[type="checkbox"]:checked')
        ).map((cb) => cb.value);
    }

    async function saveSelectedFilters() {
        const selected = getSelectedSubscriptions();
        try {
            await DataModel.saveSubscriptions(selected);
        } catch (error) {
            console.error('Failed to save subscriptions:', error);
        }
    }

    async function restoreSavedFilters() {
        try {
            const result = await DataModel.getSubscriptions();
            const saved = Array.isArray(result?.subscriptions)
                ? result.subscriptions
                : Array.isArray(result)
                    ? result
                    : [];

            document.querySelectorAll('#filterPanel input[type="checkbox"]').forEach((cb) => {
                cb.checked = saved.includes(cb.value);
            });
        } catch (error) {
            console.error('Failed to restore subscriptions:', error);
        }
    }

    function providerMatchesFilter(providerName, filter) {
        const name = (providerName || '').toLowerCase();

        if (filter === 'netflix') return name.includes('netflix');
        if (filter === 'hulu') return name.includes('hulu');
        if (filter === 'disney') return name.includes('disney');
        if (filter === 'max') return name.includes('max') || name.includes('hbo');
        if (filter === 'prime') return name.includes('amazon') || name.includes('prime');

        return false;
    }

    function matchesSubscriptionFilter(streamingProviders, selectedFilters) {
        if (!selectedFilters.length) return true;
        if (!Array.isArray(streamingProviders) || !streamingProviders.length) return false;

        return selectedFilters.some((filter) =>
            streamingProviders.some((provider) => providerMatchesFilter(provider, filter))
        );
    }

    function showLoading(row) {
        if (!row) return;
        row.innerHTML = `<p style="color:#fff;padding:20px">Loading...</p>`;
    }

    async function fetchAvailabilityData(id, type) {
        try {
            const res = await fetch(`/api/title/providers?id=${id}&type=${type}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.status === 401) {
                localStorage.removeItem('jwtToken');
                window.location.href = '/';
                return {
                    label: 'Availability unavailable',
                    streamingProviders: []
                };
            }

            const data = await res.json();

            if (!res.ok) {
                return {
                    label: 'Availability unavailable',
                    streamingProviders: []
                };
            }

            return {
                label: data.label || 'Availability unavailable',
                streamingProviders: Array.isArray(data.streamingProviders)
                    ? data.streamingProviders
                    : Array.isArray(data.providers)
                        ? data.providers
                        : []
            };
        } catch (error) {
            console.error('Availability error:', error);
            return {
                label: 'Availability unavailable',
                streamingProviders: []
            };
        }
    }

    function createCardElement(movie, label) {
        const card = document.createElement('div');
        card.className = 'media-card';

        const title = movie.title || movie.name || 'Untitled';

        card.innerHTML = `
            <img
                src="${movie.poster_path
                    ? `https://image.tmdb.org/t/p/w342${movie.poster_path}`
                    : '/images/no-poster.png'}"
                alt="${title}"
                onerror="this.onerror=null; this.src='/images/no-poster.png';"
            >
            <p class="media-title">${title}</p>
            <p class="provider-label">${label}</p>
        `;

        return card;
    }

async function buildFilteredMovieResults(movies, selectedFilters, limit = TARGET_ROW_COUNT) {
    const usableMovies = Array.isArray(movies)
        ? movies.filter((movie) => movie?.poster_path && movie?.id)
        : [];

    const results = [];
    const BATCH_SIZE = 6;

    for (let i = 0; i < usableMovies.length; i += BATCH_SIZE) {
        const batch = usableMovies.slice(i, i + BATCH_SIZE);

        const batchResults = await Promise.all(
            batch.map(async (movie) => {
                const availabilityData = await fetchAvailabilityData(movie.id, 'movie');
                return {
                    movie,
                    label: availabilityData.label,
                    streamingProviders: availabilityData.streamingProviders
                };
            })
        );

        for (const item of batchResults) {
            if (!selectedFilters.length || matchesSubscriptionFilter(item.streamingProviders, selectedFilters)) {
                results.push({
                    movie: item.movie,
                    label: item.label
                });
            }

            if (results.length >= limit) {
                return results;
            }
        }
    }

    return results;
}
    async function renderPreparedResults(targetRow, preparedResults) {
        if (!targetRow) return;

        targetRow.innerHTML = '';

        if (!preparedResults.length) {
            targetRow.innerHTML = `<p style="color:#fff;padding:20px">No movies matched this filter.</p>`;
            return;
        }

        for (const item of preparedResults) {
            const card = createCardElement(item.movie, item.label);
            targetRow.appendChild(card);
        }
    }

async function loadTrendingMovies() {
    const selectedFilters = getSelectedSubscriptions();
    const query = searchInput?.value?.trim() || '';

    try {
        let allMovies = [];

        if (query.length >= MIN_CHARS) {
            sectionTitle.textContent = `Results for "${query}"`;

            const res = await fetch(`/api/tmdb/search?q=${encodeURIComponent(query)}&type=movie`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.status === 401) {
                localStorage.removeItem('jwtToken');
                window.location.href = '/';
                return;
            }

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.message || 'Search failed');
            }

            allMovies = data.results || [];
        } else {
            sectionTitle.textContent = 'Trending';

            const collected = [];
            const seenIds = new Set();
            const pagesToScan = selectedFilters.length ? 3 : 1;

            for (let page = 1; page <= pagesToScan; page++) {
                const res = await fetch(`/api/trending/movies?page=${page}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });

                if (res.status === 401) {
                    localStorage.removeItem('jwtToken');
                    window.location.href = '/';
                    return;
                }

                const data = await res.json();

                if (!res.ok) {
                    throw new Error(data.message || 'Failed to load trending movies');
                }

                for (const movie of data.results || []) {
                    if (!seenIds.has(movie.id)) {
                        seenIds.add(movie.id);
                        collected.push(movie);
                    }
                }
            }

            allMovies = collected;
        }

        const preparedResults = await buildFilteredMovieResults(
            allMovies,
            selectedFilters,
            TARGET_ROW_COUNT
        );

        await renderPreparedResults(trendingRow, preparedResults);
    } catch (error) {
        console.error('Trending error:', error);
        trendingRow.innerHTML = `<p style="color:#fff;padding:20px">Failed to load movies.</p>`;
    }
}

    async function loadGenreMovies(targetRow, genreId) {
    if (!targetRow) return;

    const selectedFilters = getSelectedSubscriptions();

    try {
        const collected = [];
        const seenIds = new Set();

        const pagesToScan = selectedFilters.length ? 3 : 1;

        for (let page = 1; page <= pagesToScan; page++) {
            const res = await fetch(`/api/movies/by-genre?genreId=${genreId}&page=${page}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.status === 401) {
                localStorage.removeItem('jwtToken');
                window.location.href = '/';
                return;
            }

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.message || `Failed to load genre ${genreId}`);
            }

            for (const movie of data.results || []) {
                if (!seenIds.has(movie.id)) {
                    seenIds.add(movie.id);
                    collected.push(movie);
                }
            }
        }

        const preparedResults = await buildFilteredMovieResults(
            collected,
            selectedFilters,
            TARGET_ROW_COUNT
        );

        await renderPreparedResults(targetRow, preparedResults);
    } catch (error) {
        console.error(`Genre ${genreId} error:`, error);
        targetRow.innerHTML = `<p style="color:#fff;padding:20px">Failed to load movies.</p>`;
    }
}
    async function reloadAllRows() {
        showLoading(trendingRow);
        showLoading(actionRow);
        showLoading(comedyRow);
        showLoading(horrorRow);

        await Promise.all([
            loadTrendingMovies(),
            loadGenreMovies(actionRow, 28),
            loadGenreMovies(comedyRow, 35),
            loadGenreMovies(horrorRow, 27)
        ]);
    }

    document.querySelectorAll('#filterPanel input[type="checkbox"]').forEach((cb) => {
        cb.addEventListener('change', async () => {
            await saveSelectedFilters();
            await reloadAllRows();
        });
    });

    clearFilterBtn?.addEventListener('click', async () => {
        document.querySelectorAll('#filterPanel input[type="checkbox"]').forEach((cb) => {
            cb.checked = false;
        });

        await saveSelectedFilters();
        await reloadAllRows();
    });

    applyBtn?.addEventListener('click', async () => {
        await saveSelectedFilters();
        await reloadAllRows();
    });

    saveBtn?.addEventListener('click', async () => {
        await saveSelectedFilters();
    });

    setupScrollButtons();
    await restoreSavedFilters();
    await reloadAllRows();
});