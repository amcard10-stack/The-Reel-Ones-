//////////////////////////////////////////////////////////////
// SUBSCRIPTIONS.JS
//////////////////////////////////////////////////////////////

document.addEventListener('DOMContentLoaded', async () => {

    const token = localStorage.getItem('jwtToken');

    if (!token) {
        window.location.href = '/';
        return;
    }

    DataModel.setToken(token);

    const logoutButton = document.getElementById('logoutButton');
    const resultsEl = document.getElementById('results');
    const saveBtn = document.getElementById('saveSubscriptionsBtn');

    if (logoutButton) {
        logoutButton.addEventListener('click', () => {
            localStorage.removeItem('jwtToken');
            window.location.href = '/';
        });
    }

    /* Load trending movies & TV for the poster grid */
    async function loadTrending() {
        if (!resultsEl) return;
        resultsEl.innerHTML = '<p>Loading...</p>';
        try {
            const [moviesRes, showsRes] = await Promise.all([
                fetch('/api/trending/movies', { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch('/api/trending/shows', { headers: { 'Authorization': `Bearer ${token}` } })
            ]);
            const moviesData = await moviesRes.json();
            const showsData = await showsRes.json();
            const movies = moviesData.results || [];
            const shows = showsData.results || [];
            const combined = [...movies.slice(0, 5), ...shows.slice(0, 5)];
            renderPosters(combined);
        } catch (err) {
            console.error(err);
            resultsEl.innerHTML = '<p>Failed to load trending content.</p>';
        }
    }

    function renderPosters(items) {
        resultsEl.innerHTML = '';
        items.forEach(item => {
            const posterPath = item.poster_path;
            const title = item.title || item.name || 'Unknown';
            if (!posterPath) return;
            const card = document.createElement('div');
            card.className = 'poster-card';
            card.innerHTML = `
                <img src="https://image.tmdb.org/t/p/w342${posterPath}" alt="${title}">
                <p>${title}</p>
            `;
            resultsEl.appendChild(card);
        });
    }

    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            const labels = { netflix: 'Netflix', hulu: 'Hulu', amazon: 'Amazon Prime', disney: 'Disney+' };
            const checkboxes = document.querySelectorAll('#netflix, #hulu, #amazon, #disney');
            const selected = Array.from(checkboxes).filter(cb => cb.checked).map(cb => labels[cb.id] || cb.id);
            alert('Subscriptions saved: ' + (selected.length ? selected.join(', ') : 'None selected'));
        });
    }

    loadTrending();
});
