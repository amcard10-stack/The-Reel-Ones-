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

    logoutButton.addEventListener('click', () => {
        localStorage.removeItem('jwtToken');
        window.location.href = '/';
    });

    submitBtn.addEventListener('click', async () => {
        const title = document.getElementById('ratingTitle').value.trim();
        const rating = document.getElementById('ratingSelect').value;
        const review = document.getElementById('ratingReview').value.trim();
        const messageEl = document.getElementById('ratingMessage');

        if (!title || !rating) {
            messageEl.textContent = 'Please enter a title and select a rating.';
            messageEl.style.color = '#dc3545';
            return;
        }

        const result = await DataModel.addRating(title, parseInt(rating, 10), review || null);
        if (result.ok) {
            messageEl.textContent = 'Rating added!';
            messageEl.style.color = '#28a745';
            document.getElementById('ratingTitle').value = '';
            document.getElementById('ratingSelect').value = '';
            document.getElementById('ratingReview').value = '';
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
        ratings.forEach(item => {
            const div = document.createElement('div');
            div.classList.add('rating-item');
            const date = new Date(item.rated_at).toLocaleDateString();
            div.innerHTML = `<strong>${item.title}</strong> ${'★'.repeat(item.rating)}${'☆'.repeat(5 - item.rating)} · ${date}`;
            if (item.review) div.innerHTML += `<p>${item.review}</p>`;
            ratingList.appendChild(div);
        });
    }

    renderRatings();
});