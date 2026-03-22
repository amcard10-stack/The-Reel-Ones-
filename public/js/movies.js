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

    async function createMovieCard(movie, type = 'movie') {
        const card = document.createElement('div');
        card.className = 'media-card';

        const title = movie.title || movie.name || 'Untitled';
        const availabilityData = await fetchAvailabilityData(movie.id, type);

        card.innerHTML = `
            <img
                src="${movie.poster_path
                    ? `https://image.tmdb.org/t/p/w342${movie.poster_path}`
                    : '/images/no-poster.png'}"
                alt="${title}"
                onerror="this.onerror=null; this.src='/images/no-poster.png';"
            >
            <p class="media-title">${title}</p>
            <p class="provider-label">${availabilityData.label}</p>
        `;

        return {
            card,
            streamingProviders: availabilityData.streamingProviders
        };
    }

    async function renderMoviesToRow(targetRow, movies, selectedFilters = []) {
        if (!targetRow) return;

        targetRow.innerHTML = '';

        const usableMovies = Array.isArray(movies)
            ? movies.filter((movie) => movie.poster_path)
            : [];

        if (!usableMovies.length) {
            targetRow.innerHTML = `<p style="color:#fff;padding:20px">No movies found.</p>`;
            return;
        }

        let visibleCount = 0;

        for (const movie of usableMovies) {
            const { card, streamingProviders } = await createMovieCard(movie, 'movie');

            if (!matchesSubscriptionFilter(streamingProviders, selectedFilters)) {
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
        const selectedFilters = getSelectedSubscriptions();
        const query = searchInput?.value?.trim() || '';

        try {
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

                await renderMoviesToRow(trendingRow, data.results || [], selectedFilters);
            } else {
                sectionTitle.textContent = 'Trending';

                const res = await fetch('/api/trending/movies', {
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

                await renderMoviesToRow(trendingRow, data.results || [], selectedFilters);
            }
        } catch (error) {
            console.error('Trending error:', error);
            trendingRow.innerHTML = `<p style="color:#fff;padding:20px">Failed to load movies.</p>`;
        }
    }

    async function loadGenreMovies(targetRow, genreId) {
        if (!targetRow) return;

        const selectedFilters = getSelectedSubscriptions();

        try {
            const res = await fetch(`/api/movies/by-genre?genreId=${genreId}`, {
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

            await renderMoviesToRow(targetRow, data.results || [], selectedFilters);
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

    // совместимость, если кнопки всё ещё есть в HTML
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