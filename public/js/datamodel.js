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
    return {
        //utility function to store the token so that we
        //can use it later to make authenticated requests
        setToken: function (newToken) {
            token = newToken;
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
                    headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
},
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
                if (!response.ok) return [];
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
                if (!response.ok) return [];
                const data = await response.json();
                return data.ratings || [];
            } catch (error) {
                console.error("Error fetching ratings:", error);
                return [];
            }
        },

        getLists: async function () {
            if (!token) return [];
            try {
                const response = await fetch('/api/dashboard/lists', {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                });
                if (!response.ok) return [];
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

        getSuggestions: async function () {
            if (!token) return null;
            try {
                const response = await fetch('/api/suggestions', {
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
getStatuses: async function () {
    if (!token) return [];
    try {
        const response = await fetch('/api/dashboard/status', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        });

        if (!response.ok) return [];

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

        return { ok: response.ok, data: await response.json() };
    } catch (error) {
        console.error("Error setting status:", error);
        return { ok: false };
    }
},

        getFriends: async function () {
            if (!token) return [];
            try {
                const response = await fetch('/api/friends', {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                });
                if (!response.ok) return [];
                const data = await response.json();
                return data.friends || [];
            } catch (error) {
                console.error("Error fetching friends:", error);
                return [];
            }
        },

        searchUsers: async function (query) {
            if (!token) return [];
            try {
                const q = encodeURIComponent((query || '').trim());
                const response = await fetch(`/api/users?q=${q}`, {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                });
                if (!response.ok) return [];
                const data = await response.json();
                return data.emails || [];
            } catch (error) {
                console.error("Error searching users:", error);
                return [];
            }
        },

        addFriend: async function (friendEmail) {
            if (!token) return { ok: false };
            try {
                const response = await fetch('/api/friends', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ friendEmail }),
                });
                return { ok: response.ok, data: await response.json() };
            } catch (error) {
                console.error("Error adding friend:", error);
                return { ok: false };
            }
        },

        getPostersForItems: async function (items) {
            if (!token || !items || items.length === 0) return {};
            try {
                const response = await fetch('/api/tmdb/posters', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ items }),
                });
                if (!response.ok) return {};
                const data = await response.json();
                return data.posters || {};
            } catch (error) {
                console.error("Error fetching posters:", error);
                return {};
            }
        },
        //ADD MORE FUNCTIONS HERE TO FETCH DATA FROM THE SERVER
        //AND SEND DATA TO THE SERVER AS NEEDED
    };
})();