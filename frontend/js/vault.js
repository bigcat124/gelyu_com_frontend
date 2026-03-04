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

        // Fetch accessible sub-vaults
        var subVaultsResponse = await fetch(API_BASE + "/api/vault/sub-vaults", {
            headers: { "Authorization": "Bearer " + token },
        });
        var subVaultsData = subVaultsResponse.ok ? await subVaultsResponse.json() : { sub_vaults: [] };

        var grantedEl = document.getElementById("vault-granted");
        grantedEl.textContent = "";

        var h3 = document.createElement("h3");
        h3.textContent = "Welcome, " + data.email;
        grantedEl.appendChild(h3);

        if (subVaultsData.sub_vaults.length === 0) {
            var p = document.createElement("p");
            p.textContent = "No sub-vaults available.";
            grantedEl.appendChild(p);
        } else {
            var list = document.createElement("div");
            list.className = "sub-vault-list";
            subVaultsData.sub_vaults.forEach(function (sv) {
                var card = document.createElement("a");
                card.href = "/vault/" + sv.slug;
                card.className = "sub-vault-card";

                var name = document.createElement("h4");
                name.textContent = sv.name;
                card.appendChild(name);

                if (sv.description) {
                    var desc = document.createElement("p");
                    desc.textContent = sv.description;
                    card.appendChild(desc);
                }

                var badge = document.createElement("span");
                badge.className = "access-badge access-badge-" + sv.access_level;
                badge.textContent = sv.access_level;
                card.appendChild(badge);

                list.appendChild(card);
            });
            grantedEl.appendChild(list);
        }

        showVaultState("vault-granted");

    } catch (error) {
        console.error("Vault access check failed");
        showVaultState("vault-denied");
    }
}

// Wire up sign-in button (avoids inline onclick blocked by CSP)
document.getElementById("vault-sign-in-btn").onclick = signInWithGoogle;

// Listen for auth state changes on the vault page
auth.onAuthStateChanged(function (user) {
    if (user) {
        checkVaultAccess();
    } else {
        showVaultState("vault-not-signed-in");
    }
});
