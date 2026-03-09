/**
 * Album page: photo grid, upload, lightbox.
 * URL: /vault/{slug}/{albumSlug}
 * Depends on auth.js and firebase-init.js being loaded first.
 */

// --- URL parsing ---

function getSlugFromPath() {
    var parts = window.location.pathname.split("/");
    return parts[2] || null;
}

function getAlbumSlugFromPath() {
    var parts = window.location.pathname.split("/");
    return parts[3] || null;
}

// --- State management ---

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

// --- Globals for lightbox ---

var _photos = [];
var _currentPhotoIndex = -1;
var _isAdmin = false;
var _token = null;
var _slug = null;
var _albumSlug = null;
var _vaultName = "";

// --- Main load ---

async function loadAlbum() {
    _slug = getSlugFromPath();
    _albumSlug = getAlbumSlugFromPath();
    if (!_slug || !_albumSlug) {
        showVaultState("vault-not-found");
        return;
    }

    showVaultState("vault-loading");

    _token = await getIdToken();
    if (!_token) {
        showVaultState("vault-not-signed-in");
        return;
    }

    try {
        // 1. Fetch vault detail (access check + admin flag)
        var vaultRes = await fetch(
            API_BASE + "/api/vaults/" + encodeURIComponent(_slug),
            { headers: { "Authorization": "Bearer " + _token } }
        );

        if (vaultRes.status === 401) {
            await signOut();
            showVaultState("vault-not-signed-in");
            return;
        }
        if (vaultRes.status === 403) {
            showVaultState("vault-denied");
            return;
        }
        if (vaultRes.status === 404) {
            showVaultState("vault-not-found");
            return;
        }
        if (!vaultRes.ok) throw new Error("Unexpected status: " + vaultRes.status);

        var vaultData = await vaultRes.json();
        _isAdmin = vaultData.is_admin;
        _vaultName = vaultData.name;

        // 2. Fetch album detail
        var albumRes = await fetch(
            API_BASE + "/api/vaults/" + encodeURIComponent(_slug) +
            "/albums/" + encodeURIComponent(_albumSlug),
            { headers: { "Authorization": "Bearer " + _token } }
        );

        if (albumRes.status === 404) {
            showVaultState("vault-not-found");
            return;
        }
        if (!albumRes.ok) throw new Error("Album fetch failed");
        var albumData = await albumRes.json();

        // 3. Fetch photos
        var photosRes = await fetch(
            API_BASE + "/api/vaults/" + encodeURIComponent(_slug) +
            "/albums/" + encodeURIComponent(_albumSlug) + "/photos",
            { headers: { "Authorization": "Bearer " + _token } }
        );
        var photosData = photosRes.ok ? await photosRes.json() : { photos: [] };
        _photos = photosData.photos;

        // Update title
        document.getElementById("album-title").textContent = albumData.title;
        document.title = albumData.title + " - " + _vaultName + " - Vault - Ge Lyu";

        // Build content
        var grantedEl = document.getElementById("vault-granted");
        grantedEl.textContent = "";

        var content = document.createElement("div");
        content.className = "album-page-content";

        if (albumData.description) {
            var desc = document.createElement("p");
            desc.className = "vault-description";
            desc.textContent = albumData.description;
            content.appendChild(desc);
        }

        // Admin: upload button + upload area
        if (_isAdmin) {
            var uploadBtn = document.getElementById("hero-upload-btn");
            uploadBtn.style.display = "";
            content.appendChild(renderUploadArea());
            uploadBtn.onclick = function () {
                var area = document.getElementById("upload-area");
                area.style.display = area.style.display === "none" ? "block" : "none";
            };

            // Show delete button in lightbox
            document.getElementById("lightbox-admin").style.display = "";
        }

        // Photo grid
        content.appendChild(renderPhotoGrid(_photos));

        // Back link
        var backLink = document.createElement("a");
        backLink.href = "/vault/" + _slug;
        backLink.textContent = "\u2190 Back to " + _vaultName;
        backLink.className = "back-link";
        content.appendChild(backLink);

        grantedEl.appendChild(content);
        showVaultState("vault-granted");

    } catch (error) {
        console.error("Album load failed:", error);
        showVaultState("vault-denied");
    }
}

