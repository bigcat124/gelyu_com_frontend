/**
 * Sub-vault detail page: extract slug from URL, check auth, fetch sub-vault detail.
 * Depends on auth.js and firebase-init.js being loaded first.
 */

function getSlugFromPath() {
    var parts = window.location.pathname.split("/");
    // parts = ["", "vault", "slug"]
    return parts[2] || null;
}

function hideAllVaultStates() {
    document.getElementById("vault-not-signed-in").style.display = "none";
    document.getElementById("vault-loading").style.display = "none";
    document.getElementById("vault-granted").style.display = "none";
    document.getElementById("vault-denied").style.display = "none";
    document.getElementById("vault-not-found").style.display = "none";
}

function showVaultState(stateId) {
    hideAllVaultStates();
    document.getElementById(stateId).style.display = "block";
}

async function loadSubVault() {
    var slug = getSlugFromPath();
    if (!slug) {
        showVaultState("vault-not-found");
        return;
    }

    showVaultState("vault-loading");

    var token = await getIdToken();
    if (!token) {
        showVaultState("vault-not-signed-in");
        return;
    }

    try {
        var response = await fetch(API_BASE + "/api/vault/sub-vaults/" + encodeURIComponent(slug), {
            headers: { "Authorization": "Bearer " + token },
        });

        if (response.status === 401) {
            await signOut();
            showVaultState("vault-not-signed-in");
            return;
        }

        if (response.status === 403) {
            showVaultState("vault-denied");
            return;
        }

        if (response.status === 404) {
            showVaultState("vault-not-found");
            return;
        }

        if (!response.ok) {
            throw new Error("Unexpected status: " + response.status);
        }

        var data = await response.json();

        // Update page title
        document.getElementById("vault-title").textContent = data.name;
        document.title = data.name + " - Vault - Ge Lyu";

        // Populate content
        var grantedEl = document.getElementById("vault-granted");
        grantedEl.textContent = "";

        var content = document.createElement("div");
        content.className = "vault-detail-content";

        if (data.description) {
            var desc = document.createElement("p");
            desc.className = "vault-description";
            desc.textContent = data.description;
            content.appendChild(desc);
        }

        // Placeholder content area
        var contentArea = document.createElement("div");
        contentArea.className = "vault-content-area";
        contentArea.innerHTML =
            '<p class="vault-content-placeholder">Content for this vault will appear here.</p>';
        content.appendChild(contentArea);

        // Admin: show settings link in hero banner
        if (data.is_admin) {
            var heroLink = document.getElementById("hero-settings-link");
            heroLink.href = "/vault/" + slug + "/settings";
            heroLink.style.display = "";
        }

        var backLink = document.createElement("a");
        backLink.href = "/vault.html";
        backLink.textContent = "\u2190 Back to Vault";
        backLink.className = "back-link";
        content.appendChild(backLink);

        grantedEl.appendChild(content);
        showVaultState("vault-granted");

    } catch (error) {
        console.error("Sub-vault load failed");
        showVaultState("vault-denied");
    }
}

// Wire up sign-in button
document.getElementById("vault-sign-in-btn").onclick = signInWithGoogle;

// Listen for auth state changes
auth.onAuthStateChanged(function (user) {
    if (user) {
        loadSubVault();
    } else {
        showVaultState("vault-not-signed-in");
    }
});
