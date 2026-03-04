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

function renderSubVaultList(subVaults, container) {
    if (subVaults.length === 0) {
        var p = document.createElement("p");
        p.textContent = "No sub-vaults available.";
        container.appendChild(p);
        return;
    }

    var list = document.createElement("div");
    list.className = "sub-vault-list";
    subVaults.forEach(function (sv) {
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

        list.appendChild(card);
    });
    container.appendChild(list);
}

function renderCreateForm(token) {
    var section = document.createElement("div");
    section.className = "admin-section";

    var toggle = document.createElement("button");
    toggle.className = "admin-toggle-btn";
    toggle.textContent = "+ Create Sub-Vault";
    section.appendChild(toggle);

    var form = document.createElement("div");
    form.className = "admin-form";
    form.style.display = "none";
    form.innerHTML =
        '<div class="form-group">' +
            '<label for="create-name">Name</label>' +
            '<input type="text" id="create-name" maxlength="100" placeholder="Sub-vault name">' +
        '</div>' +
        '<div class="form-group">' +
            '<label for="create-desc">Description</label>' +
            '<input type="text" id="create-desc" maxlength="1000" placeholder="Optional description">' +
        '</div>' +
        '<div class="form-actions">' +
            '<button id="create-submit" class="btn-primary">Create</button>' +
            '<button id="create-cancel" class="btn-secondary">Cancel</button>' +
        '</div>' +
        '<div id="create-message" class="form-message"></div>';
    section.appendChild(form);

    toggle.onclick = function () {
        form.style.display = "block";
        toggle.style.display = "none";
    };

    form.querySelector("#create-cancel").onclick = function () {
        form.style.display = "none";
        toggle.style.display = "";
        form.querySelector("#create-name").value = "";
        form.querySelector("#create-desc").value = "";
        form.querySelector("#create-message").textContent = "";
    };

    form.querySelector("#create-submit").onclick = async function () {
        var nameVal = form.querySelector("#create-name").value.trim();
        var descVal = form.querySelector("#create-desc").value.trim();
        var msgEl = form.querySelector("#create-message");
        msgEl.textContent = "";
        msgEl.className = "form-message";

        if (!nameVal) {
            msgEl.textContent = "Name is required.";
            msgEl.className = "form-message form-message-error";
            return;
        }

        try {
            var res = await fetch(API_BASE + "/api/vault/sub-vaults", {
                method: "POST",
                headers: {
                    "Authorization": "Bearer " + token,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ name: nameVal, description: descVal }),
            });

            if (res.status === 409) {
                msgEl.textContent = "A sub-vault with that name already exists.";
                msgEl.className = "form-message form-message-error";
                return;
            }

            if (!res.ok) {
                var err = await res.json().catch(function () { return {}; });
                msgEl.textContent = err.detail || "Failed to create sub-vault.";
                msgEl.className = "form-message form-message-error";
                return;
            }

            msgEl.textContent = "Sub-vault created.";
            msgEl.className = "form-message form-message-success";
            form.querySelector("#create-name").value = "";
            form.querySelector("#create-desc").value = "";

            // Refresh the page after a short delay
            setTimeout(function () { checkVaultAccess(); }, 600);
        } catch (e) {
            msgEl.textContent = "Network error. Please try again.";
            msgEl.className = "form-message form-message-error";
        }
    };

    return section;
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

        // Admin: show create sub-vault form
        if (data.is_admin) {
            grantedEl.appendChild(renderCreateForm(token));
        }

        renderSubVaultList(subVaultsData.sub_vaults, grantedEl);

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
