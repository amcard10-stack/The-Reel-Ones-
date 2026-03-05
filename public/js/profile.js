document.addEventListener("DOMContentLoaded", async () => {

    const token = localStorage.getItem("jwtToken");

    if (!token) {
        window.location.href = "/";
        return;
    }

    DataModel.setToken(token);

    /* Load profile data */
    try {
        const response = await fetch("/api/profile", {
            method: "GET",
            headers: { "Authorization": `Bearer ${token}` }
        });
        if (response.ok) {
            const data = await response.json();
            document.getElementById("firstNameInput").value = data.firstName || "";
            document.getElementById("lastNameInput").value = data.lastName || "";
            document.getElementById("emailInput").value = data.email || "";
        }
    } catch (err) {
        console.error("Error loading profile:", err);
    }

    /* Logout */
    document.getElementById("logoutButton").addEventListener("click", () => {
        localStorage.removeItem("jwtToken");
        window.location.href = "/";
    });

    /* Toggle Password Section */
    const changePasswordBtn = document.getElementById("changePasswordBtn");
    const passwordSection = document.getElementById("passwordSection");

    changePasswordBtn.addEventListener("click", () => {
        passwordSection.classList.toggle("hidden");
    });

    /* Profile Picture Preview */
    const profilePicInput = document.getElementById("profilePicInput");
    const profilePic = document.getElementById("profilePic");
    const placeholder = document.querySelector(".profile-placeholder"); // may be null

    profilePicInput.addEventListener("change", function () {
        const file = this.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (e) {
                profilePic.src = e.target.result;
                if (placeholder) placeholder.style.display = "none";
            };
            reader.readAsDataURL(file);
        }
    });

    /* Save Changes */
    document.getElementById("saveChangesBtn").addEventListener("click", async () => {

        const firstName = document.getElementById("firstNameInput").value;
        const lastName = document.getElementById("lastNameInput").value;
        const email = document.getElementById("emailInput").value;
        const newPassword = document.getElementById("newPasswordInput").value;
        const confirmPassword = document.getElementById("confirmPasswordInput").value;

        if (newPassword && newPassword !== confirmPassword) {
            alert("Passwords do not match.");
            return;
        }

        try {
            const response = await fetch("/api/profile", {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    firstName,
                    lastName,
                    email,
                    newPassword
                })
            });

            if (response.ok) {
                alert("Profile updated successfully!");
            } else {
                alert("Error updating profile.");
            }
        } catch (error) {
            console.error(error);
            alert("Something went wrong.");
        }

    });

});