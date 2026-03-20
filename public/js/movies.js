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

    searchBtn?.addEventListener('click', () => loadTrendingMovies());
    searchInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') loadTrendingMovies();
    });
    searchInput?.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(handleSearchOrBrowseReset, DEBOUNCE_MS);
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
        return Array.from(document.querySelectorAll('#filterPanel input[type="checkbox"]:checked'))
            .map((cb) => cb.value);
    }

    function matchesSubscriptionFilter(providerData, selectedFilters) {
        if (!selectedFilters.length) return true;
        if (!providerData?.flatrate?.length) return false;

        const providerNames = providerData.flatrate.map((p) => (p.providerName || '').toLowerCase());

        return selectedFilters.some((filter) => {
            if (filter === 'netflix') {
                return providerNames.some((name) => name.includes('netflix'));
            }
            if (filter === 'hulu') {
                return providerNames.some((name) => name.includes('hulu'));
            }
            if (filter === 'disney') {
                return providerNames.some((name) => name.includes('disney'));
            }
            if (filter === 'max') {
                return providerNames.some((name) => name.includes('max') || name.includes('hbo'));
            }
            if (filter === 'prime') {
                return providerNames.some((name) => name.includes('amazon') || name.includes('prime'));
            }
            return false;
        });
    }

    async function fetchProviders(tmdbId, type) {
        try {
            const res = await fetch(`/api/title/providers?tmdbId=${tmdbId}&type=${type}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) return null;
            return data;
        } catch (err) {
            console.error('Provider fetch failed:', err);
            return null;
        }
    }

    function formatProviders(providerData) {
        if (!providerData) {
            return 'Availability unavailable';
        }

        if (providerData.flatrate && providerData.flatrate.length > 0) {
            const names = providerData.flatrate.slice(0, 3).map((p) => p.providerName);
            return `Streaming on: ${names.join(', ')}`;
        }

        if (providerData.rent && providerData.rent.length > 0) {
            const names = providerData.rent.slice(0, 3).map((p) => p.providerName);
            return `Available to rent: ${names.join(', ')}`;
        }

        if (providerData.buy && providerData.buy.length > 0) {
            const names = providerData.buy.slice(0, 3).map((p) => p.providerName);
            return `Available to buy: ${names.join(', ')}`;
        }

        return 'Not available for streaming';
    }

    async function renderMoviesToRow(targetRow, movies, selectedFilters = []) {
        if (!targetRow) return;

        targetRow.innerHTML = '';

        const usableMovies = movies.filter((movie) => movie.poster_path);

        if (!usableMovies.length) {
            targetRow.innerHTML = `<p style="color:#666;padding:20px">No movies found.</p>`;
            return;
        }

        const cards = [];

        for (const movie of usableMovies) {
            const card = document.createElement('div');
            card.className = 'media-card';

            card.innerHTML = `
                <img src="https://image.tmdb.org/t/p/w342${movie.poster_path}" alt="${movie.title || ''}">
                <p class="media-title">${movie.title || 'Untitled'}</p>
                <p class="provider-label">Loading availability...</p>
            `;

            targetRow.appendChild(card);
            cards.push({ movie, card });
        }

        let visibleCount = 0;

        for (const { movie, card } of cards) {
            const providerLabel = card.querySelector('.provider-label');
            const providerData = await fetchProviders(movie.id, 'movie');

            if (!matchesSubscriptionFilter(providerData, selectedFilters)) {
                card.remove();
                continue;
            }

            providerLabel.textContent = formatProviders(providerData);
            visibleCount++;
        }

        if (visibleCount === 0) {
            targetRow.innerHTML = `<p style="color:#666;padding:20px">No movies matched this filter.</p>`;
        }
    }

    async function loadTrendingMovies() {
        const query = searchInput?.value?.trim();
        const selectedFilters = getSelectedSubscriptions();
        trendingRow.innerHTML = '';

        if (query && query.length >= MIN_CHARS) {
            sectionTitle.textContent = `Results for "${query}"`;
            try {
                const res = await fetch(`/api/tmdb/search?q=${encodeURIComponent(query)}&type=movie`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.message || 'Search failed');
                await renderMoviesToRow(trendingRow, data.results || [], selectedFilters);
            } catch (err) {
                console.error(err);
                trendingRow.innerHTML = `<p style="color:#dc3545;padding:20px">${err.message}</p>`;
            }
        } else {
            sectionTitle.textContent = 'Trending';
            try {
                const res = await fetch('/api/trending/movies', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.message || 'Failed to load');
                await renderMoviesToRow(trendingRow, data.results || [], selectedFilters);
            } catch (err) {
                console.error(err);
                trendingRow.innerHTML = `<p style="color:#dc3545;padding:20px">Failed to load movies.</p>`;
            }
        }
    }

    async function loadGenreMovies(targetRow, genreId) {
        if (!targetRow) return;

        const selectedFilters = getSelectedSubscriptions();
        targetRow.innerHTML = '';

        try {
            const res = await fetch(`/api/movies/by-genre?genreId=${genreId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            const text = await res.text();
            let data;

            try {
                data = JSON.parse(text);
            } catch {
                throw new Error(`Server returned non-JSON response for genre ${genreId}`);
            }

            if (!res.ok) {
                throw new Error(data.message || 'Failed to load genre movies');
            }

            await renderMoviesToRow(targetRow, data.results || [], selectedFilters);
        } catch (err) {
            console.error(err);
            targetRow.innerHTML = `<p style="color:#dc3545;padding:20px">${err.message}</p>`;
        }
    }

    async function reloadAllRows() {
        await Promise.all([
            loadTrendingMovies(),
            loadGenreMovies(actionRow, 28),
            loadGenreMovies(comedyRow, 35),
            loadGenreMovies(horrorRow, 27)
        ]);
    }

    applyFilterBtn?.addEventListener('click', reloadAllRows);

    clearFilterBtn?.addEventListener('click', async () => {
        document.querySelectorAll('#filterPanel input[type="checkbox"]').forEach((cb) => {
            cb.checked = false;
        });
        await reloadAllRows();
    });

    setupScrollButtons();
    await reloadAllRows();
});