// --- Photo grid ---

function renderPhotoGrid(photos) {
    var grid = document.createElement("div");
    grid.className = "photo-grid";
    grid.id = "photo-grid";

    if (photos.length === 0) {
        var p = document.createElement("p");
        p.className = "vault-content-placeholder";
        p.textContent = "No photos yet.";
        grid.appendChild(p);
        return grid;
    }

    photos.forEach(function (photo, index) {
        var cell = document.createElement("div");
        cell.className = "photo-cell";
        cell.onclick = function () { openLightbox(index); };

        var isVideo = photo.content_type && photo.content_type.startsWith("video/");

        if (isVideo) {
            var placeholder = document.createElement("div");
            placeholder.className = "photo-cell-video-placeholder";
            placeholder.textContent = "\u25B6";
            cell.appendChild(placeholder);
        } else if (photo.thumb_url) {
            var img = document.createElement("img");
            img.src = photo.thumb_url;
            img.alt = photo.caption || photo.file_name;
            img.loading = "lazy";
            cell.appendChild(img);
        }

        grid.appendChild(cell);
    });

    return grid;
}

// --- Upload area (admin) ---

function renderUploadArea() {
    var area = document.createElement("div");
    area.id = "upload-area";
    area.className = "upload-area";
    area.style.display = "none";

    area.innerHTML =
        '<div class="upload-drop-zone" id="upload-drop-zone">' +
            '<p>Drag and drop files here, or click to select</p>' +
            '<input type="file" id="upload-input" multiple ' +
                'accept="image/jpeg,image/png,image/webp,image/gif,video/mp4">' +
        '</div>' +
        '<div id="upload-queue"></div>' +
        '<div id="upload-message" class="form-message"></div>';

    setTimeout(function () {
        var dropZone = document.getElementById("upload-drop-zone");
        var fileInput = document.getElementById("upload-input");

        dropZone.onclick = function () { fileInput.click(); };

        dropZone.ondragover = function (e) {
            e.preventDefault();
            dropZone.classList.add("drag-over");
        };
        dropZone.ondragleave = function () {
            dropZone.classList.remove("drag-over");
        };
        dropZone.ondrop = function (e) {
            e.preventDefault();
            dropZone.classList.remove("drag-over");
            handleFiles(e.dataTransfer.files);
        };

        fileInput.onchange = function () {
            handleFiles(fileInput.files);
            fileInput.value = "";
        };
    }, 0);

    return area;
}

// --- File upload ---

var ALLOWED_TYPES = {
    "image/jpeg": 20, "image/png": 20, "image/webp": 20, "image/gif": 20,
    "video/mp4": 200,
};

function handleFiles(fileList) {
    var msgEl = document.getElementById("upload-message");
    msgEl.textContent = "";
    msgEl.className = "form-message";

    for (var i = 0; i < fileList.length; i++) {
        var file = fileList[i];
        var maxMb = ALLOWED_TYPES[file.type];
        if (!maxMb) {
            msgEl.textContent = "Unsupported file type: " + file.type;
            msgEl.className = "form-message form-message-error";
            continue;
        }
        if (file.size > maxMb * 1024 * 1024) {
            msgEl.textContent = file.name + " exceeds " + maxMb + "MB limit.";
            msgEl.className = "form-message form-message-error";
            continue;
        }
        uploadFile(file);
    }
}

