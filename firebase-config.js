import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBTwyCDxuqhoIjgMR5hhDG0Hc-OZXnLv1k",
  authDomain: "androlink.firebaseapp.com",
  projectId: "androlink",
  storageBucket: "androlink.firebasestorage.app",
  messagingSenderId: "1031316396633",
  appId: "1:1031316396633:web:542749fbb86ecb7b3def48"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
