////////////////////////////////////////////////////////////////
//DASHBOARD.JS
//THIS IS YOUR "CONTROLLER", IT ACTS AS THE MIDDLEMAN
// BETWEEN THE MODEL (datamodel.js) AND THE VIEW (dashboard.html)
////////////////////////////////////////////////////////////////


//ADD ALL EVENT LISTENERS INSIDE DOMCONTENTLOADED
//AT THE BOTTOM OF DOMCONTENTLOADED, ADD ANY CODE THAT NEEDS TO RUN IMMEDIATELY
document.addEventListener('DOMContentLoaded', () => {
    
    //////////////////////////////////////////
    //ELEMENTS TO ATTACH EVENT LISTENERS
    //////////////////////////////////////////
    const logoutButton = document.getElementById('logoutButton');
    const refreshButton = document.getElementById('refreshButton');
    const watchHistorySearch = document.getElementById('watchHistorySearch');
    const listsSearch = document.getElementById('listsSearch');
    const addWatchHistoryBtn = document.getElementById('addWatchHistoryBtn');
    const createListBtn = document.getElementById('createListBtn');
    const addToListBtn = document.getElementById('addToListBtn');
    //////////////////////////////////////////
    //END ELEMENTS TO ATTACH EVENT LISTENERS
    //////////////////////////////////////////


    //////////////////////////////////////////
    //EVENT LISTENERS
    //////////////////////////////////////////
    // Log out and redirect to login
    logoutButton.addEventListener('click', () => {
        localStorage.removeItem('jwtToken');
        window.location.href = '/';
    });

    // Refresh dashboard when the button is clicked
    refreshButton.addEventListener('click', async () => {
        renderDashboard();
    });

    if (watchHistorySearch) {
        watchHistorySearch.addEventListener('input', () => filterBySearch());
        watchHistorySearch.addEventListener('keypress', (e) => { if (e.key === 'Enter') filterBySearch(); });
    }
    if (listsSearch) {
        listsSearch.addEventListener('input', () => filterBySearch());
        listsSearch.addEventListener('keypress', (e) => { if (e.key === 'Enter') filterBySearch(); });
    }

    addWatchHistoryBtn.addEventListener('click', async () => {
        const title = document.getElementById('watchHistoryTitle').value.trim();
        const type = document.getElementById('watchHistoryType').value;
        if (!title) return;
        const result = await DataModel.addWatchHistory(title, type);
        if (result.ok) {
            document.getElementById('watchHistoryTitle').value = '';
            filterBySearch();
        }
    });

    createListBtn.addEventListener('click', async () => {
        const name = document.getElementById('newListName').value.trim();
        if (!name) return;
        const result = await DataModel.createList(name);
        if (result.ok) {
            document.getElementById('newListName').value = '';
            filterBySearch();
        }
    });

    addToListBtn.addEventListener('click', async () => {
        const listId = document.getElementById('listSelect').value;
        const title = document.getElementById('listItemTitle').value.trim();
        if (!listId || !title) return;
        const result = await DataModel.addToList(listId, title);
        if (result.ok) {
            document.getElementById('listItemTitle').value = '';
            filterBySearch();
        }
    });
    //////////////////////////////////////////
    //END EVENT LISTENERS
    //////////////////////////////////////////


    //////////////////////////////////////////////////////
    //CODE THAT NEEDS TO RUN IMMEDIATELY AFTER PAGE LOADS
    //////////////////////////////////////////////////////
    // Initial check for the token
    const token = localStorage.getItem('jwtToken');
    if (!token) {
        window.location.href = '/';
    } else {
        DataModel.setToken(token);
        renderDashboard();
    }
    //////////////////////////////////////////
    //END CODE THAT NEEDS TO RUN IMMEDIATELY AFTER PAGE LOADS
    //////////////////////////////////////////
});
//END OF DOMCONTENTLOADED


//////////////////////////////////////////
//FUNCTIONS TO MANIPULATE THE DOM
//////////////////////////////////////////
let cachedWatchHistory = [];
let cachedLists = [];

async function renderDashboard() {
    cachedWatchHistory = await DataModel.getWatchHistory();
    cachedLists = await DataModel.getLists();
    filterBySearch();
}

function filterBySearch() {
    const watchHistoryTerm = document.getElementById('watchHistorySearch')?.value?.trim().toLowerCase() || '';
    const listsTerm = document.getElementById('listsSearch')?.value?.trim().toLowerCase() || '';
    renderWatchHistory(watchHistoryTerm);
    renderLists(listsTerm);
}

function renderWatchHistory(searchTerm) {
    const el = document.getElementById('watchHistory');
    let items = cachedWatchHistory;
    if (searchTerm) {
        items = items.filter(item => item.title.toLowerCase().includes(searchTerm));
    }
    el.innerHTML = '';
    if (items.length === 0) {
        el.innerHTML = '<p class="empty-message">' + (searchTerm ? 'No matching items in watch history.' : 'No watch history yet.') + '</p>';
        return;
    }
    items.forEach(item => {
        const div = document.createElement('div');
        div.classList.add('dashboard-item');
        const date = new Date(item.watched_at).toLocaleDateString();
        div.innerHTML = `<strong>${item.title}</strong> <span class="meta">(${item.type}) · ${date}</span>`;
        el.appendChild(div);
    });
}

function renderLists(searchTerm) {
    const el = document.getElementById('listsContainer');
    const listSelect = document.getElementById('listSelect');
    const addToListForm = document.getElementById('addToListForm');
    const lists = cachedLists;
    el.innerHTML = '';
    if (lists.length === 0) {
        el.innerHTML = '<p class="empty-message">No lists yet.</p>';
        addToListForm.style.display = 'none';
        return;
    }
    addToListForm.style.display = 'flex';
    listSelect.innerHTML = '<option value="">Select a list</option>';
    lists.forEach(list => {
        listSelect.innerHTML += `<option value="${list.id}">${list.name}</option>`;
        const listDiv = document.createElement('div');
        listDiv.classList.add('list-card');
        let items = list.items || [];
        if (searchTerm) {
            items = items.filter(i => i.title.toLowerCase().includes(searchTerm));
        }
        let itemsHtml = '';
        if (items.length > 0) {
            itemsHtml = items.map(i => `<div class="list-item">${i.title}</div>`).join('');
        } else {
            itemsHtml = '<p class="empty-message">' + (searchTerm ? 'No matching items.' : 'Empty list') + '</p>';
        }
        listDiv.innerHTML = `<h3 class="list-name">${list.name}</h3><div class="list-items">${itemsHtml}</div>`;
        el.appendChild(listDiv);
    });
}
//////////////////////////////////////////
//END FUNCTIONS TO MANIPULATE THE DOM
//////////////////////////////////////////