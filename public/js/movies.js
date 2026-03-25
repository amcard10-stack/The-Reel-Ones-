document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('jwtToken');

    if (!token) {
        window.location.href = '/';
        return;
    }

    DataModel.setToken(token);

    const logoutButton = document.getElementById('logoutButton');
    const moviesRow = document.getElementById('moviesRow');
    const sectionTitle = document.getElementById('moviesSectionTitle');

const saveBtn = document.getElementById('saveFilterBtn');
const clearBtn = document.getElementById('clearFilterBtn');    

    const genreTabs = document.querySelectorAll('.genre-tab');

    const LOAD_BATCH = 20;
    const MAX_TRENDING_PAGES = 3;

    let currentPage = 1;
    let isLoadingMore = false;
    let currentGenre = 'all';

    if (!moviesRow) return;

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
            document.querySelectorAll('#filterPanel input[type="checkbox"]:checked')
        ).map(cb => cb.value);
    }
    saveBtn?.addEventListener('click', async () => {
    const selected = getSelectedSubscriptions();
    await DataModel.saveSubscriptions(selected);
    alert('Saved!');
});


    clearBtn?.addEventListener('click', async () => {
        document.querySelectorAll('#filterPanel input[type="checkbox"]').forEach(box => {
            box.checked = false;
        });
        await loadSelectedGenre();
    });

    // MAIN FIX: build URL with providers + genre
    function buildUrl(page) {
        const selectedFilters = getSelectedSubscriptions();
        const providerIds = selectedFilters.flatMap(f => PROVIDER_IDS[f] || []);

        const providerQuery = providerIds.length
            ? `&with_watch_providers=${providerIds.join('|')}&watch_region=US`
            : '';

        if (currentGenre === 'all') {
            return `/api/discover/movies?page=${page}${providerQuery}`;
        } else if (currentGenre === 'trending') {
            return `/api/trending/movies?page=${page}`; // TMDB limitation
        } else {
            return `/api/movies/by-genre?genreId=${currentGenre}&page=${page}${providerQuery}`;
        }
    }

    async function renderMoviesWithFilter(movies, selectedFilters, reset = true) {
        if (reset) {
            moviesRow.innerHTML = '';
        }

        let added = 0;

        for (const movie of movies) {
            if (added >= LOAD_BATCH) break;

            const card = createCardElement(movie);
            moviesRow.appendChild(card);
            added++;
        }

        addLoadMoreButton(selectedFilters);
    }

 function createCardElement(movie) {
    const card = document.createElement('div');
    card.className = 'media-card';

    const label = movie.title || movie.name || 'Title';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `View details: ${label}`);

    const img = document.createElement('img');
    img.src = movie.poster_path
        ? `https://image.tmdb.org/t/p/w342${movie.poster_path}`
        : 'https://via.placeholder.com/300x450?text=No+Image';

    const title = document.createElement('p');
    title.className = 'media-title';
    title.textContent = label;

    card.appendChild(img);
    card.appendChild(title);

    const openDetail = () => {
        window.location.href = `/title-details?id=${movie.id}&type=movie`;
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
            const newMovies = data.results || [];

            if (!newMovies.length) {
                wrap.remove();
                return;
            }

            await renderMoviesWithFilter(newMovies, selectedFilters, false);

            isLoadingMore = false;
        };

        wrap.appendChild(btn);
        moviesRow.parentElement.appendChild(wrap);
    }
async function loadSavedSubscriptions() {
    const result = await DataModel.getSubscriptions();
    const saved = result.subscriptions || result || [];

    document.querySelectorAll('#filterPanel input[type="checkbox"]').forEach(box => {
        box.checked = saved.includes(box.value);
    });
}
    async function loadSelectedGenre() {
        moviesRow.innerHTML = `<p style="padding:20px">Loading...</p>`;

        currentPage = 1;

        if (currentGenre === 'all') {
            sectionTitle.textContent = 'All Movies';
        } else if (currentGenre === 'trending') {
            sectionTitle.textContent = 'Trending';
        } else {
            sectionTitle.textContent = 'Movies';
        }

        const url = buildUrl(1);

        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` }
        });

        const data = await res.json();

        await renderMoviesWithFilter(data.results || [], getSelectedSubscriptions(), true);
    }

    genreTabs.forEach((btn) => {
        btn.addEventListener('click', async () => {
            genreTabs.forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');

            currentGenre = btn.dataset.genre;
            await loadSelectedGenre();
        });
    });

    document.querySelectorAll('#filterPanel input[type="checkbox"]').forEach((cb) => {
        cb.addEventListener('change', async () => {
            await loadSelectedGenre();
        });
    });

    await loadSavedSubscriptions();
    await loadSelectedGenre();
});