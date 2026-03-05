//////////////////////////////////////////////////////////////
// FRIENDS.JS
//////////////////////////////////////////////////////////////

document.addEventListener('DOMContentLoaded', async () => {

    const token = localStorage.getItem('jwtToken');

    if (!token) {
        window.location.href = '/';
        return;
    }

    DataModel.setToken(token);

    const logoutButton = document.getElementById('logoutButton');
    const friendSearch = document.getElementById('friendSearch');
    const addFriendBtn = document.getElementById('addFriendBtn');
    const searchResults = document.getElementById('searchResults');
    const friendsList = document.getElementById('friendsList');

    logoutButton.addEventListener('click', () => {
        localStorage.removeItem('jwtToken');
        window.location.href = '/';
    });

    let debounceTimer = null;
    const DEBOUNCE_MS = 400;

    async function loadFriends() {
        const friends = await DataModel.getFriends();
        if (!friendsList) return;
        friendsList.innerHTML = '';
        if (friends.length === 0) {
            friendsList.innerHTML = '<p>No friends added yet.</p>';
            return;
        }
        friends.forEach(email => {
            const div = document.createElement('div');
            div.classList.add('friend-item');
            div.textContent = email;
            friendsList.appendChild(div);
        });
    }

    async function runSearch() {
        const query = friendSearch?.value?.trim() || '';
        if (!searchResults) return;
        searchResults.innerHTML = '';
        if (query.length < 1) return;
        const users = await DataModel.searchUsers(query);
        const friends = await DataModel.getFriends();
        const alreadyFriends = new Set(friends);
        const filtered = users.filter(u => !alreadyFriends.has(u));
        if (filtered.length === 0) {
            searchResults.innerHTML = '<p class="empty-message">No users found.</p>';
            return;
        }
        filtered.forEach(email => {
            const div = document.createElement('div');
            div.classList.add('search-result-item');
            div.innerHTML = `<span>${email}</span> <button class="add-friend-btn" data-email="${email}">Add</button>`;
            searchResults.appendChild(div);
        });
        searchResults.querySelectorAll('.add-friend-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const result = await DataModel.addFriend(btn.dataset.email);
                if (result.ok) {
                    loadFriends();
                    runSearch();
                } else {
                    alert(result.data?.message || 'Failed to add friend.');
                }
            });
        });
    }

    friendSearch.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(runSearch, DEBOUNCE_MS);
    });
    friendSearch.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') runSearch();
    });

    addFriendBtn.addEventListener('click', () => runSearch());

    loadFriends();
});
