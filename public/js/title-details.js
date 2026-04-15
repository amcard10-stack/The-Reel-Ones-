document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('jwtToken');

    if (!token) {
        window.location.href = '/';
        return;
    }

    DataModel.setToken(token);

    const backButton = document.getElementById('backButton');
    const logoutButton = document.getElementById('logoutButton');

    const titlePoster = document.getElementById('titlePoster');
    const titleName = document.getElementById('titleName');
    const titleType = document.getElementById('titleType');
    const titleOverview = document.getElementById('titleOverview');
    const titleMeta = document.getElementById('titleMeta');
    const titleProviders = document.getElementById('titleProviders');

    const relatedTitlesGrid = document.getElementById('relatedTitlesGrid');
    const relatedFallback = document.getElementById('relatedFallback');
    const relatedError = document.getElementById('relatedError');
    const titleRatingSummary = document.getElementById('titleRatingSummary');

    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const rawType = params.get('type');
    const type = rawType === 'show' ? 'show' : 'movie';

    if (!id) {
        titleName.textContent = 'Title not found';
        titleType.textContent = type === 'show' ? 'TV series' : 'Movie';
        titleOverview.textContent = 'Missing title id.';
        relatedError.style.display = 'block';
        if (titleRatingSummary) titleRatingSummary.style.display = 'none';
        return;
    }

    backButton?.addEventListener('click', () => {
        if (window.history.length > 1) {
            window.history.back();
        } else {
            window.location.href = type === 'show' ? '/shows' : '/movies';
        }
    });

    logoutButton?.addEventListener('click', () => {
        localStorage.removeItem('jwtToken');
        window.location.href = '/';
    });

    function getTitleLabel(item) {
        if (!item) return 'Untitled';
        return item.title || item.name || 'Untitled';
    }

    function getTypeLabel(itemType) {
        return itemType === 'show' ? 'TV Show' : 'Movie';
    }

    function setDefaultPoster(label = 'No poster available') {
        titlePoster.src = 'https://dummyimage.com/500x750/2f3f56/ffffff&text=No+Poster';
        titlePoster.alt = label;
    }

    function createRelatedCard(item) {
        const card = document.createElement('div');
        card.className = 'related-card';
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', `View details: ${getTitleLabel(item)}`);

        const img = document.createElement('img');
        img.className = 'related-poster';
        img.src = item.posterPath
            ? `https://image.tmdb.org/t/p/w342${item.posterPath}`
            : 'https://dummyimage.com/342x513/2f3f56/ffffff&text=No+Poster';
        img.alt = getTitleLabel(item);
        img.onerror = () => {
            img.src = 'https://dummyimage.com/342x513/2f3f56/ffffff&text=No+Poster';
        };

        const name = document.createElement('p');
        name.className = 'related-title';
        name.textContent = getTitleLabel(item);

        const meta = document.createElement('p');
        meta.className = 'related-meta';
        meta.textContent = getTypeLabel(item.type);

        card.appendChild(img);
        card.appendChild(name);
        card.appendChild(meta);

        const openItem = () => {
            if (!item?.id) return;
            window.location.href = `/title-details?id=${encodeURIComponent(item.id)}&type=${encodeURIComponent(item.type || 'movie')}`;
        };

        card.addEventListener('click', openItem);
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openItem();
            }
        });

        return card;
    }

    function createMetaPill(text) {
        const span = document.createElement('span');
        span.className = 'title-meta-pill';
        span.textContent = text;
        return span;
    }

    function formatRuntime(mins) {
        const total = Number(mins);
        if (!Number.isFinite(total) || total <= 0) return null;

        const h = Math.floor(total / 60);
        const m = total % 60;

        if (h > 0 && m > 0) return `${h}h ${m}m`;
        if (h > 0) return `${h}h`;
        return `${m}m`;
    }

    function renderMeta(detail) {
        if (!titleMeta) return;
        titleMeta.innerHTML = '';

        const year = detail.releaseDate ? String(detail.releaseDate).slice(0, 4) : null;
        const rating = typeof detail.voteAverage === 'number' ? `★ ${detail.voteAverage.toFixed(1)}` : null;
        const runtime = formatRuntime(detail.runtime);
        const genres = Array.isArray(detail.genres) ? detail.genres : [];

        if (year) titleMeta.appendChild(createMetaPill(year));
        if (rating) titleMeta.appendChild(createMetaPill(rating));
        if (runtime) titleMeta.appendChild(createMetaPill(runtime));
        genres.forEach((genre) => titleMeta.appendChild(createMetaPill(genre)));
    }

    function renderProviders(providersData) {
        if (!titleProviders) return;

        titleProviders.innerHTML = '';

        const heading = document.createElement('p');
        heading.className = 'title-section-label';
        heading.textContent = 'Where to Watch';

        if (!providersData || !providersData.available || !Array.isArray(providersData.providers) || providersData.providers.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'title-provider-empty';
            empty.textContent = 'Not available right now.';
            titleProviders.appendChild(heading);
            titleProviders.appendChild(empty);
            return;
        }

        const row = document.createElement('div');
        row.className = 'title-providers-row';

        providersData.providers.forEach((provider) => {
            const chip = document.createElement('span');
            chip.className = 'title-provider-chip';
            chip.textContent = provider;
            row.appendChild(chip);
        });

        titleProviders.appendChild(heading);
        titleProviders.appendChild(row);
    }

    function renderFriendsPill(el, data, isError) {
        if (!el) return;
        el.style.display = '';
        el.classList.remove('title-friends-pill-row--loading', 'title-friends-pill-row--error');
        el.innerHTML = '';
        el.setAttribute('aria-busy', 'false');

        const span = document.createElement('span');
        span.className = 'title-friends-pill';

        if (isError || !data || typeof data.friends !== 'object') {
            el.classList.add('title-friends-pill-row--error');
            span.textContent = 'Friends: unavailable';
            el.appendChild(span);
            return;
        }

        const f = data.friends;
        if (f.count > 0) {
            const n = f.count;
            span.textContent = `Friends ★ ${f.average} (${n} rating${n === 1 ? '' : 's'})`;
        } else {
            span.textContent = 'No friend ratings yet';
        }

        el.appendChild(span);
    }

    async function loadFriendsRatingSummary(detail) {
        if (!titleRatingSummary || !detail) return;

        titleRatingSummary.setAttribute('aria-busy', 'true');
        titleRatingSummary.className = 'title-friends-pill-row title-friends-pill-row--loading';
        titleRatingSummary.innerHTML =
            '<span class="title-friends-pill title-friends-pill--loading">Loading friends…</span>';

        try {
            const data = await DataModel.getRatingSummary(detail.title, detail.type);
            renderFriendsPill(titleRatingSummary, data, !data);
        } catch (e) {
            console.error(e);
            renderFriendsPill(titleRatingSummary, null, true);
        }
    }

    async function loadMainTitleDetails() {
        titleType.textContent = type === 'show' ? 'TV series' : 'Movie';

        try {
            const [detailRes, providersRes] = await Promise.all([
                fetch(
                    `/api/title/details?id=${encodeURIComponent(id)}&type=${encodeURIComponent(type)}`,
                    { headers: { Authorization: `Bearer ${token}` } }
                ),
                fetch(
                    `/api/title/providers?id=${encodeURIComponent(id)}&type=${encodeURIComponent(type)}`,
                    { headers: { Authorization: `Bearer ${token}` } }
                )
            ]);

            if (!detailRes.ok) {
                throw new Error('Failed to load title details');
            }

            const detail = await detailRes.json();
            const providersData = providersRes.ok ? await providersRes.json() : null;

            titleName.textContent = detail.title || 'Untitled';
            titleType.textContent = detail.type === 'show' ? 'TV series' : 'Movie';
            titleOverview.textContent =
                detail.overview && String(detail.overview).trim()
                    ? detail.overview
                    : 'No synopsis is available for this title yet.';

            titlePoster.src = detail.posterPath
                ? `https://image.tmdb.org/t/p/w500${detail.posterPath}`
                : 'https://dummyimage.com/500x750/2f3f56/ffffff&text=No+Poster';

            titlePoster.alt = titleName.textContent || 'No poster available';
            titlePoster.onerror = () => setDefaultPoster();

            renderMeta(detail);
            renderProviders(providersData);

            return detail;
        } catch (error) {
            console.error('Error loading title details:', error);
            titleName.textContent = 'Could not load title';
            titleOverview.textContent = 'There was a problem loading this title.';
            setDefaultPoster();

            if (titleRatingSummary) titleRatingSummary.style.display = 'none';
            if (titleMeta) titleMeta.innerHTML = '';
            if (titleProviders) titleProviders.innerHTML = '';

            return null;
        }
    }

    async function loadRelatedTitles() {
        relatedTitlesGrid.innerHTML = '';
        relatedFallback.style.display = 'none';
        relatedError.style.display = 'none';

        try {
            const res = await fetch(
                `/api/title/related?id=${encodeURIComponent(id)}&type=${encodeURIComponent(type)}`,
                {
                    headers: { Authorization: `Bearer ${token}` }
                }
            );

            if (!res.ok) {
                throw new Error('Failed to load connected titles');
            }

            const data = await res.json();
            const items = Array.isArray(data.relatedTitles) ? data.relatedTitles : [];

            if (!items.length) {
                relatedFallback.style.display = 'block';
                return;
            }

            items.forEach((item) => {
                relatedTitlesGrid.appendChild(createRelatedCard(item));
            });
        } catch (error) {
            console.error('Error loading connected titles:', error);
            relatedError.style.display = 'block';
        }
    }

    const detail = await loadMainTitleDetails();
    if (detail) {
        await loadFriendsRatingSummary(detail);
    }
    await loadRelatedTitles();
});