async function uploadFile(file) {
    var queueEl = document.getElementById("upload-queue");
    var isVideo = file.type.startsWith("video/");

    // Progress row
    var row = document.createElement("div");
    row.className = "upload-row";
    row.innerHTML =
        '<span class="upload-filename">' + escapeHtml(file.name) + '</span>' +
        '<div class="upload-progress"><div class="upload-progress-bar"></div></div>' +
        '<span class="upload-status">Preparing...</span>';
    queueEl.appendChild(row);

    var bar = row.querySelector(".upload-progress-bar");
    var status = row.querySelector(".upload-status");

    try {
        // 1. Get signed upload URLs
        status.textContent = "Getting URL...";
        var urlRes = await fetch(
            API_BASE + "/api/vaults/" + encodeURIComponent(_slug) +
            "/albums/" + encodeURIComponent(_albumSlug) + "/upload-url" +
            "?content_type=" + encodeURIComponent(file.type),
            {
                method: "POST",
                headers: { "Authorization": "Bearer " + _token },
            }
        );
        if (!urlRes.ok) throw new Error("Failed to get upload URL");
        var urlData = await urlRes.json();

        // 2. Get image dimensions
        var dimensions = { width: 0, height: 0 };
        if (!isVideo) {
            dimensions = await getImageDimensions(file);
        }

        // 3. Upload original
        status.textContent = "Uploading...";
        await uploadToSignedUrl(urlData.original_upload_url, file, file.type, bar);

        // 4. Generate and upload thumbnail (images only)
        if (!isVideo) {
            status.textContent = "Creating thumbnail...";
            bar.style.width = "0%";
            var thumbBlob = await generateThumbnail(file, 400);
            await uploadToSignedUrl(urlData.thumb_upload_url, thumbBlob, "image/jpeg", bar);
        }

        // 5. Confirm upload
        status.textContent = "Confirming...";
        var confirmRes = await fetch(
            API_BASE + "/api/vaults/" + encodeURIComponent(_slug) +
            "/albums/" + encodeURIComponent(_albumSlug) + "/photos" +
            "?photo_id=" + encodeURIComponent(urlData.photo_id),
            {
                method: "POST",
                headers: {
                    "Authorization": "Bearer " + _token,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    file_name: file.name,
                    content_type: file.type,
                    width: dimensions.width,
                    height: dimensions.height,
                    caption: "",
                    has_thumbnail: !isVideo,
                }),
            }
        );
        if (!confirmRes.ok) throw new Error("Confirm failed");

        status.textContent = "Done";
        status.className = "upload-status upload-status-done";
        bar.style.width = "100%";

        // Refresh after short delay
        setTimeout(function () { loadAlbum(); }, 800);

    } catch (e) {
        status.textContent = "Failed";
        status.className = "upload-status upload-status-error";
        console.error("Upload failed:", e);
    }
}

function uploadToSignedUrl(url, blob, contentType, progressBar) {
    return new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open("PUT", url, true);
        xhr.setRequestHeader("Content-Type", contentType);

        xhr.upload.onprogress = function (e) {
            if (e.lengthComputable && progressBar) {
                progressBar.style.width = Math.round((e.loaded / e.total) * 100) + "%";
            }
        };

        xhr.onload = function () {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve();
            } else {
                reject(new Error("Upload returned status " + xhr.status));
            }
        };
        xhr.onerror = function () { reject(new Error("Upload network error")); };

        xhr.send(blob);
    });
}

// --- Client-side thumbnail ---

function generateThumbnail(file, maxWidth) {
    return new Promise(function (resolve, reject) {
        var img = new Image();
        var url = URL.createObjectURL(file);
        img.onload = function () {
            var scale = maxWidth / img.width;
            if (scale >= 1) scale = 1;
            var canvas = document.createElement("canvas");
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            var ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);
            canvas.toBlob(function (blob) {
                resolve(blob);
            }, "image/jpeg", 0.8);
        };
        img.onerror = function () {
            URL.revokeObjectURL(url);
            reject(new Error("Failed to load image for thumbnail"));
        };
        img.src = url;
    });
}

function getImageDimensions(file) {
    return new Promise(function (resolve) {
        var img = new Image();
        var url = URL.createObjectURL(file);
        img.onload = function () {
            URL.revokeObjectURL(url);
            resolve({ width: img.naturalWidth, height: img.naturalHeight });
        };
        img.onerror = function () {
            URL.revokeObjectURL(url);
            resolve({ width: 0, height: 0 });
        };
        img.src = url;
    });
}

