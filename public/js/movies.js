document.addEventListener('DOMContentLoaded', async () => {

    const token = localStorage.getItem('jwtToken');

    if (!token) {
        window.location.href = '/';
        return;
    }

    const logoutButton = document.getElementById('logoutButton');
    const row = document.getElementById('moviesRow');
    const searchInput = document.getElementById('movieSearch');
    const searchBtn = document.getElementById('movieSearchBtn');
    const sectionTitle = document.getElementById('moviesSectionTitle');

    if (!row) return;

    logoutButton.addEventListener('click', () => {
        localStorage.removeItem('jwtToken');
        window.location.href = '/';
    });

    searchBtn.addEventListener('click', () => loadMovies());
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') loadMovies();
    });

    const scrollLeft = document.getElementById("scrollLeft");
    const scrollRight = document.getElementById("scrollRight");
    scrollLeft.addEventListener("click", () => row.scrollBy({ left: -400, behavior: "smooth" }));
    scrollRight.addEventListener("click", () => row.scrollBy({ left: 400, behavior: "smooth" }));

    async function loadMovies() {
        const query = searchInput?.value?.trim();
        row.innerHTML = '';

        if (query && query.length >= 2) {
            sectionTitle.textContent = `Results for "${query}"`;
            try {
                const res = await fetch(`/api/tmdb/search?q=${encodeURIComponent(query)}&type=movie`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.message || 'Search failed');
                renderMovies(data.results || []);
            } catch (err) {
                console.error(err);
                row.innerHTML = `<p style="color:#dc3545;padding:20px">${err.message}</p>`;
            }
        } else {
            sectionTitle.textContent = 'Trending';
            try {
                const res = await fetch('/api/trending/movies', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                if (!res.ok) throw new Error('Failed to load');
                renderMovies(data.results || []);
            } catch (err) {
                console.error(err);
                row.innerHTML = `<p style="color:#dc3545;padding:20px">Failed to load movies.</p>`;
            }
        }
    }

    function renderMovies(movies) {
        movies.forEach(movie => {
            if (!movie.poster_path) return;
            const card = document.createElement("div");
            card.className = "media-card";
            card.innerHTML = `
                <img src="https://image.tmdb.org/t/p/w342${movie.poster_path}" alt="${movie.title || ''}">
                <p>${movie.title || 'Untitled'}</p>
            `;
            row.appendChild(card);
        });
    }

    loadMovies();
});

  