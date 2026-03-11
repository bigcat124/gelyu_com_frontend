/**
 * Vault settings page: edit name, manage user access.
 * Admin only. Depends on auth.js and firebase-init.js being loaded first.
 */

function getSlugFromPath() {
    var parts = window.location.pathname.split("/");
    // parts = ["", "vault", "slug", "settings"]
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

function renderNameSection(slug, name, token) {
    var section = document.createElement("div");
    section.className = "settings-section";

    var label = document.createElement("label");
    label.className = "settings-label";
    label.textContent = "Vault Name";
    label.setAttribute("for", "edit-name");
    section.appendChild(label);

    var row = document.createElement("div");
    row.className = "settings-name-row";

    var input = document.createElement("input");
    input.type = "text";
    input.id = "edit-name";
    input.className = "settings-input";
    input.value = name;
    input.maxLength = 100;
    row.appendChild(input);

    var saveBtn = document.createElement("button");
    saveBtn.className = "btn-primary";
    saveBtn.textContent = "Save";
    row.appendChild(saveBtn);

    section.appendChild(row);

    var msg = document.createElement("div");
    msg.className = "form-message";
    section.appendChild(msg);

    saveBtn.onclick = async function () {
        var newName = input.value.trim();
        msg.textContent = "";
        msg.className = "form-message";

        if (!newName) {
            msg.textContent = "Name cannot be empty.";
            msg.className = "form-message form-message-error";
            return;
        }

        try {
            var res = await fetch(API_BASE + "/api/vaults/" + encodeURIComponent(slug) + "", {
                method: "PATCH",
                headers: {
                    "Authorization": "Bearer " + token,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ name: newName }),
            });

            var body = await res.json().catch(function () { return {}; });

            if (!res.ok) {
                msg.textContent = body.detail || "Failed to update name.";
                msg.className = "form-message form-message-error";
                return;
            }

            msg.textContent = "Name updated.";
            msg.className = "form-message form-message-success";

            // Update page title
            document.getElementById("vault-title").textContent = newName + " — Settings";
            document.title = newName + " — Settings - Vault - Ge Lyu";

            // If slug changed, redirect to new settings URL
            if (body.slug && body.slug !== slug) {
                setTimeout(function () {
                    window.location.href = "/vaults/" + body.slug + "/settings";
                }, 500);
            }
        } catch (e) {
            msg.textContent = "Network error. Please try again.";
            msg.className = "form-message form-message-error";
        }
    };

    return section;
}

function renderAccessTable(slug, users, token) {
    var section = document.createElement("div");
    section.className = "settings-section";

    var label = document.createElement("h4");
    label.className = "settings-label";
    label.textContent = "User Access";
    section.appendChild(label);

    var table = document.createElement("table");
    table.className = "settings-table";

    // Header
    var thead = document.createElement("thead");
    thead.innerHTML = "<tr><th>Email</th><th>Access Level</th><th></th></tr>";
    table.appendChild(thead);

    var tbody = document.createElement("tbody");
    tbody.id = "access-tbody";

    users.forEach(function (u) {
        tbody.appendChild(createUserRow(slug, u.email, u.level, token, tbody));
    });

    table.appendChild(tbody);
    section.appendChild(table);

    // Add user row
    var addRow = document.createElement("div");
    addRow.className = "settings-add-row";
    addRow.innerHTML =
        '<input type="email" id="add-email" class="settings-input" placeholder="user@example.com">' +
        '<button id="add-btn" class="btn-primary">Add</button>';
    section.appendChild(addRow);

    var addMsg = document.createElement("div");
    addMsg.id = "add-message";
    addMsg.className = "form-message";
    section.appendChild(addMsg);

    addRow.querySelector("#add-btn").onclick = async function () {
        var email = addRow.querySelector("#add-email").value.trim();
        var level = "read";
        addMsg.textContent = "";
        addMsg.className = "form-message";

        if (!email) {
            addMsg.textContent = "Email is required.";
            addMsg.className = "form-message form-message-error";
            return;
        }

        try {
            var res = await fetch(API_BASE + "/api/vaults/" + encodeURIComponent(slug) + "/access", {
                method: "POST",
                headers: {
                    "Authorization": "Bearer " + token,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ email: email, level: level }),
            });

            var body = await res.json().catch(function () { return {}; });

            if (!res.ok) {
                addMsg.textContent = body.detail || "Failed to add user.";
                addMsg.className = "form-message form-message-error";
                return;
            }

            // Check if user already exists in the table (update case)
            var existing = tbody.querySelector('[data-email="' + CSS.escape(email) + '"]');
            if (existing) {
                existing.querySelector(".access-level-select").value = level;
            } else {
                tbody.appendChild(createUserRow(slug, email, level, token, tbody));
            }

            addRow.querySelector("#add-email").value = "";
            addMsg.textContent = "User added.";
            addMsg.className = "form-message form-message-success";
        } catch (e) {
            addMsg.textContent = "Network error. Please try again.";
            addMsg.className = "form-message form-message-error";
        }
    };

    return section;
}

