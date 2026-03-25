//////////////////////////////////////////////////////////////
// RATINGS.JS
//////////////////////////////////////////////////////////////

document.addEventListener('DOMContentLoaded', () => {

    const token = localStorage.getItem('jwtToken');

    if (!token) {
        window.location.href = '/';
        return;
    } else {
        DataModel.setToken(token);
    }

    const logoutButton = document.getElementById('logoutButton');
    const submitBtn = document.getElementById('submitRatingBtn');
    const ratingList = document.getElementById('ratingList');
    const ratingTitle = document.getElementById('ratingTitle');
    const ratingType = document.getElementById('ratingType');
    const ratingSearchResults = document.getElementById('ratingSearchResults');

    logoutButton.addEventListener('click', () => {
        localStorage.removeItem('jwtToken');
        window.location.href = '/';
    });

    // TMDB search for rating title
    let debounceTimer = null;
    const DEBOUNCE_MS = 400;
    const MIN_CHARS = 2;

    ratingTitle.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(loadRatingSearch, DEBOUNCE_MS);
    });
    ratingTitle.addEventListener('focus', () => {
        const q = ratingTitle.value?.trim();
        if (!q || q.length < MIN_CHARS) loadRatingSearch(true);
    });

    async function loadRatingSearch(showTrending = false) {
        if (!ratingSearchResults) return;
        const query = ratingTitle.value?.trim();
        const type = ratingType.value;
        const tmdbType = type === 'show' ? 'tv' : 'movie';

        if (showTrending || !query || query.length < MIN_CHARS) {
            ratingSearchResults.innerHTML = '<p class="loading-msg">Loading...</p>';
            try {
                const res = await fetch(`/api/trending/${type === 'show' ? 'shows' : 'movies'}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                if (!res.ok) throw new Error('Failed to load');
                const results = (data.results || []).map(r => ({
                    ...r,
                    _type: type,
                    _title: type === 'show' ? r.name : r.title
                }));
                renderRatingSearchResults(results);
            } catch (err) {
                console.error(err);
                ratingSearchResults.innerHTML = '<p class="loading-msg">Failed to load.</p>';
            }
            return;
        }

        ratingSearchResults.innerHTML = '<p class="loading-msg">Searching...</p>';
        try {
            const res = await fetch(`/api/tmdb/search?q=${encodeURIComponent(query)}&type=${tmdbType}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Search failed');
            const results = (data.results || []).map(r => ({
                ...r,
                _type: type,
                _title: type === 'show' ? r.name : r.title
            }));
            renderRatingSearchResults(results);
        } catch (err) {
            console.error(err);
            ratingSearchResults.innerHTML = '<p class="loading-msg">Search failed.</p>';
        }
    }

    function renderRatingSearchResults(results) {
        ratingSearchResults.innerHTML = '';
        const withPoster = results.filter(r => r.poster_path);
        if (withPoster.length === 0) {
            ratingSearchResults.innerHTML = '<p class="loading-msg">No results. Try a different search.</p>';
            return;
        }
        withPoster.forEach(item => {
            const card = document.createElement('div');
            card.className = 'tmdb-result-card';

            const img = document.createElement('img');
            img.src = `https://image.tmdb.org/t/p/w154${item.poster_path}`;
            img.alt = item._title || '';

            const titleP = document.createElement('p');
            titleP.textContent = item._title || 'Untitled';

            const preview = document.createElement('p');
            preview.className = 'tmdb-overview-preview';
            const ov = (item.overview && String(item.overview).trim()) || '';
            preview.textContent = ov || 'No description yet.';

            const actions = document.createElement('div');
            actions.className = 'tmdb-card-actions';
            const infoBtn = document.createElement('button');
            infoBtn.type = 'button';
            infoBtn.className = 'tmdb-info-btn';
            infoBtn.textContent = 'Details';
            infoBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (typeof openTitleDetailModal === 'function') {
                    openTitleDetailModal(item, item._type === 'show' ? 'tv' : 'movie');
                }
            });
            actions.appendChild(infoBtn);

            const hint = document.createElement('span');
            hint.className = 'add-hint';
            hint.textContent = 'Click card to select';

            card.appendChild(img);
            card.appendChild(titleP);
            card.appendChild(preview);
            card.appendChild(actions);
            card.appendChild(hint);

            card.addEventListener('click', () => {
                ratingTitle.value = item._title;
                ratingType.value = item._type;
                ratingSearchResults.innerHTML = '';
            });
            ratingSearchResults.appendChild(card);
        });
    }

    ratingType.addEventListener('change', () => {
        const q = ratingTitle.value?.trim();
        if (q && q.length >= MIN_CHARS) loadRatingSearch();
    });

    // Star rating click handler
    const starRating = document.getElementById('starRating');
    const scaleLabel = document.getElementById('scaleLabel');
    let selectedRating = 0;
    const scaleLabels = { 1: 'Poor', 2: 'Fair', 3: 'Good', 4: 'Very Good', 5: 'Excellent' };

    starRating.querySelectorAll('.star').forEach(star => {
        star.addEventListener('click', () => {
            selectedRating = parseInt(star.dataset.value, 10);
            starRating.querySelectorAll('.star').forEach((s, i) => {
                s.classList.toggle('selected', i < selectedRating);
            });
            scaleLabel.textContent = scaleLabels[selectedRating];
        });
    });

    submitBtn.addEventListener('click', async () => {
        const title = document.getElementById('ratingTitle').value.trim();
        const type = document.getElementById('ratingType').value;
        const review = document.getElementById('ratingReview').value.trim();
        const messageEl = document.getElementById('ratingMessage');

        if (!title || !selectedRating) {
            messageEl.textContent = 'Please enter a title and select a rating.';
            messageEl.style.color = '#dc3545';
            return;
        }

        const result = await DataModel.addRating(title, type, selectedRating, review || null);
        if (result.ok) {
            messageEl.textContent = 'Rating added! Added to watch history and marked as completed.';
            messageEl.style.color = '#28a745';
            ratingTitle.value = '';
            document.getElementById('ratingReview').value = '';
            selectedRating = 0;
            starRating.querySelectorAll('.star').forEach(s => s.classList.remove('selected'));
            scaleLabel.textContent = 'Select a rating';
            if (ratingSearchResults) ratingSearchResults.innerHTML = '';
            renderRatings();
        } else {
            messageEl.textContent = result.data?.message || 'Error adding rating.';
            messageEl.style.color = '#dc3545';
        }
    });

    async function renderRatings() {
        ratingList.innerHTML = '<p>Loading...</p>';
        const ratings = await DataModel.getRatings();
        ratingList.innerHTML = '';

        if (ratings.length === 0) {
            ratingList.innerHTML = '<p>No ratings yet.</p>';
            return;
        }
        const posterItems = ratings.map(r => ({ title: r.title, type: r.type || 'movie' }));
        const posters = await DataModel.getPostersForItems(posterItems);

        ratings.forEach(item => {
            const div = document.createElement('div');
            div.classList.add('rating-item');
            const date = new Date(item.rated_at).toLocaleDateString();
            const typeLabel = item.type === 'show' ? 'TV Show' : 'Movie';
            const key = `${item.title}|${item.type || 'movie'}`;
            const posterPath = posters[key];
            const posterHtml = posterPath
                ? `<img src="https://image.tmdb.org/t/p/w154${posterPath}" alt="${item.title}" class="rating-poster">`
                : '<div class="rating-poster poster-placeholder"></div>';

            div.innerHTML = `
                ${posterHtml}
                <div class="rating-details">
                    <strong>${item.title}</strong> <span class="type-badge">${typeLabel}</span>
                    ${'★'.repeat(item.rating)}${'☆'.repeat(5 - item.rating)} · ${date}
                    ${item.review ? `<p class="review-text">${item.review}</p>` : ''}
                </div>
            `;
            ratingList.appendChild(div);
        });
    }

    renderRatings();
});