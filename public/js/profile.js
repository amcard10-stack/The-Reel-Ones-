document.addEventListener("DOMContentLoaded", async () => {

    const token = localStorage.getItem("jwtToken");

    if (!token) {
        window.location.href = "/";
        return;
    }

    DataModel.setToken(token);

    /* Get profile elements */
    const profilePicInput = document.getElementById("profilePicInput");
    const profilePic = document.getElementById("profilePic");
    const placeholder = document.querySelector(".profile-placeholder");

    /* =========================
       LOAD PROFILE DATA
    ==========================*/
    try {
        const response = await fetch("/api/profile", {
            method: "GET",
            headers: { "Authorization": `Bearer ${token}` }
        });
        if (response.ok) {
            const data = await response.json();
            document.getElementById("firstNameInput").value = data.firstName || "";
            document.getElementById("lastNameInput").value = data.lastName || "";
            document.getElementById("usernameInput").value = data.username || "";
            document.getElementById("emailInput").value = data.email || "";
            document.getElementById("bioInput").value = data.bio || "";
            if (data.profilePicture) {
                profilePic.src = data.profilePicture;
                if (placeholder) placeholder.style.display = "none";
            }
        }
    } catch (err) {
        console.error("Error loading profile:", err);
    }

    /* =========================
       LOGOUT
    ==========================*/
    document.getElementById("logoutButton").addEventListener("click", () => {
        localStorage.removeItem("jwtToken");
        window.location.href = "/";
    });

    /* =========================
       TOGGLE PASSWORD SECTION
    ==========================*/
    const changePasswordBtn = document.getElementById("changePasswordBtn");
    const passwordSection = document.getElementById("passwordSection");

    changePasswordBtn.addEventListener("click", () => {
        passwordSection.classList.toggle("hidden");
    });

    /* =========================
       PROFILE PICTURE PREVIEW
    ==========================*/
    profilePicInput.addEventListener("change", function () {
        const file = this.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (e) {
                profilePic.src = e.target.result;
                if (placeholder) {
                    placeholder.style.display = "none";
                }
            };
            reader.readAsDataURL(file);
        }
    });

    /* =========================
       SAVE PROFILE CHANGES
    ==========================*/
    document.getElementById("saveChangesBtn").addEventListener("click", async () => {
        const bio = document.getElementById("bioInput").value;
        const firstName = document.getElementById("firstNameInput").value;
        const lastName = document.getElementById("lastNameInput").value;
        const username = document.getElementById("usernameInput").value;
        const newPassword = document.getElementById("newPasswordInput").value;
        const confirmPassword = document.getElementById("confirmPasswordInput").value;

        if (newPassword && newPassword.length < 6) {
            alert("Password must be at least 6 characters long.");
            return;
        }

        if (newPassword && newPassword !== confirmPassword) {
            alert("Passwords do not match.");
            return;
        }
        const formData = new FormData();
        formData.append("bio", bio);
        formData.append("firstName", firstName);
        formData.append("lastName", lastName);
        formData.append("username", username);
        formData.append("newPassword", newPassword);
        const file = document.getElementById("profilePicInput").files[0];

        if (file) {
            formData.append("profilePicture", file);
        }

        try {
            const response = await fetch("/api/profile", {
                method: "PUT",
                headers: {
                    Authorization: `Bearer ${token}`
                },
                body: formData
            });
            const result = await response.json();
            if (response.ok) {
                alert("Profile updated successfully!");
            } else if (response.status === 409) {
                alert("That username is already taken. Please choose a different one.");
            } else {
                alert(result.message || "Error updating profile.");
            }
        } catch (error) {
            console.error(error);
            alert("Something went wrong.");
        }
    });

    /* =========================
   DELETE ACCOUNT
==========================*/
document.getElementById("deleteAccountBtn").addEventListener("click", async () => {
    const confirmed = confirm(
        "Are you sure you want to permanently delete your account?\n\nThis will remove all your data including ratings, watch history, lists, and friends. This action cannot be undone."
    );
    if (!confirmed) return;

    // Second confirmation for safety
    const doubleConfirmed = confirm(
        "Last chance — are you sure? Your account will be gone forever."
    );
    if (!doubleConfirmed) return;

    try {
        const response = await fetch("/api/profile", {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` }
        });

        if (response.ok) {
            localStorage.removeItem("jwtToken");
            alert("Your account has been deleted.");
            window.location.href = "/";
        } else {
            const result = await response.json();
            alert(result.message || "Error deleting account.");
        }
    } catch (error) {
        console.error(error);
        alert("Something went wrong. Please try again.");
    }
});
});