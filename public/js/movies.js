document.addEventListener('DOMContentLoaded', () => {

    const token = localStorage.getItem('jwtToken');

    if (!token) {
        window.location.href = '/';
        return;
    } else {
        DataModel.setToken(token);
    }

    const logoutButton = document.getElementById('logoutButton');

    logoutButton.addEventListener('click', () => {
        localStorage.removeItem('jwtToken');
        window.location.href = '/';
    });

    //////////////////////////////////////////////////////////////
// SUBSCRIPTIONS.JS  (will become Movies tab)
//////////////////////////////////////////////////////////////

// 🔹 Load movies automatically when page loads
    loadTrending();
});

async function loadTrending() {
    try {
        const res = await fetch('/api/tmdb/trending', {
            headers: {
                authorization: localStorage.getItem('jwtToken')
            }
        });

        const data = await res.json();

        if (!res.ok) {
            console.error("TMDB route error:", data);
            alert(data.message || "Failed to load movies.");
            return;
        }

        renderItems(data.results || []);

    } catch (err) {
        console.error("Fetch error:", err);
        alert("Error loading movies.");
    }
}

function renderItems(items) {
    const container = document.getElementById('results');
    if (!container) return;

    container.innerHTML = '';

    items.forEach(item => {
        const title = item.title || item.name || 'Untitled';
        const posterPath = item.poster_path;

        // Skip items with no poster?
        if (!posterPath) return;

        const posterUrl = `https://image.tmdb.org/t/p/w342${posterPath}`;

        const card = document.createElement('div');
        card.className = 'poster-card';
        card.title = title;

        card.innerHTML = `
            <img src="${posterUrl}" alt="${title}" loading="lazy" />
        `;

        container.appendChild(card);
    });
}

    items.forEach(item => {

        const title = item.title || item.name || 'Untitled';
        const poster = item.poster_path
            ? `https://image.tmdb.org/t/p/w342${item.poster_path}`
            : null;

        const card = document.createElement('div');
        card.className = 'movie-card';

        card.innerHTML = `
            <h3>${title}</h3>
            ${poster ? `<img src="${poster}" alt="${title}" style="max-width:150px;" />` : ''}
        `;

        container.appendChild(card);
    });
