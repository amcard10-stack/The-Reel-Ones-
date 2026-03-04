document.addEventListener('DOMContentLoaded', async () => {

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

      const row = document.getElementById('moviesRow');

    if (!row) {
        console.error("moviesRow container not found");
        return;
    }

    try {

        const res = await fetch('/api/trending/movies', {
            headers: { Authorization: token }
        });

        if (!res.ok) {
            throw new Error("Failed to fetch movies");
        }

        const data = await res.json();

        const movies = data.results || [];

        movies.forEach(movie => {

            if (!movie.poster_path) return;

            const card = document.createElement("div");
            card.className = "media-card";

            card.innerHTML = `
                <img src="https://image.tmdb.org/t/p/w342${movie.poster_path}">
                <p>${movie.title}</p>
            `;

            row.appendChild(card);

        });

    } catch (error) {
        console.error("Error loading movies:", error);
    }

    const scrollLeft = document.getElementById("scrollLeft");
    const scrollRight = document.getElementById("scrollRight");

    scrollLeft.addEventListener("click", () => {
        row.scrollBy({
            left: -400,
            behavior: "smooth"
        });
    });

    scrollRight.addEventListener("click", () => {
        row.scrollBy({
            left: 400,
            behavior: "smooth"
        });
    });

});

    //////////////////////////////////////////////////////////////
// SUBSCRIPTIONS.JS  (will become Movies tab)
//////////////////////////////////////////////////////////////
