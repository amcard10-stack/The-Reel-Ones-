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

  try {

        const res = await fetch('/api/trending/shows', {
            headers: { Authorization: `Bearer ${token}` }
        });

        const data = await res.json();

        const shows = data.results;

        const row = document.getElementById('showsRow');

        shows.forEach(show => {

            if (!show.poster_path) return;

            const card = document.createElement("div");
            card.className = "media-card";

            card.innerHTML = `
                <img src="https://image.tmdb.org/t/p/w342${show.poster_path}">
                <p>${show.name}</p>
            `;

            row.appendChild(card);

        });

    } catch (error) {
        console.error("Error loading shows:", error);
    }

    const scrollLeft = document.getElementById("scrollLeft");
    const scrollRight = document.getElementById("scrollRight");
    const showRow = document.getElementById("showsRow");

    scrollLeft.addEventListener("click", () => {
        showRow.scrollBy({
            left: -400,
            behavior: "smooth"
        });
    });

    scrollRight.addEventListener("click", () => {
        showRow.scrollBy({
            left: 400,
            behavior: "smooth"
        });
    });

});