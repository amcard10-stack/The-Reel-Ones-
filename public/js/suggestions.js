//////////////////////////////////////////////////////////////
// SUGGESTIONS.JS
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

    logoutButton.addEventListener('click', () => {
        localStorage.removeItem('jwtToken');
        window.location.href = '/';
    });

    loadSuggestions();
});

async function loadSuggestions() {
    const data = await DataModel.getSuggestions();
    if (!data) {
        document.getElementById('ratingsSummary').textContent = 'Unable to load suggestions.';
        return;
    }

    // Ratings summary
    const summaryEl = document.getElementById('ratingsSummary');
    if (data.ratingsCount > 0) {
        summaryEl.textContent = `You've rated ${data.ratingsCount} title${data.ratingsCount === 1 ? '' : 's'}. More ratings = better recommendations!`;
    } else {
        summaryEl.textContent = 'Rate movies and shows to get personalized recommendations.';
    }

    // To-rate list (from watch history)
    const toRateList = document.getElementById('toRateList');
    if (data.toRate && data.toRate.length > 0) {
        toRateList.innerHTML = data.toRate.map(item => `
            <div class="recommendation-card">
                <h3>${item.title}</h3>
                <p>${item.type === 'show' ? 'TV Show' : 'Movie'}</p>
                <a href="/ratings" class="primary">Rate Now</a>
            </div>
        `).join('');
    } else {
        document.getElementById('toRateSection').style.display = 'none';
    }

    // Recommendations (from other users' high ratings)
    const recList = document.getElementById('recommendationsList');
    if (data.recommendations && data.recommendations.length > 0) {
        recList.innerHTML = data.recommendations.map(item => `
            <div class="recommendation-card">
                <h3>${item.title}</h3>
                <p>${item.type === 'show' ? 'TV Show' : 'Movie'} · Avg ${item.avgRating}★</p>
                <a href="/ratings" class="primary">Rate It</a>
            </div>
        `).join('');
    } else {
        recList.innerHTML = '<p class="empty-message">Rate more titles to see personalized recommendations!</p>';
    }
}