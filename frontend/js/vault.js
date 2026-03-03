/**
 * Vault page logic: check auth state, call backend, show appropriate UI.
 * Depends on auth.js being loaded first.
 */

function hideAllVaultStates() {
    document.getElementById("vault-not-signed-in").style.display = "none";
    document.getElementById("vault-loading").style.display = "none";
    document.getElementById("vault-granted").style.display = "none";
    document.getElementById("vault-denied").style.display = "none";
}

function showVaultState(stateId) {
    hideAllVaultStates();
    document.getElementById(stateId).style.display = "block";
}

async function checkVaultAccess() {
    showVaultState("vault-loading");

    var token = await getIdToken();
    if (!token) {
        showVaultState("vault-not-signed-in");
        return;
    }

    try {
        var response = await fetch(API_BASE + "/api/vault/access", {
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

        if (!response.ok) {
            throw new Error("Unexpected status: " + response.status);
        }

        var data = await response.json();
        var grantedEl = document.getElementById("vault-granted");
        grantedEl.innerHTML =
            "<h3>Welcome, " + data.email + "</h3>" +
            "<p>" + data.content + "</p>";
        showVaultState("vault-granted");

    } catch (error) {
        console.error("Vault access check failed:", error);
        showVaultState("vault-denied");
    }
}

// Listen for auth state changes on the vault page
auth.onAuthStateChanged(function (user) {
    if (user) {
        checkVaultAccess();
    } else {
        showVaultState("vault-not-signed-in");
    }
});