// --- Lightbox ---

function openLightbox(index) {
    _currentPhotoIndex = index;
    showLightboxPhoto(index);
    document.getElementById("lightbox").style.display = "flex";
    document.body.style.overflow = "hidden";
}

function closeLightbox() {
    document.getElementById("lightbox").style.display = "none";
    document.body.style.overflow = "";
    var video = document.getElementById("lightbox-video");
    video.pause();
    video.src = "";
}

async function showLightboxPhoto(index) {
    var photo = _photos[index];
    var imgEl = document.getElementById("lightbox-img");
    var videoEl = document.getElementById("lightbox-video");
    var captionEl = document.getElementById("lightbox-caption");
    var isVideo = photo.content_type && photo.content_type.startsWith("video/");

    // Show loading state
    imgEl.style.display = "none";
    videoEl.style.display = "none";
    videoEl.pause();
    captionEl.textContent = "Loading...";

    // Fetch full-resolution signed URL
    var res = await fetch(
        API_BASE + "/api/vaults/" + encodeURIComponent(_slug) +
        "/albums/" + encodeURIComponent(_albumSlug) +
        "/photos/" + encodeURIComponent(photo.id),
        { headers: { "Authorization": "Bearer " + _token } }
    );

    if (!res.ok) {
        captionEl.textContent = "Failed to load.";
        return;
    }

    var data = await res.json();

    if (isVideo) {
        imgEl.style.display = "none";
        videoEl.style.display = "block";
        videoEl.src = data.original_url;
    } else {
        videoEl.style.display = "none";
        videoEl.pause();
        imgEl.style.display = "block";
        imgEl.src = data.original_url;
    }

    captionEl.textContent = photo.caption || "";
}

async function deleteCurrentPhoto() {
    if (_currentPhotoIndex < 0 || _currentPhotoIndex >= _photos.length) return;

    var photo = _photos[_currentPhotoIndex];
    if (!confirm("Delete this photo?")) return;

    try {
        var res = await fetch(
            API_BASE + "/api/vaults/" + encodeURIComponent(_slug) +
            "/albums/" + encodeURIComponent(_albumSlug) +
            "/photos/" + encodeURIComponent(photo.id),
            {
                method: "DELETE",
                headers: { "Authorization": "Bearer " + _token },
            }
        );

        if (res.ok) {
            closeLightbox();
            loadAlbum();
        }
    } catch (e) {
        console.error("Delete failed:", e);
    }
}

// Wire up lightbox controls
document.getElementById("lightbox").querySelector(".lightbox-close").onclick = closeLightbox;
document.getElementById("lightbox").querySelector(".lightbox-prev").onclick = function () {
    if (_currentPhotoIndex > 0) {
        _currentPhotoIndex--;
        showLightboxPhoto(_currentPhotoIndex);
    }
};
document.getElementById("lightbox").querySelector(".lightbox-next").onclick = function () {
    if (_currentPhotoIndex < _photos.length - 1) {
        _currentPhotoIndex++;
        showLightboxPhoto(_currentPhotoIndex);
    }
};
document.getElementById("lightbox-delete").onclick = deleteCurrentPhoto;

// Keyboard navigation
document.addEventListener("keydown", function (e) {
    var lb = document.getElementById("lightbox");
    if (lb.style.display === "none") return;
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft" && _currentPhotoIndex > 0) {
        _currentPhotoIndex--;
        showLightboxPhoto(_currentPhotoIndex);
    }
    if (e.key === "ArrowRight" && _currentPhotoIndex < _photos.length - 1) {
        _currentPhotoIndex++;
        showLightboxPhoto(_currentPhotoIndex);
    }
});

function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

// Wire up sign-in button
document.getElementById("vault-sign-in-btn").onclick = signInWithGoogle;

// Listen for auth state changes
auth.onAuthStateChanged(function (user) {
    if (user) {
        loadAlbum();
    } else {
        showVaultState("vault-not-signed-in");
    }
});
