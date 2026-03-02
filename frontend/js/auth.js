/**
 * Auth module: Google sign-in/out, token management, UI updates.
 * Depends on firebase-init.js being loaded first.
 */

const auth = firebase.auth();
const googleProvider = new firebase.auth.GoogleAuthProvider();

/** Get the current user's ID token, or null if not signed in. */
async function getIdToken() {
    const user = auth.currentUser;
    if (!user) return null;
    return user.getIdToken(false);
}

/** Sign in with Google popup. */
async function signInWithGoogle() {
    try {
        await auth.signInWithPopup(googleProvider);
    } catch (error) {
        console.error("Sign-in failed:", error);
        alert("Sign-in failed. Please try again.");
    }
}

/** Sign out. */
async function signOut() {
    try {
        await auth.signOut();
    } catch (error) {
        console.error("Sign-out failed:", error);
    }
}

/**
 * Listen for auth state changes and update the header UI.
 * Called after the shared header is loaded into the DOM.
 */
function initAuthUI() {
    auth.onAuthStateChanged((user) => {
        const authContainer = document.getElementById("auth-container");
        if (!authContainer) return;

        if (user) {
            authContainer.innerHTML =
                '<span class="auth-email">' + user.email + '</span>' +
                '<button class="auth-btn" onclick="signOut()">Sign Out</button>';
        } else {
            authContainer.innerHTML =
                '<button class="auth-btn" onclick="signInWithGoogle()">Sign In</button>';
        }
    });
}
