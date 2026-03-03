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
            messageEl.textContent = 'Rating added! Your recommendations will improve.';
            messageEl.style.color = '#28a745';
            document.getElementById('ratingTitle').value = '';
            document.getElementById('ratingReview').value = '';
            selectedRating = 0;
            starRating.querySelectorAll('.star').forEach(s => s.classList.remove('selected'));
            scaleLabel.textContent = 'Select a rating';
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
            const typeLabel = item.type === 'show' ? 'TV Show' : 'Movie';
            div.innerHTML = `<strong>${item.title}</strong> <span class="type-badge">${typeLabel}</span> ${'★'.repeat(item.rating)}${'☆'.repeat(5 - item.rating)} · ${date}`;
            if (item.review) div.innerHTML += `<p class="review-text">${item.review}</p>`;
            ratingList.appendChild(div);
        });
    }

    renderRatings();
});