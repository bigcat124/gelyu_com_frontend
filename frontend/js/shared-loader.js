/**
 * Loads shared header and footer, then initializes auth UI.
 * Include this script at the bottom of every page's <body>.
 */
document.addEventListener("DOMContentLoaded", function () {
    // Load header
    fetch("/shared/header.html")
        .then(function (r) { return r.text(); })
        .then(function (html) {
            document.getElementById("header-placeholder").innerHTML = html;
            if (typeof initAuthUI === "function") {
                initAuthUI();
            }
        })
        .catch(function (err) { console.error("Error loading header:", err); });

    // Load footer
    fetch("/shared/footer.html")
        .then(function (r) { return r.text(); })
        .then(function (html) {
            document.getElementById("footer-placeholder").innerHTML = html;
        })
        .catch(function (err) { console.error("Error loading footer:", err); });
});
