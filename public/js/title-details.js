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

    function renderPageRatingSummary(el, data, isError) {
        if (!el) return;
        el.style.display = '';
        el.classList.remove('title-rating-summary--loading', 'title-rating-summary--error');
        el.innerHTML = '';
        el.setAttribute('aria-busy', 'false');
        if (isError || !data || typeof data.global !== 'object' || typeof data.friends !== 'object') {
            el.classList.add('title-rating-summary--error');
            const p = document.createElement('p');
            p.textContent = 'Rating data unavailable';
            el.appendChild(p);
            return;
        }
        const g = data.global;
        const f = data.friends;
        const p1 = document.createElement('p');
        p1.className = 'title-rating-summary-line';
        p1.textContent =
            g.count > 0
                ? `Community: ★ ${g.average} (${g.count} rating${g.count === 1 ? '' : 's'})`
                : 'Community: No ratings yet';
        const p2 = document.createElement('p');
        p2.className = 'title-rating-summary-line';
        p2.textContent =
            f.count > 0
                ? `Friends: ★ ${f.average} (${f.count} rating${f.count === 1 ? '' : 's'})`
                : 'Friends: No friend ratings yet';
        el.appendChild(p1);
        el.appendChild(p2);
    }

    async function loadRatingSummary(detail) {
        if (!titleRatingSummary || !detail) return;
        titleRatingSummary.setAttribute('aria-busy', 'true');
        titleRatingSummary.className = 'title-rating-summary title-rating-summary--loading';
        titleRatingSummary.innerHTML = '<p class="title-rating-summary-loading-text">Loading community ratings…</p>';
        try {
            const data = await DataModel.getRatingSummary(detail.title, detail.type);
            renderPageRatingSummary(titleRatingSummary, data, !data);
        } catch (e) {
            console.error(e);
            renderPageRatingSummary(titleRatingSummary, null, true);
        }
    }

    async function loadMainTitleDetails() {
        titleType.textContent = type === 'show' ? 'TV series' : 'Movie';

        try {
            const res = await fetch(
                `/api/title/details?id=${encodeURIComponent(id)}&type=${encodeURIComponent(type)}`,
                {
                    headers: { Authorization: `Bearer ${token}` }
                }
            );

            if (!res.ok) {
                throw new Error('Failed to load title details');
            }

            const detail = await res.json();

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
            return detail;
        } catch (error) {
            console.error('Error loading title details:', error);
            titleName.textContent = 'Could not load title';
            titleOverview.textContent = 'There was a problem loading this title.';
            setDefaultPoster();
            if (titleRatingSummary) {
                titleRatingSummary.style.display = 'none';
            }
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
        await loadRatingSummary(detail);
    }
    await loadRelatedTitles();
});