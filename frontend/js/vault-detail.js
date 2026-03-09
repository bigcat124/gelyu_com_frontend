/**
 * Vault detail page: show albums, admin create album.
 * URL: /vault/{slug}
 * Depends on auth.js and firebase-init.js being loaded first.
 */

function getSlugFromPath() {
    var parts = window.location.pathname.split("/");
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

function renderAlbumList(albums, slug, container) {
    if (albums.length === 0) {
        var p = document.createElement("p");
        p.className = "vault-content-placeholder";
        p.textContent = "No albums yet.";
        container.appendChild(p);
        return;
    }

    var grid = document.createElement("div");
    grid.className = "album-grid";

    albums.forEach(function (album) {
        var card = document.createElement("a");
        card.href = "/vault/" + slug + "/" + album.slug;
        card.className = "album-card";

        var imgContainer = document.createElement("div");
        imgContainer.className = "album-card-cover";
        if (album.cover_photo_url) {
            var img = document.createElement("img");
            img.src = album.cover_photo_url;
            img.alt = album.title;
            img.loading = "lazy";
            imgContainer.appendChild(img);
        } else {
            imgContainer.className += " album-card-cover-empty";
        }
        card.appendChild(imgContainer);

        var info = document.createElement("div");
        info.className = "album-card-info";

        var title = document.createElement("h4");
        title.textContent = album.title;
        info.appendChild(title);

        if (album.description) {
            var desc = document.createElement("p");
            desc.textContent = album.description;
            info.appendChild(desc);
        }

        var count = document.createElement("span");
        count.className = "album-card-count";
        count.textContent = album.photo_count + " photo" + (album.photo_count !== 1 ? "s" : "");
        info.appendChild(count);

        card.appendChild(info);
        grid.appendChild(card);
    });

    container.appendChild(grid);
}

function renderCreateAlbumForm(slug, token) {
    var form = document.createElement("div");
    form.className = "admin-form";
    form.style.display = "none";
    form.innerHTML =
        '<div class="form-group">' +
            '<label for="album-title">Title</label>' +
            '<input type="text" id="album-title" maxlength="100" placeholder="Album title">' +
        '</div>' +
        '<div class="form-group">' +
            '<label for="album-desc">Description</label>' +
            '<input type="text" id="album-desc" maxlength="1000" placeholder="Optional description">' +
        '</div>' +
        '<div class="form-actions">' +
            '<button id="album-create-submit" class="btn-primary">Create</button>' +
            '<button id="album-create-cancel" class="btn-secondary">Cancel</button>' +
        '</div>' +
        '<div id="album-create-message" class="form-message"></div>';

    var heroBtn = document.getElementById("hero-create-btn");
    heroBtn.style.display = "";
    heroBtn.onclick = function () {
        form.style.display = form.style.display === "none" ? "block" : "none";
    };

    form.querySelector("#album-create-cancel").onclick = function () {
        form.style.display = "none";
        form.querySelector("#album-title").value = "";
        form.querySelector("#album-desc").value = "";
        form.querySelector("#album-create-message").textContent = "";
    };

    form.querySelector("#album-create-submit").onclick = async function () {
        var titleVal = form.querySelector("#album-title").value.trim();
        var descVal = form.querySelector("#album-desc").value.trim();
        var msgEl = form.querySelector("#album-create-message");
        msgEl.textContent = "";
        msgEl.className = "form-message";

        if (!titleVal) {
            msgEl.textContent = "Title is required.";
            msgEl.className = "form-message form-message-error";
            return;
        }

        try {
            var res = await fetch(
                API_BASE + "/api/vaults/" + encodeURIComponent(slug) + "/albums",
                {
                    method: "POST",
                    headers: {
                        "Authorization": "Bearer " + token,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ title: titleVal, description: descVal }),
                }
            );

            if (res.status === 409) {
                msgEl.textContent = "An album with that title already exists.";
                msgEl.className = "form-message form-message-error";
                return;
            }

            if (!res.ok) {
                var err = await res.json().catch(function () { return {}; });
                msgEl.textContent = err.detail || "Failed to create album.";
                msgEl.className = "form-message form-message-error";
                return;
            }

            msgEl.textContent = "Album created.";
            msgEl.className = "form-message form-message-success";
            setTimeout(function () { loadVault(); }, 600);
        } catch (e) {
            msgEl.textContent = "Network error.";
            msgEl.className = "form-message form-message-error";
        }
    };

    return form;
}

async function loadVault() {
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
        var response = await fetch(API_BASE + "/api/vaults/" + encodeURIComponent(slug), {
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

        // Fetch albums
        var albumsRes = await fetch(
            API_BASE + "/api/vaults/" + encodeURIComponent(slug) + "/albums",
            { headers: { "Authorization": "Bearer " + token } }
        );
        var albumsData = albumsRes.ok ? await albumsRes.json() : { albums: [] };

        // Build content
        var grantedEl = document.getElementById("vault-granted");
        grantedEl.textContent = "";

        var content = document.createElement("div");
        content.className = "vault-detail-content";

        // Admin controls
        var heroBtn = document.getElementById("hero-create-btn");
        if (data.is_admin) {
            var heroLink = document.getElementById("hero-settings-link");
            heroLink.href = "/vault/" + slug + "/settings";
            heroLink.style.display = "";

            content.appendChild(renderCreateAlbumForm(slug, token));
        } else {
            heroBtn.style.display = "none";
        }

        // Album grid
        renderAlbumList(albumsData.albums, slug, content);

        // Back link
        var backLink = document.createElement("a");
        backLink.href = "/vault.html";
        backLink.textContent = "\u2190 Back to Vaults";
        backLink.className = "back-link";
        content.appendChild(backLink);

        grantedEl.appendChild(content);
        showVaultState("vault-granted");

    } catch (error) {
        console.error("Vault load failed");
        showVaultState("vault-denied");
    }
}

// Wire up sign-in button
document.getElementById("vault-sign-in-btn").onclick = signInWithGoogle;

// Listen for auth state changes
auth.onAuthStateChanged(function (user) {
    if (user) {
        loadVault();
    } else {
        showVaultState("vault-not-signed-in");
    }
});
