document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('jwtToken');
    if (!token) {
        window.location.href = '/';
        return;
    }
    DataModel.setToken(token);

    const logoutButton = document.getElementById('logoutButton');
    const friendSearch = document.getElementById('friendSearch');
    const searchBtn = document.getElementById('searchBtn');
    const searchResults = document.getElementById('searchResults');
    const friendsList = document.getElementById('friendsList');
    const pendingList = document.getElementById('pendingList');
    const pendingCount = document.getElementById('pendingCount');

    logoutButton?.addEventListener('click', () => {
        localStorage.removeItem('jwtToken');
        window.location.href = '/';
    });

    let currentFriendEmail = null;
    let debounceTimer = null;

    // SEARCH
  
    async function runSearch() {
        const query = friendSearch?.value?.trim() || '';
        searchResults.innerHTML = '';
        if (query.length < 1) return;

        try {
            const res = await fetch(`/api/friends/search?q=${encodeURIComponent(query)}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            const users = data.users || [];

            if (users.length === 0) {
                searchResults.innerHTML = '<p class="empty-message">No users found.</p>';
                return;
            }

            users.forEach(user => {
                const div = document.createElement('div');
                div.classList.add('search-result-item');
                const pic = user.profilePicture
                    ? `<img src="${user.profilePicture}" class="friend-avatar">`
                    : `<div class="friend-avatar-placeholder"></div>`;
                const displayName = user.firstName
                    ? `${user.firstName} ${user.lastName}`
                    : user.email;
                const username = user.username ? `@${user.username}` : '';
                div.innerHTML = `
                    ${pic}
                    <div class="friend-info">
                        <strong>${displayName}</strong>
                        <span class="meta">${username}</span>
                    </div>
                    <button class="add-friend-btn" data-email="${user.email}">Add Friend</button>
                `;
                div.querySelector('.add-friend-btn').addEventListener('click', async () => {
                    const result = await sendFriendRequest(user.email);
                    if (result.ok) {
                        div.querySelector('.add-friend-btn').textContent = 'Requested';
                        div.querySelector('.add-friend-btn').disabled = true;
                    } else {
                        alert(result.message || 'Failed to send request.');
                    }
                });
                searchResults.appendChild(div);
            });
        } catch (err) {
            console.error(err);
            searchResults.innerHTML = '<p class="empty-message">Search failed.</p>';
        }
    }

    friendSearch?.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(runSearch, 400);
    });
    friendSearch?.addEventListener('keypress', (e) => { if (e.key === 'Enter') runSearch(); });
    searchBtn?.addEventListener('click', runSearch);

    // FRIEND REQUESTS
    async function sendFriendRequest(receiverEmail) {
        try {
            const res = await fetch('/api/friends/request', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ receiverEmail })
            });
            const data = await res.json();
            return { ok: res.ok, message: data.message };
        } catch (err) {
            return { ok: false, message: 'Something went wrong.' };
        }
    }

    async function loadPendingRequests() {
        try {
            const res = await fetch('/api/friends/requests', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            const requests = data.requests || [];
            pendingCount.textContent = requests.length > 0 ? requests.length : '';
            pendingList.innerHTML = '';

            if (requests.length === 0) {
                pendingList.innerHTML = '<p class="empty-message">No pending requests.</p>';
                return;
            }

            requests.forEach(req => {
                const div = document.createElement('div');
                div.classList.add('friend-item');
                const pic = req.profilePicture
                    ? `<img src="${req.profilePicture}" class="friend-avatar">`
                    : `<div class="friend-avatar-placeholder"></div>`;
                const displayName = req.firstName ? `${req.firstName} ${req.lastName}` : req.sender_email;
                const username = req.username ? `@${req.username}` : '';
                div.innerHTML = `
                    ${pic}
                    <div class="friend-info">
                        <strong>${displayName}</strong>
                        <span class="meta">${username}</span>
                    </div>
                    <div class="request-actions">
                        <button class="accept-btn" data-id="${req.id}">Accept</button>
                        <button class="decline-btn" data-id="${req.id}">Decline</button>
                    </div>
                `;
                div.querySelector('.accept-btn').addEventListener('click', async () => {
                    await respondToRequest(req.id, 'accepted');
                    loadPendingRequests();
                    loadFriends();
                });
                div.querySelector('.decline-btn').addEventListener('click', async () => {
                    await respondToRequest(req.id, 'declined');
                    loadPendingRequests();
                });
                pendingList.appendChild(div);
            });
        } catch (err) {
            console.error(err);
        }
    }

    async function respondToRequest(id, status) {
        try {
            await fetch(`/api/friends/request/${id}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ status })
            });
        } catch (err) {
            console.error(err);
        }
    }

    // FRIENDS LIST
    async function loadFriends() {
        try {
            const res = await fetch('/api/friends', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            const friends = data.friends || [];
            friendsList.innerHTML = '';

            if (friends.length === 0) {
                friendsList.innerHTML = '<p class="empty-message">No friends yet. Search for users to add.</p>';
                return;
            }

            friends.forEach(friend => {
                const div = document.createElement('div');
                div.classList.add('friend-item');
                const pic = friend.profilePicture
                    ? `<img src="${friend.profilePicture}" class="friend-avatar">`
                    : `<div class="friend-avatar-placeholder"></div>`;
                const displayName = friend.firstName
                    ? `${friend.firstName} ${friend.lastName}`
                    : friend.email;
                const username = friend.username ? `@${friend.username}` : '';
                div.innerHTML = `
                    ${pic}
                    <div class="friend-info">
                        <strong>${displayName}</strong>
                        <span class="meta">${username}</span>
                    </div>
                    <button class="view-friend-btn primary-btn" data-email="${friend.email}">View</button>
                `;
                div.querySelector('.view-friend-btn').addEventListener('click', () => {
                    openFriendPopup(friend);
                });
                friendsList.appendChild(div);
            });
        } catch (err) {
            console.error(err);
        }
    }

    // FRIEND POPUP
    async function openFriendPopup(friend) {
        currentFriendEmail = friend.email;
        const popup = document.getElementById('friendPopup');
        const pic = document.getElementById('friendPopupPic');
        const placeholder = document.getElementById('friendPopupPlaceholder');
        document.getElementById('friendPopupName').textContent =
            friend.firstName ? `${friend.firstName} ${friend.lastName}` : friend.email;
        document.getElementById('friendPopupUsername').textContent =
            friend.username ? `@${friend.username}` : '';
        document.getElementById('friendPopupEmail').textContent = friend.email;

        if (friend.profilePicture) {
            pic.src = friend.profilePicture;
            pic.style.display = 'block';
            placeholder.style.display = 'none';
        } else {
            pic.style.display = 'none';
            placeholder.style.display = 'block';
        }

        switchTab('ratings');
        popup.style.display = 'flex';
        loadFriendRatings(friend.email);
    }

    document.getElementById('friendPopupClose')?.addEventListener('click', () => {
        document.getElementById('friendPopup').style.display = 'none';
    });

    document.getElementById('friendPopup')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('friendPopup')) {
            document.getElementById('friendPopup').style.display = 'none';
        }
    });

    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        switchTab(btn.dataset.tab);
        if (btn.dataset.tab === 'messages' && currentFriendEmail) {
            loadMessages(currentFriendEmail);
        }
        if (btn.dataset.tab === 'watchlists' && currentFriendEmail) {
            loadFriendLists(currentFriendEmail);
        }
    });
    });

    function switchTab(tab) {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
        document.querySelector(`.tab-btn[data-tab="${tab}"]`).classList.add('active');
        document.getElementById(`tab-${tab}`).style.display = 'block';
    }

    // FRIEND RATINGS
    async function loadFriendRatings(email) {
        const list = document.getElementById('friendRatingsList');
        list.innerHTML = '<p class="empty-message">Loading...</p>';
        try {
            const res = await fetch(`/api/friends/${encodeURIComponent(email)}/ratings`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            const ratings = data.ratings || [];
            list.innerHTML = '';
            if (ratings.length === 0) {
                list.innerHTML = '<p class="empty-message">No ratings yet.</p>';
                return;
            }
            ratings.forEach(r => {
                const div = document.createElement('div');
                div.classList.add('friend-rating-item');
                const date = new Date(r.rated_at).toLocaleDateString();
                div.innerHTML = `
                    <div class="rating-details">
                        <strong>${r.title}</strong>
                        <span class="type-badge">${r.type === 'show' ? 'TV Show' : 'Movie'}</span>
                        <span class="rating-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
                        <span class="meta">· ${date}</span>
                        ${r.review ? `<p class="review-text">${r.review}</p>` : ''}
                    </div>
                `;
                list.appendChild(div);
            });
        } catch (err) {
            list.innerHTML = '<p class="empty-message">Failed to load ratings.</p>';
        }
    }

    //friends watchlists
    async function loadFriendLists(email) {
        const container = document.getElementById('friendListsList');
        ontainer.innerHTML = '<p class="empty-message">Loading...</p>';
        try {
            const res = await fetch(`/api/friends/${encodeURIComponent(email)}/lists`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            const lists = data.lists || [];
            container.innerHTML = '';
            if (lists.length === 0) {
                container.innerHTML = '<p class="empty-message">No lists yet.</p>';
                return;
            }
            lists.forEach(list => {
                const div = document.createElement('div');
                div.classList.add('friend-list-card');
                const items = list.items || [];
                const itemsHtml = items.length > 0
                    ? items.map(i => `<span class="list-item-tag">${i.title}</span>`).join('')
                    : '<span class="empty-message" style="font-size:12px;">Empty list</span>';
                div.innerHTML = `
                    <h4 class="friend-list-name">${list.name}</h4>
                    <div class="friend-list-items">${itemsHtml}</div>
                `;
                container.appendChild(div);
            });
        } catch (err) {
            container.innerHTML = '<p class="empty-message">Failed to load lists.</p>';
        }
    }


    // MESSAGES
    async function loadMessages(email) {
        const list = document.getElementById('messagesList');
        list.innerHTML = '<p class="empty-message">Loading...</p>';
        try {
            const res = await fetch(`/api/friends/${encodeURIComponent(email)}/messages`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            const messages = data.messages || [];
            list.innerHTML = '';
            if (messages.length === 0) {
                list.innerHTML = '<p class="empty-message">No messages yet. Say something!</p>';
                return;
            }
            const myEmail = JSON.parse(atob(token.split('.')[1])).email;
            messages.forEach(m => {
                const div = document.createElement('div');
                const isMine = m.sender_email === myEmail;
                div.classList.add('message-bubble', isMine ? 'mine' : 'theirs');
                div.innerHTML = `
                    <p>${m.content}</p>
                    <span class="message-time">${new Date(m.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                `;
                list.appendChild(div);
            });
            list.scrollTop = list.scrollHeight;
        } catch (err) {
            list.innerHTML = '<p class="empty-message">Failed to load messages.</p>';
        }
    }

    document.getElementById('sendMessageBtn')?.addEventListener('click', async () => {
        const input = document.getElementById('messageInput');
        const content = input?.value?.trim();
        if (!content || !currentFriendEmail) return;
        try {
            const res = await fetch('/api/friends/message', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ receiverEmail: currentFriendEmail, content })
            });
            if (res.ok) {
                input.value = '';
                loadMessages(currentFriendEmail);
            }
        } catch (err) {
            console.error(err);
        }
    });

    document.getElementById('messageInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('sendMessageBtn').click();
    });

    loadPendingRequests();
    loadFriends();
});