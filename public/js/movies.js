document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('jwtToken');

    if (!token) {
        window.location.href = '/';
        return;
    }

    const logoutButton = document.getElementById('logoutButton');
    const trendingRow = document.getElementById('moviesRow');
    const actionRow = document.getElementById('actionMoviesRow');
    const comedyRow = document.getElementById('comedyMoviesRow');
    const horrorRow = document.getElementById('horrorMoviesRow');

    const searchInput = document.getElementById('movieSearch');
    const searchBtn = document.getElementById('movieSearchBtn');
    const sectionTitle = document.getElementById('moviesSectionTitle');

    const applyFilterBtn = document.getElementById('applyFilterBtn');
    const clearFilterBtn = document.getElementById('clearFilterBtn');

    if (!trendingRow) return;

    logoutButton?.addEventListener('click', () => {
        localStorage.removeItem('jwtToken');
        window.location.href = '/';
    });

    let debounceTimer = null;
    const DEBOUNCE_MS = 400;
    const MIN_CHARS = 2;

    searchBtn?.addEventListener('click', () => loadTrendingMovies());

    searchInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') loadTrendingMovies();
    });

    searchInput?.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => loadTrendingMovies(), DEBOUNCE_MS);
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

    function providerMatchesFilter(providerName, filter) {
        const name = (providerName || '').toLowerCase();

        if (filter === 'netflix') return name.includes('netflix');
        if (filter === 'hulu') return name.includes('hulu');
        if (filter === 'disney') return name.includes('disney');
        if (filter === 'max') return name.includes('max') || name.includes('hbo');
        if (filter === 'prime') return name.includes('amazon') || name.includes('prime');

        return false;
    }

    function matchesSubscriptionFilter(providerNames, selectedFilters) {
        if (!selectedFilters.length) return true;
        if (!providerNames.length) return false;

        return selectedFilters.some((filter) =>
            providerNames.some((provider) => providerMatchesFilter(provider, filter))
        );
    }

    async function fetchAvailabilityData(id, type) {
        if (!id) {
            return {
                label: 'Availability unavailable',
                providers: [],
                available: false
            };
        }

        try {
            const res = await fetch(`/api/title/providers?id=${id}&type=${type}`, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });

            if (!res.ok) {
                return {
                    label: 'Availability unavailable',
                    providers: [],
                    available: false
                };
            }

            const data = await res.json();

            return {
                label: data.label || 'Availability unavailable',
                providers: Array.isArray(data.providers) ? data.providers : [],
                available: !!data.available
            };
        } catch (error) {
            console.error('Availability error:', error);
            return {
                label: 'Availability unavailable',
                providers: [],
                available: false
            };
        }
    }

    async function createMovieCard(movie, type = 'movie') {
        const card = document.createElement('div');
        card.className = 'media-card';

        const title = movie.title || movie.name || 'Untitled';
        const availabilityData = await fetchAvailabilityData(movie.id, type);

        card.innerHTML = `
            <img src="https://image.tmdb.org/t/p/w342${movie.poster_path}" alt="${title}">
            <p class="media-title">${title}</p>
            <p class="provider-label">${availabilityData.label}</p>
        `;

        return {
            card,
            providers: availabilityData.providers
        };
    }

    async function renderMoviesToRow(targetRow, movies, selectedFilters = []) {
        if (!targetRow) return;

        targetRow.innerHTML = '';

        const usableMovies = movies.filter((movie) => movie.poster_path);

        if (!usableMovies.length) {
            targetRow.innerHTML = `<p style="color:#fff;padding:20px">No movies found.</p>`;
            return;
        }

        let visibleCount = 0;

        for (const movie of usableMovies) {
            const { card, providers } = await createMovieCard(movie, 'movie');

            if (!matchesSubscriptionFilter(providers, selectedFilters)) {
                continue;
            }

            targetRow.appendChild(card);
            visibleCount++;
        }

        if (visibleCount === 0) {
            targetRow.innerHTML = `<p style="color:#fff;padding:20px">No movies matched this filter.</p>`;
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

                if (!res.ok) {
                    throw new Error(data.message || 'Search failed');
                }

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

                if (!res.ok) {
                    throw new Error(data.message || 'Failed to load');
                }

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