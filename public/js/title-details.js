document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('jwtToken');

    if (!token) {
        window.location.href = '/';
        return;
    }

    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const type = params.get('type');

    const backButton = document.getElementById('backButton');
    const logoutButton = document.getElementById('logoutButton');
    const titlePoster = document.getElementById('titlePoster');
    const titleName = document.getElementById('titleName');
    const titleType = document.getElementById('titleType');
    const titleOverview = document.getElementById('titleOverview');
    const relatedGrid = document.getElementById('relatedTitlesGrid');
    const relatedFallback = document.getElementById('relatedFallback');
    const relatedError = document.getElementById('relatedError');

    if (!id || !type) {
        titleName.textContent = 'Invalid title';
        titleOverview.textContent = 'Missing id or type.';
        return;
    }

    backButton?.addEventListener('click', () => {
        if (type === 'show') {
            window.location.href = '/shows';
        } else {
            window.location.href = '/movies';
        }
    });

    logoutButton?.addEventListener('click', () => {
        localStorage.removeItem('jwtToken');
        window.location.href = '/';
    });

    async function fetchJson(url) {
        const res = await fetch(url, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (res.status === 401) {
            localStorage.removeItem('jwtToken');
            window.location.href = '/';
            return null;
        }

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.message || 'Request failed');
        }

        return data;
    }

    function renderRelatedTitles(items) {
        relatedGrid.innerHTML = '';

        if (!Array.isArray(items) || items.length === 0) {
            relatedFallback.style.display = 'block';
            return;
        }

        relatedFallback.style.display = 'none';

        items.forEach((item) => {
            const card = document.createElement('div');
            card.className = 'related-card';

            const poster = item.posterPath
                ? `https://image.tmdb.org/t/p/w342${item.posterPath}`
                : '/images/no-poster.png';

            card.innerHTML = `
                <img src="${poster}" alt="${item.title}" onerror="this.onerror=null; this.src='/images/no-poster.png';">
                <p class="related-title">${item.title}</p>
                <p class="related-type">${item.type}</p>
            `;

            card.addEventListener('click', () => {
                window.location.href = `/title-details?id=${item.id}&type=${item.type}`;
            });

            relatedGrid.appendChild(card);
        });
    }

    try {
        const details = await fetchJson(`/api/title/details?id=${id}&type=${type}`);
        if (!details) return;

        const poster = details.posterPath
            ? `https://image.tmdb.org/t/p/w342${details.posterPath}`
            : '/images/no-poster.png';

        titlePoster.src = poster;
        titlePoster.alt = details.title || 'Title poster';
        titleName.textContent = details.title || 'Untitled';
        titleType.textContent = details.type || type;
        titleOverview.textContent = details.overview || 'No description available.';

        const related = await fetchJson(`/api/title/related?id=${id}&type=${type}`);
        if (!related) return;

        renderRelatedTitles(related.relatedTitles || []);
    } catch (error) {
        console.error(error);
        relatedError.style.display = 'block';
        titleName.textContent = 'Could not load title';
        titleOverview.textContent = 'Something went wrong while loading this page.';
    }
});