function createUserRow(slug, email, level, token, tbody) {
    var tr = document.createElement("tr");
    tr.setAttribute("data-email", email);

    var tdEmail = document.createElement("td");
    tdEmail.textContent = email;
    tr.appendChild(tdEmail);

    var tdLevel = document.createElement("td");
    var select = document.createElement("select");
    select.className = "access-level-select";
    select.innerHTML = '<option value="read">read</option><option value="write">write</option>';
    select.value = level;
    tdLevel.appendChild(select);
    tr.appendChild(tdLevel);

    var tdActions = document.createElement("td");
    var removeBtn = document.createElement("button");
    removeBtn.className = "btn-remove";
    removeBtn.textContent = "Remove";
    tdActions.appendChild(removeBtn);
    tr.appendChild(tdActions);

    // Change level on dropdown change
    select.onchange = async function () {
        try {
            var res = await fetch(API_BASE + "/api/vaults/" + encodeURIComponent(slug) + "/access", {
                method: "POST",
                headers: {
                    "Authorization": "Bearer " + token,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ email: email, level: select.value }),
            });
            if (!res.ok) {
                select.value = level;
            } else {
                level = select.value;
            }
        } catch (e) {
            select.value = level;
        }
    };

    // Remove user
    removeBtn.onclick = async function () {
        try {
            var res = await fetch(API_BASE + "/api/vaults/" + encodeURIComponent(slug) + "/access/revoke", {
                method: "POST",
                headers: {
                    "Authorization": "Bearer " + token,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ email: email }),
            });
            if (res.ok) {
                tbody.removeChild(tr);
            }
        } catch (e) { /* ignore */ }
    };

    return tr;
}

async function loadSettings() {
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
        // Fetch vault detail (also checks access + admin)
        var detailRes = await fetch(API_BASE + "/api/vaults/" + encodeURIComponent(slug), {
            headers: { "Authorization": "Bearer " + token },
        });

        if (detailRes.status === 401) {
            await signOut();
            showVaultState("vault-not-signed-in");
            return;
        }

        if (detailRes.status === 403) {
            showVaultState("vault-denied");
            return;
        }

        if (detailRes.status === 404) {
            showVaultState("vault-not-found");
            return;
        }

        if (!detailRes.ok) {
            throw new Error("Unexpected status: " + detailRes.status);
        }

        var data = await detailRes.json();

        if (!data.is_admin) {
            showVaultState("vault-denied");
            return;
        }

        // Update page title
        document.getElementById("vault-title").textContent = data.name + " \u2014 Settings";
        document.title = data.name + " \u2014 Settings - Vault - Ge Lyu";

        // Fetch access list
        var accessRes = await fetch(API_BASE + "/api/vaults/" + encodeURIComponent(slug) + "/access", {
            headers: { "Authorization": "Bearer " + token },
        });
        var accessData = accessRes.ok ? await accessRes.json() : { users: [] };

        // Render settings
        var grantedEl = document.getElementById("vault-granted");
        grantedEl.textContent = "";

        var content = document.createElement("div");
        content.className = "vault-settings-content";

        content.appendChild(renderNameSection(slug, data.name, token));
        content.appendChild(renderAccessTable(slug, accessData.users, token));

        var backLink = document.createElement("a");
        backLink.href = "/vaults/" + slug;
        backLink.textContent = "\u2190 Back to Vault";
        backLink.className = "back-link";
        content.appendChild(backLink);

        grantedEl.appendChild(content);
        showVaultState("vault-granted");

    } catch (error) {
        console.error("Settings load failed");
        showVaultState("vault-denied");
    }
}

// Wire up sign-in button
document.getElementById("vault-sign-in-btn").onclick = signInWithGoogle;

// Listen for auth state changes
auth.onAuthStateChanged(function (user) {
    if (user) {
        loadSettings();
    } else {
        showVaultState("vault-not-signed-in");
    }
});
