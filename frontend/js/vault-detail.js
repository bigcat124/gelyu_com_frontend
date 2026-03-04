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

        if (data.description) {
            var desc = document.createElement("p");
            desc.textContent = data.description;
            grantedEl.appendChild(desc);
        }

        var badge = document.createElement("span");
        badge.className = "access-badge access-badge-" + data.access_level;
        badge.textContent = data.access_level + " access";
        grantedEl.appendChild(badge);

        var backLink = document.createElement("a");
        backLink.href = "/vault.html";
        backLink.textContent = "Back to Vault";
        backLink.className = "cta-button";
        backLink.style.marginTop = "20px";
        backLink.style.display = "inline-block";
        grantedEl.appendChild(backLink);

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
