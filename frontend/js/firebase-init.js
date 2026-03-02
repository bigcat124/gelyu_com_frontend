// Firebase configuration — these values are public, safe to expose in client code.
// Security is enforced by Firebase Security Rules and backend token verification.
const firebaseConfig = {
    apiKey: "AIzaSyAlzJk3-noqq5Ef_L0mnB3fBy1Q5MYMU50",
    authDomain: "project-c243fac2-f8de-4142-8aa.firebaseapp.com",
    projectId: "project-c243fac2-f8de-4142-8aa",
};

firebase.initializeApp(firebaseConfig);

// API base URL: use backend directly on localhost, relative path in production
var API_BASE = window.location.hostname === "localhost" ? "http://localhost:8080" : "";
