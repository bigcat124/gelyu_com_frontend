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

function renderAccessManagement(slug, token) {
    var section = document.createElement("div");
    section.className = "access-management";

    var heading = document.createElement("h4");
    heading.textContent = "Access Management";
    section.appendChild(heading);

    // Grant access form
    var grantLabel = document.createElement("p");
    grantLabel.textContent = "Grant access:";
    grantLabel.style.fontWeight = "600";
    grantLabel.style.marginBottom = "8px";
    grantLabel.style.fontSize = "0.9rem";
    section.appendChild(grantLabel);

    var grantRow = document.createElement("div");
    grantRow.className = "access-form-row";
    grantRow.innerHTML =
        '<div class="form-group">' +
            '<label for="grant-email">Email</label>' +
            '<input type="email" id="grant-email" placeholder="user@example.com">' +
        '</div>' +
        '<div class="form-group" style="max-width:120px">' +
            '<label for="grant-level">Level</label>' +
            '<select id="grant-level"><option value="read">read</option><option value="write">write</option></select>' +
        '</div>' +
        '<button id="grant-btn" class="btn-primary">Grant</button>';
    section.appendChild(grantRow);

    var grantMsg = document.createElement("div");
    grantMsg.id = "grant-message";
    grantMsg.className = "form-message";
    section.appendChild(grantMsg);

    // Revoke access form
    var revokeLabel = document.createElement("p");
    revokeLabel.textContent = "Revoke access:";
    revokeLabel.style.fontWeight = "600";
    revokeLabel.style.marginBottom = "8px";
    revokeLabel.style.marginTop = "20px";
    revokeLabel.style.fontSize = "0.9rem";
    section.appendChild(revokeLabel);

    var revokeRow = document.createElement("div");
    revokeRow.className = "access-form-row";
    revokeRow.innerHTML =
        '<div class="form-group">' +
            '<label for="revoke-email">Email</label>' +
            '<input type="email" id="revoke-email" placeholder="user@example.com">' +
        '</div>' +
        '<button id="revoke-btn" class="btn-danger">Revoke</button>';
    section.appendChild(revokeRow);

    var revokeMsg = document.createElement("div");
    revokeMsg.id = "revoke-message";
    revokeMsg.className = "form-message";
    section.appendChild(revokeMsg);

    // Grant handler
    grantRow.querySelector("#grant-btn").onclick = async function () {
        var email = grantRow.querySelector("#grant-email").value.trim();
        var level = grantRow.querySelector("#grant-level").value;
        grantMsg.textContent = "";
        grantMsg.className = "form-message";

        if (!email) {
            grantMsg.textContent = "Email is required.";
            grantMsg.className = "form-message form-message-error";
            return;
        }

        try {
            var res = await fetch(API_BASE + "/api/vault/sub-vaults/" + encodeURIComponent(slug) + "/access", {
                method: "POST",
                headers: {
                    "Authorization": "Bearer " + token,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ email: email, level: level }),
            });

            var body = await res.json().catch(function () { return {}; });

            if (!res.ok) {
                grantMsg.textContent = body.detail || "Failed to grant access.";
                grantMsg.className = "form-message form-message-error";
                return;
            }

            grantMsg.textContent = "Access granted to " + email + " (" + level + ").";
            grantMsg.className = "form-message form-message-success";
            grantRow.querySelector("#grant-email").value = "";
        } catch (e) {
            grantMsg.textContent = "Network error. Please try again.";
            grantMsg.className = "form-message form-message-error";
        }
    };

    // Revoke handler
    revokeRow.querySelector("#revoke-btn").onclick = async function () {
        var email = revokeRow.querySelector("#revoke-email").value.trim();
        revokeMsg.textContent = "";
        revokeMsg.className = "form-message";

        if (!email) {
            revokeMsg.textContent = "Email is required.";
            revokeMsg.className = "form-message form-message-error";
            return;
        }

        try {
            var res = await fetch(API_BASE + "/api/vault/sub-vaults/" + encodeURIComponent(slug) + "/access/revoke", {
                method: "POST",
                headers: {
                    "Authorization": "Bearer " + token,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ email: email }),
            });

            var body = await res.json().catch(function () { return {}; });

            if (!res.ok) {
                revokeMsg.textContent = body.detail || "Failed to revoke access.";
                revokeMsg.className = "form-message form-message-error";
                return;
            }

            revokeMsg.textContent = "Access revoked for " + email + ".";
            revokeMsg.className = "form-message form-message-success";
            revokeRow.querySelector("#revoke-email").value = "";
        } catch (e) {
            revokeMsg.textContent = "Network error. Please try again.";
            revokeMsg.className = "form-message form-message-error";
        }
    };

    return section;
}

function renderSettingsPanel(slug, token) {
    var wrapper = document.createElement("div");
    wrapper.className = "settings-wrapper";

    var btn = document.createElement("button");
    btn.className = "settings-toggle-btn";
    btn.textContent = "Settings";
    wrapper.appendChild(btn);

    var panel = document.createElement("div");
    panel.className = "settings-panel";
    panel.style.display = "none";
    panel.appendChild(renderAccessManagement(slug, token));
    wrapper.appendChild(panel);

    btn.onclick = function () {
        var open = panel.style.display !== "none";
        panel.style.display = open ? "none" : "block";
        btn.textContent = open ? "Settings" : "Hide Settings";
    };

    return wrapper;
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

        // Header row: badge + settings button (admin only)
        var headerRow = document.createElement("div");
        headerRow.className = "vault-detail-header";

        var badge = document.createElement("span");
        badge.className = "access-badge access-badge-" + data.access_level;
        badge.textContent = data.access_level + " access";
        headerRow.appendChild(badge);

        if (data.is_admin) {
            var settingsPanel = renderSettingsPanel(slug, token);
            headerRow.appendChild(settingsPanel);
        }

        content.appendChild(headerRow);

        if (data.description) {
            var desc = document.createElement("p");
            desc.className = "vault-description";
            desc.textContent = data.description;
            content.appendChild(desc);
        }

        // Show metadata
        if (data.created_by || data.created_at) {
            var meta = document.createElement("div");
            meta.className = "vault-meta";
            var parts = [];
            if (data.created_by) parts.push("Created by " + data.created_by);
            if (data.created_at) {
                var d = new Date(data.created_at);
                parts.push("on " + d.toLocaleDateString());
            }
            meta.textContent = parts.join(" ");
            content.appendChild(meta);
        }

        // Placeholder content area
        var contentArea = document.createElement("div");
        contentArea.className = "vault-content-area";
        contentArea.innerHTML =
            '<p class="vault-content-placeholder">Content for this vault will appear here.</p>';
        content.appendChild(contentArea);

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
