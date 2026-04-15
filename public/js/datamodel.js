////////////////////////////////////////////////////////////////
//DATAMODEL.JS
//THIS IS YOUR "MODEL", IT INTERACTS WITH THE ROUTES ON YOUR
//SERVER TO FETCH AND SEND DATA.  IT DOES NOT INTERACT WITH
//THE VIEW (dashboard.html) OR THE CONTROLLER (dashboard.js)
//DIRECTLY.  IT IS A "MIDDLEMAN" BETWEEN THE SERVER AND THE
//CONTROLLER.  ALL IT DOES IS MANAGE DATA.
////////////////////////////////////////////////////////////////

const DataModel = (function () {
    //WE CAN STORE DATA HERE SO THAT WE DON'T HAVE TO FETCH IT
    //EVERY TIME WE NEED IT.  THIS IS CALLED "CACHING".
    //WE CAN ALSO STORE THINGS HERE TO MANAGE STATE, LIKE
    //WHEN THE USER SELECTS SOMETHING IN THE VIEW AND WE
    //NEED TO KEEP TRACK OF IT SO WE CAN USE THAT INFOMRATION
    //LATER.  RIGHT NOW, WE'RE JUST STORING THE JWT TOKEN
    //AND THE LIST OF USERS.
    let token = null;  // Holds the JWT token
    let users = [];    // Holds the list of user emails

    //WE CAN CREATE FUNCTIONS HERE TO FETCH DATA FROM THE SERVER
    //AND RETURN IT TO THE CONTROLLER.  THE CONTROLLER CAN THEN
    //USE THAT DATA TO UPDATE THE VIEW.  THE CONTROLLER CAN ALSO
    //SEND DATA TO THE SERVER TO BE STORED IN THE DATABASE BY
    //CALLING FUNCTIONS THAT WE DEFINE HERE.

    // Helper: always send Bearer token because authenticateToken() expects "Bearer <token>"
    function authHeaders() {
        return {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        };
    }

    return {
        //utility function to store the token so that we
        //can use it later to make authenticated requests
        setToken: function (newToken) {
            token = newToken; // store RAW token, NOT "Bearer ..."
        },

        //function to fetch the list of users from the server
        getUsers: async function () {
            // Check if the token is set
            if (!token) {
                console.error("Token is not set.");
                return [];
            }

            try {
                // this is our call to the /api/users route on the server
                const response = await fetch('/api/users', {
                    method: 'GET',
                    headers: authHeaders(),
                });

                if (!response.ok) {
                    console.error("Error fetching users:", await response.json());
                    return [];
                }

                const data = await response.json();
                //store the emails in the users variable so we can
                //use them again later without having to fetch them
                users = data.emails;
                //return the emails to the controller
                //so that it can update the view
                return users;
            } catch (error) {
                console.error("Error in API call:", error);
                return [];
            }
        },

        getWatchHistory: async function () {
            if (!token) return [];
            try {
                const response = await fetch('/api/dashboard/watch-history', {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                });
                if (!response.ok) {
                    // Helpful debug
                    // console.error("getWatchHistory failed:", response.status, await response.text());
                    return [];
                }
                const data = await response.json();
                return data.watchHistory || [];
            } catch (error) {
                console.error("Error fetching watch history:", error);
                return [];
            }
        },

        getRatings: async function () {
            if (!token) return [];
            try {
                const response = await fetch('/api/dashboard/ratings', {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                });
                if (!response.ok) {
                    // console.error("getRatings failed:", response.status, await response.text());
                    return [];
                }
                const data = await response.json();
                return data.ratings || [];
            } catch (error) {
                console.error("Error fetching ratings:", error);
                return [];
            }
        },

        getRatingSummary: async function (title, type) {
            const ls =
                typeof localStorage !== 'undefined' ? localStorage.getItem('jwtToken') : null;
            const authToken = ls || token;
            if (!authToken) return null;
            const t = (title || '').trim();
            if (!t) return null;
            const contentType = type === 'show' ? 'show' : 'movie';
            try {
                const q = new URLSearchParams({ title: t, type: contentType });
                const response = await fetch(`/api/dashboard/ratings/summary?${q}`, {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
                });
                if (!response.ok) return null;
                const data = await response.json();
                if (!data || typeof data.friends !== 'object') {
                    return null;
                }
                return data;
            } catch (error) {
                console.error('Error fetching rating summary:', error);
                return null;
            }
        },

        getLists: async function () {
            if (!token) return [];
            try {
                const response = await fetch('/api/dashboard/lists', {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                });
                if (!response.ok) {
                    // console.error("getLists failed:", response.status, await response.text());
                    return [];
                }
                const data = await response.json();
                return data.lists || [];
            } catch (error) {
                console.error("Error fetching lists:", error);
                return [];
            }
        },

        addRating: async function (title, type, rating, review) {
            if (!token) return { ok: false };
            try {
                const response = await fetch('/api/dashboard/ratings', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title, type: type || 'movie', rating, review }),
                });
                return { ok: response.ok, data: await response.json() };
            } catch (error) {
                console.error("Error adding rating:", error);
                return { ok: false };
            }
        },

        updateRating: async function (title, type, rating, review) {
            if (!token) return { ok: false };
            try {
                const response = await fetch('/api/dashboard/ratings', {
                    method: 'PUT',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title, type: type || 'movie', rating, review }),
                });
                return { ok: response.ok, data: await response.json() };
            } catch (error) {
                console.error("Error updating rating:", error);
                return { ok: false };
            }
        },

        addWatchHistory: async function (title, type) {
            if (!token) return { ok: false };
            try {
                const response = await fetch('/api/dashboard/watch-history', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title, type: type || 'movie' }),
                });
                return { ok: response.ok, data: await response.json() };
            } catch (error) {
                console.error("Error adding watch history:", error);
                return { ok: false };
            }
        },
        deleteWatchHistory: async function (title, type) {
    if (!token) return { ok: false };

    try {
        const response = await fetch('/api/dashboard/watch-history', {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ title, type: type || 'movie' })
        });

        return { ok: response.ok, data: await response.json() };

    } catch (error) {
        console.error("Error deleting watch history:", error);
        return { ok: false };
    }
},

