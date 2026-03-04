document.addEventListener('DOMContentLoaded', async () => {

    const token = localStorage.getItem('jwtToken');

    if (!token) {
        window.location.href = '/';
        return;
    }

    const logoutButton = document.getElementById('logoutButton');
    const row = document.getElementById('showsRow');
    const searchInput = document.getElementById('showSearch');
    const searchBtn = document.getElementById('showSearchBtn');
    const sectionTitle = document.getElementById('showsSectionTitle');

    if (!row) return;

    logoutButton.addEventListener('click', () => {
        localStorage.removeItem('jwtToken');
        window.location.href = '/';
    });

    searchBtn.addEventListener('click', () => loadShows());
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') loadShows();
    });

    const scrollLeft = document.getElementById("scrollLeft");
    const scrollRight = document.getElementById("scrollRight");
    scrollLeft.addEventListener("click", () => row.scrollBy({ left: -400, behavior: "smooth" }));
    scrollRight.addEventListener("click", () => row.scrollBy({ left: 400, behavior: "smooth" }));

    async function loadShows() {
        const query = searchInput?.value?.trim();
        row.innerHTML = '';

        if (query && query.length >= 2) {
            sectionTitle.textContent = `Results for "${query}"`;
            try {
                const res = await fetch(`/api/tmdb/search?q=${encodeURIComponent(query)}&type=tv`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.message || 'Search failed');
                renderShows(data.results || []);
            } catch (err) {
                console.error(err);
                row.innerHTML = `<p style="color:#dc3545;padding:20px">${err.message}</p>`;
            }
        } else {
            sectionTitle.textContent = 'Trending';
            try {
                const res = await fetch('/api/trending/shows', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                if (!res.ok) throw new Error('Failed to load');
                renderShows(data.results || []);
            } catch (err) {
                console.error(err);
                row.innerHTML = `<p style="color:#dc3545;padding:20px">Failed to load shows.</p>`;
            }
        }
    }

    function renderShows(shows) {
        shows.forEach(show => {
            if (!show.poster_path) return;
            const card = document.createElement("div");
            card.className = "media-card";
            card.innerHTML = `
                <img src="https://image.tmdb.org/t/p/w342${show.poster_path}" alt="${show.name || ''}">
                <p>${show.name || 'Untitled'}</p>
            `;
            row.appendChild(card);
        });
    }

    loadShows();
});