document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('jwtToken');

    if (!token) {
        window.location.href = '/';
        return;
    }

    const backButton = document.getElementById('backButton');
    const logoutButton = document.getElementById('logoutButton');

    const titlePoster = document.getElementById('titlePoster');
    const titleName = document.getElementById('titleName');
    const titleType = document.getElementById('titleType');
    const titleOverview = document.getElementById('titleOverview');

    const relatedTitlesGrid = document.getElementById('relatedTitlesGrid');
    const relatedFallback = document.getElementById('relatedFallback');
    const relatedError = document.getElementById('relatedError');

    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const rawType = params.get('type');
    const type = rawType === 'show' ? 'show' : 'movie';

    if (!id) {
        titleName.textContent = 'Title not found';
        titleType.textContent = type === 'show' ? 'TV series' : 'Movie';
        titleOverview.textContent = 'Missing title id.';
        relatedError.style.display = 'block';
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
        } catch (error) {
            console.error('Error loading title details:', error);
            titleName.textContent = 'Could not load title';
            titleOverview.textContent = 'There was a problem loading this title.';
            setDefaultPoster();
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

    await loadMainTitleDetails();
    await loadRelatedTitles();
});