deleteRating: async function (title, type) {
    if (!token) return { ok: false };

    try {
        const response = await fetch('/api/dashboard/ratings', {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ title, type: type || 'movie' })
        });

        return { ok: response.ok, data: await response.json() };

    } catch (error) {
        console.error("Error deleting rating:", error);
        return { ok: false };
    }
},

deleteStatus: async function (title, type) {
    if (!token) return { ok: false };

    try {
        const response = await fetch('/api/dashboard/status', {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ title, type: type || 'movie' })
        });

        return { ok: response.ok, data: await response.json() };

    } catch (error) {
        console.error("Error deleting status:", error);
        return { ok: false };
    }
},

        createList: async function (name) {
            if (!token) return { ok: false };
            try {
                const response = await fetch('/api/dashboard/lists', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name }),
                });
                return { ok: response.ok, data: await response.json() };
            } catch (error) {
                console.error("Error creating list:", error);
                return { ok: false };
            }
        },

        getSuggestions: async function (type, refresh) {
            if (!token) return null;
            try {
                const params = new URLSearchParams();
                if (type && type !== 'both') params.set('type', type);
                if (refresh) params.set('refresh', '1');
                const qs = params.toString();
                const url = qs ? `/api/suggestions?${qs}` : '/api/suggestions';
                const response = await fetch(url, {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                });
                if (!response.ok) return null;
                return await response.json();
            } catch (error) {
                console.error("Error fetching suggestions:", error);
                return null;
            }
        },

        /**
         * @param {{ type?: 'all'|'movie'|'show', requireSubscriptionMatch?: boolean, genreIds?: number[], providerIds?: string[] }} [opts]
         */
        getRandomWatchlistPick: async function (opts) {
            if (!token) return null;
            const o = opts || {};
            const type = o.type ? String(o.type).toLowerCase() : 'all';
            const requireSubscriptionMatch = Boolean(o.requireSubscriptionMatch);
            const genreIds = Array.isArray(o.genreIds) ? o.genreIds.filter((n) => Number.isFinite(Number(n)) && Number(n) > 0).map((n) => parseInt(String(n), 10)) : [];
            const providerIds = Array.isArray(o.providerIds) ? o.providerIds.map((s) => String(s).trim()).filter(Boolean) : [];
            try {
                const response = await fetch('/api/suggestions/random-watchlist', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: type === 'movie' || type === 'show' ? type : 'all',
                        requireSubscriptionMatch,
                        genreIds,
                        providerIds,
                    }),
                });
                if (response.status === 400) {
                    let err = {};
                    try {
                        err = await response.json();
                    } catch (_) {}
                    return { pick: null, message: err.message || 'Invalid filters.', _clientError: true };
                }
                if (!response.ok) return null;
                return await response.json();
            } catch (error) {
                console.error('Error fetching random watchlist pick:', error);
                return null;
            }
        },

        getTmdbGenres: async function (mediaType) {
            if (!token) return [];
            const t = mediaType === 'show' || mediaType === 'tv' ? 'tv' : 'movie';
            try {
                const response = await fetch(`/api/tmdb/genres?type=${encodeURIComponent(t)}`, {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                });
                if (!response.ok) return [];
                const data = await response.json();
                return data.genres || [];
            } catch (e) {
                console.error('getTmdbGenres:', e);
                return [];
            }
        },

        addToList: async function (listId, title) {
            if (!token) return { ok: false };
            try {
                const response = await fetch(`/api/dashboard/lists/${listId}/items`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title }),
                });
                return { ok: response.ok, data: await response.json() };
            } catch (error) {
                console.error("Error adding to list:", error);
                return { ok: false };
            }
        },

        removeFromList: async function (listId, title) {
            if (!token) return { ok: false };
            try {
                const response = await fetch(`/api/dashboard/lists/${listId}/items`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title }),
                });
                return { ok: response.ok, data: await response.json() };
            } catch (error) {
                console.error("Error removing from list:", error);
                return { ok: false };
            }
        },

        deleteList: async function (listId) {
            if (!token) return { ok: false };
            try {
                const response = await fetch(`/api/dashboard/lists/${encodeURIComponent(listId)}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` },
                });
                let data = {};
                try {
                    data = await response.json();
                } catch (_) {}
                return { ok: response.ok, data };
            } catch (error) {
                console.error('Error deleting list:', error);
                return { ok: false };
            }
        },

getStatuses: async function () {
    if (!token) return [];
    try {
        const response = await fetch('/api/dashboard/status', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        });

                if (!response.ok) {
                    // console.error("getStatuses failed:", response.status, await response.text());
                    return [];
                }

                const data = await response.json();
                return data.statuses || [];
            } catch (error) {
                console.error("Error fetching statuses:", error);
                return [];
            }
        },

setStatus: async function (title, type, status) {
    if (!token) return { ok: false };
    try {
        const response = await fetch('/api/dashboard/status', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, type, status }),
        });
        let data = {};
        try {
            const text = await response.text();
            if (text) data = JSON.parse(text);
        } catch (_) {}
        return { ok: response.ok, data };
    } catch (error) {
        console.error("Error setting status:", error);
        return { ok: false };
    }
},
        //ADD MORE FUNCTIONS HERE TO FETCH DATA FROM THE SERVER
        //AND SEND DATA TO THE SERVER AS NEEDED
getPostersForItems: async function (items) {
    if (!token || !items || items.length === 0) return {};
    const posters = {};
    await Promise.all(items.map(async ({ title, type }) => {
        try {
            const tmdbType = type === 'show' ? 'tv' : 'movie';
            const res = await fetch(`/api/tmdb/search?q=${encodeURIComponent(title)}&type=${tmdbType}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            const match = (data.results || []).find(r => {
                const t = type === 'show' ? r.name : r.title;
                return t?.toLowerCase() === title.toLowerCase();
            });
            if (match?.poster_path) {
                posters[`${title}|${type || 'movie'}`] = match.poster_path;
            }
        } catch (err) {
            console.error(`Poster fetch failed for ${title}:`, err);
        }
    }));
    return posters;
},

        getSubscriptions: async function () {
            if (!token) return [];
            try {
                const response = await fetch('/api/subscriptions', {
                    method: 'GET',
                    headers: authHeaders(),
                });

                if (!response.ok) return [];

                const data = await response.json();

                return data;
            } catch (error) {
                console.error("Error fetching subscriptions:", error);
                return [];
            }
        },

        saveSubscriptions: async function (subscriptions) {
    if (!token) return { ok: false };
    try {
        const response = await fetch('/api/subscriptions', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ providers: subscriptions }),
        });

        return { ok: response.ok, data: await response.json() };
    } catch (error) {
        console.error("Error saving subscriptions:", error);
        return { ok: false };
    }
},

getFriends: async function () {
    const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('jwtToken') : null;
    const authToken = ls || token;
    if (!authToken) return [];
    try {
        const res = await fetch('/api/friends', {
            headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        });
        if (!res.ok) return [];
        const data = await res.json();
        return data.friends || [];
    } catch (e) {
        return [];
    }
},

sendRecommendation: async function (receiverEmail, title, type, note) {
    if (!token) return { ok: false };
    try {
        const res = await fetch('/api/recommendations', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ receiverEmail, title, type, note }),
        });
        return { ok: res.ok, data: await res.json() };
    } catch (e) {
        return { ok: false };
    }
},

getRecommendationsInbox: async function () {
    if (!token) return [];
    try {
        const res = await fetch('/api/recommendations/inbox', {
            headers: authHeaders(),
        });
        if (!res.ok) return [];
        const data = await res.json();
        return data.recommendations || [];
    } catch (e) {
        return [];
    }
},

getRecommendationsCount: async function () {
    const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('jwtToken') : null;
    const authToken = ls || token;
    if (!authToken) return 0;
    try {
        const res = await fetch('/api/recommendations/inbox/count', {
            headers: { 'Authorization': `Bearer ${authToken}` },
        });
        if (!res.ok) return 0;
        const data = await res.json();
        return data.count || 0;
    } catch (e) {
        return 0;
    }
},

deleteRecommendation: async function (id) {
    if (!token) return { ok: false };
    try {
        const res = await fetch(`/api/recommendations/${id}`, {
            method: 'DELETE',
            headers: authHeaders(),
        });
        return { ok: res.ok };
    } catch (e) {
        return { ok: false };
    }
},

markRecommendationRead: async function (id) {
    if (!token) return { ok: false };
    try {
        const res = await fetch(`/api/recommendations/${id}/read`, {
            method: 'PUT',
            headers: authHeaders(),
        });
        return { ok: res.ok };
    } catch (e) {
        return { ok: false };
    }
},

getSharedLists: async function () {
    if (!token) return [];
    try {
        const res = await fetch('/api/dashboard/shared-lists', {
            headers: authHeaders(),
        });
        if (!res.ok) return [];
        const data = await res.json();
        return data.lists || [];
    } catch (e) {
        return [];
    }
},

inviteCollaborator: async function (listId, collaboratorEmail) {
    if (!token) return { ok: false };
    try {
        const res = await fetch(`/api/dashboard/lists/${listId}/collaborators`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ collaboratorEmail }),
        });
        return { ok: res.ok, data: await res.json() };
    } catch (e) {
        return { ok: false };
    }
},

leaveSharedList: async function (listId) {
    if (!token) return { ok: false };
    try {
        const res = await fetch(`/api/dashboard/lists/${listId}/leave`, {
            method: 'DELETE',
            headers: authHeaders(),
        });
        return { ok: res.ok, data: await res.json().catch(() => ({})) };
    } catch (e) {
        return { ok: false };
    }
},

removeCollaborator: async function (listId, email) {
    if (!token) return { ok: false };
    try {
        const res = await fetch(`/api/dashboard/lists/${listId}/collaborators/${encodeURIComponent(email)}`, {
            method: 'DELETE',
            headers: authHeaders(),
        });
        return { ok: res.ok };
    } catch (e) {
        return { ok: false };
    }
},

getNotifications: async function () {
    if (!token) return [];
    try {
        const response = await fetch('/api/notifications', {
            method: 'GET',
            headers: authHeaders(),
        });

        if (!response.ok) return [];

        const data = await response.json();
        return data.notifications || [];
    } catch (error) {
        console.error("Error fetching notifications:", error);
        return [];
    }
},

getUnreadNotificationCount: async function () {
    if (!token) return { count: 0 };
    try {
        const response = await fetch('/api/notifications/unread-count', {
            method: 'GET',
            headers: authHeaders(),
        });

        if (!response.ok) return { count: 0 };

        const data = await response.json();
        return { count: data.count || 0 };
    } catch (error) {
        console.error("Error fetching unread notification count:", error);
        return { count: 0 };
    }
},

markNotificationRead: async function (id) {
    if (!token) return { ok: false };
    try {
        const response = await fetch(`/api/notifications/${id}/read`, {
            method: 'PUT',
            headers: authHeaders(),
        });

        let data = {};
        try {
            data = await response.json();
        } catch (_) {}

        return { ok: response.ok, data };
    } catch (error) {
        console.error("Error marking notification as read:", error);
        return { ok: false };
    }
},

markAllNotificationsRead: async function () {
    if (!token) return { ok: false };
    try {
        const response = await fetch('/api/notifications/read-all', {
            method: 'PUT',
            headers: authHeaders(),
        });

        let data = {};
        try {
            data = await response.json();
        } catch (_) {}

        return { ok: response.ok, data };
    } catch (error) {
        console.error("Error marking all notifications as read:", error);
        return { ok: false };
    }
},

saveSuggestionAction: async function (title, type, status) {
    if (!token) return { ok: false };

    try {
        const response = await fetch('/api/suggestions/action', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({
                title: String(title).trim(),
                type: type === 'show' ? 'show' : 'movie',
                status
            }),
        });

        const data = await response.json();
        return { ok: response.ok, data };
    } catch (error) {
        console.error('Error saving suggestion action:', error);
        return { ok: false };
    }
},

getSuggestionActionStatus: async function (title, type) {
    if (!token) return null;

    const cleanTitle = String(title || '').trim();
    const cleanType = type === 'show' ? 'show' : 'movie';

    if (!cleanTitle) return null;

    try {
        const params = new URLSearchParams({
            title: cleanTitle,
            type: cleanType
        });

        const response = await fetch(`/api/suggestions/action-status?${params.toString()}`, {
            method: 'GET',
            headers: authHeaders(),
        });

        if (!response.ok) return null;

        return await response.json();
    } catch (error) {
        console.error('Error fetching suggestion action status:', error);
        return null;
    }
},

removeSuggestionAction: async function (title, type) {
    if (!token) return { ok: false };

    const cleanTitle = String(title || '').trim();
    const cleanType = type === 'show' ? 'show' : 'movie';

    if (!cleanTitle) {
        return { ok: false, data: { message: 'Title is required.' } };
    }

    try {
        const response = await fetch('/api/suggestions/action', {
            method: 'DELETE',
            headers: authHeaders(),
            body: JSON.stringify({
                title: cleanTitle,
                type: cleanType
            }),
        });

        let data = {};
        try {
            data = await response.json();
        } catch (_) {}

        return { ok: response.ok, data };
    } catch (error) {
        console.error('Error removing suggestion action:', error);
        return { ok: false };
    }
},

   };
})();