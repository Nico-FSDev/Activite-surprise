import { auth, db } from './firebase-config.js';
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged,
    updateProfile,
    sendEmailVerification
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    collection, 
    addDoc, 
    query, 
    where, 
    onSnapshot, 
    deleteDoc, 
    doc, 
    updateDoc,
    getDoc,
    getDocs,
    setDoc,
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    // --- PWA Service Worker Registration & Install Logic ---
    let deferredPrompt;
    const btnInstall = document.getElementById('btn-install-pwa');

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./service-worker.js')
                .then(reg => console.log('SW: Registered', reg))
                .catch(err => console.log('SW: Failed', err));
        });
    }

    window.addEventListener('beforeinstallprompt', (e) => {
        // Prevent Chrome 67 and earlier from automatically showing the prompt
        e.preventDefault();
        // Stash the event so it can be triggered later.
        deferredPrompt = e;
        // Update UI notify the user they can add to home screen
        if (btnInstall) btnInstall.classList.remove('hidden');
    });

    if (btnInstall) {
        btnInstall.addEventListener('click', async () => {
            if (!deferredPrompt) return;
            // Show the prompt
            deferredPrompt.prompt();
            // Wait for the user to respond to the prompt
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`User response to the install prompt: ${outcome}`);
            // We've used the prompt, and can't use it again, throw it away
            deferredPrompt = null;
            btnInstall.classList.add('hidden');
        });
    }

    window.addEventListener('appinstalled', (evt) => {
        console.log('App was installed');
        if (btnInstall) btnInstall.classList.add('hidden');
    });

    // --- Audio Logic ---
    let bgMusic = null;
    let isMusicPlaying = false;

    function initMusic() {
        if (!bgMusic) {
            // Musique Jazzy / Lofi au coin du feu
            bgMusic = new Audio('https://cdn.pixabay.com/audio/2022/08/02/audio_884b9bc146.mp3');
            bgMusic.loop = true;
            bgMusic.volume = 0.5;
            
            bgMusic.onerror = () => {
                console.error("Erreur de chargement audio");
            };
        }
    }

    function toggleMusic() {
        initMusic();
        const btnMobile = document.getElementById('btn-toggle-music');
        const btnDesktop = document.getElementById('btn-toggle-music-desktop');
        const iconMobile = btnMobile ? btnMobile.querySelector('i') : null;
        const iconDesktop = btnDesktop ? btnDesktop.querySelector('i') : null;

        if (isMusicPlaying) {
            bgMusic.pause();
            if (iconMobile) iconMobile.className = 'bx bx-volume-mute';
            if (iconDesktop) iconDesktop.className = 'bx bx-volume-mute';
            isMusicPlaying = false;
        } else {
            bgMusic.play().catch(e => console.log("Music blocked", e));
            if (iconMobile) iconMobile.className = 'bx bx-volume-full';
            if (iconDesktop) iconDesktop.className = 'bx bx-volume-full';
            isMusicPlaying = true;
        }
    }
    
    const mBtn = document.getElementById('btn-toggle-music');
    if (mBtn) mBtn.onclick = toggleMusic;
    const dBtn = document.getElementById('btn-toggle-music-desktop');
    if (dBtn) dBtn.onclick = toggleMusic;

    // --- State & Elements ---
    let currentUser = null;
    let activities = [];
    
    // Decoupled Filter States
    let homeFilters = {
        themes: new Set(),
        types: new Set(),
        minRating: 0,
        maxPrice: 4,
        searchQuery: ""
    };

    let managementFilters = {
        themes: new Set(),
        types: new Set(),
        minRating: 0,
        maxPrice: 4,
        searchQuery: ""
    };
    
    let userSettings = {
        allowRequests: true,
        lightMode: false,
        soundEnabled: true,
        language: 'fr'
    };

    const translations = {
        fr: {
            title_home: "Accueil",
            title_favs: "Favoris",
            title_discover: "Découvrir",
            title_challenges: "Défis",
            title_profile: "Profil",
            hello: "Bonjour",
            hero_badge: "L'activité du moment :",
            btn_spin: "SPIN",
            btn_close: "Fermer & Valider",
            add_member: "Ajouter un membre",
            filter_themes: "Thèmes pour la Roulette :",
            settings_appearance: "Apparence",
            settings_light_mode: "Thème Clair",
            settings_light_mode_desc: "Utiliser des couleurs plus lumineuses.",
            settings_prefs: "Préférences",
            settings_language: "Langue",
            settings_language_desc: "Choisir la langue de l'application.",
            settings_sounds: "Sons d'interface",
            settings_sounds_desc: "Activer les effets sonores."
        },
        en: {
            title_home: "Home",
            title_favs: "Favorites",
            title_discover: "Discover",
            title_challenges: "Challenges",
            title_profile: "Profile",
            hello: "Hello",
            hero_badge: "Activity of the moment:",
            btn_spin: "SPIN",
            btn_close: "Close & Save",
            add_member: "Add Member",
            filter_themes: "Wheel Themes:",
            settings_appearance: "Appearance",
            settings_light_mode: "Light Mode",
            settings_light_mode_desc: "Use brighter colors.",
            settings_prefs: "Preferences",
            settings_language: "Language",
            settings_language_desc: "Choose the application language.",
            settings_sounds: "UI Sounds",
            settings_sounds_desc: "Enable interface sound effects."
        }
    };

    function applyLanguage(lang) {
        const trans = translations[lang] || translations.fr;
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (trans[key]) el.textContent = trans[key];
        });
        // Update nav items specifically
        document.querySelectorAll('[data-view]').forEach(item => {
            const view = item.getAttribute('data-view');
            const span = item.querySelector('span');
            if (span) {
                if (view === 'home' && trans.title_home) span.textContent = trans.title_home;
                if (view === 'management' && trans.title_favs) span.textContent = trans.title_favs;
                if (view === 'calendar' && trans.title_discover) span.textContent = trans.title_discover;
                if (view === 'stats' && trans.title_challenges) span.textContent = trans.title_challenges;
                if (view === 'participants' && trans.title_profile) span.textContent = trans.title_profile;
            }
        });
    }

    function playSound(type) {
        if (!userSettings.soundEnabled) return;
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        if (type === 'click') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(500, ctx.currentTime);
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
            osc.start();
            osc.stop(ctx.currentTime + 0.1);
        } else if (type === 'success') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(400, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.2);
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
            osc.start();
            osc.stop(ctx.currentTime + 0.3);
        } else if (type === 'error') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(150, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.3);
            gain.gain.setValueAtTime(0.05, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
            osc.start();
            osc.stop(ctx.currentTime + 0.3);
        }
    }

    function showToast(message, type = 'info', duration = 3000) {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast-item ${type}`;
        
        let icon = 'bx-info-circle';
        if (type === 'success') icon = 'bx-check-circle';
        if (type === 'error') icon = 'bx-error-circle';

        toast.innerHTML = `
            <div class="toast-icon"><i class='bx ${icon}'></i></div>
            <div class="toast-message">${message}</div>
        `;

        container.appendChild(toast);
        
        // Auto-play sound
        if (type === 'success') playSound('success');
        if (type === 'error') playSound('error');

        // Auto remove
        const timer = setTimeout(() => {
            toast.style.animation = 'toast-out 0.4s forwards';
            setTimeout(() => toast.remove(), 400);
        }, duration);

        // Click to remove
        toast.onclick = () => {
            clearTimeout(timer);
            toast.style.animation = 'toast-out 0.4s forwards';
            setTimeout(() => toast.remove(), 400);
        };
    }

    const authContainer = document.getElementById('auth-container');
    const appShell = document.getElementById('app-shell');
    const loginForm = document.getElementById('login-form');
    const logoutBtn = document.getElementById('logout-btn');
    const displayNameElem = document.getElementById('display-name');
    const currentDateElem = document.getElementById('current-date');

    // UI Elements for Auth Redesign
    const tabLogin = document.getElementById('tab-login');
    const tabSignup = document.getElementById('tab-signup');
    const authTitle = document.getElementById('auth-title');
    const authSubtitle = document.getElementById('auth-subtitle');
    const groupConfirmPassword = document.getElementById('group-confirm-password');
    const authSubmitBtn = document.getElementById('auth-submit-btn');
    const verificationScreen = document.getElementById('verification-screen');
    const userVEmail = document.getElementById('user-v-email');
    const btnResendV = document.getElementById('btn-resend-v');
    const btnBackLogin = document.getElementById('btn-back-login');
    const btnRequestAdminV = document.getElementById('btn-request-admin-v');
    
    // UI Elements for Spin Preparation
    const modalSpinPrep = document.getElementById('modal-spin-prep');
    const spinPSelection = document.getElementById('spin-participants-selection');
    const spinPListCheck = document.getElementById('spin-p-list-check');
    const btnConfirmSpin = document.getElementById('btn-confirm-spin');
    const btnCancelSpin = document.getElementById('btn-cancel-spin');
    const prepTypeBtns = document.querySelectorAll('.prep-type-btn');
    
    let selectedSpinType = 'seul';

    let authMode = 'login'; // 'login' or 'signup'

    // --- Auth Logic ---
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            
            // Check manual verification flag in Firestore
            const userDoc = await getDoc(doc(db, "users", user.uid));
            const isManualVerified = userDoc.exists() && userDoc.data().manualVerified;
            
            // Show/Hide Admin Panels & Nav (Only for admins)
            const adminCard = document.getElementById('card-admin-validation');
            const adminNavItems = document.querySelectorAll('.admin-only');
            const profileEmailDisplay = document.getElementById('profile-email-display');
            
            if (profileEmailDisplay) profileEmailDisplay.textContent = "Connecté en tant que : " + (user.email || "Non disponible");

            const userEmail = (user.email || "").toLowerCase();
            const isAdminEmail = userEmail === 'n.lohberger@gmail.com' || userEmail === 'm.lohberger.pro' || userEmail === 'n.lohberger.pro@gmail.com';
            const isAdminFlag = userDoc.exists() && userDoc.data().role === 'admin';
            const isAdmin = isAdminEmail || isAdminFlag;

            adminNavItems.forEach(el => el.classList.toggle('hidden', !isAdmin));

            if (adminCard) {
                if (isAdmin) {
                    adminCard.classList.remove('hidden');
                    listenToVerificationRequests();
                    listenToSupportTickets();
                    fetchAdminStats();
                } else {
                    adminCard.classList.add('hidden');
                }
            }

            // SECURITY: Check if email is verified OR manually verified by admin
            if (!user.emailVerified && !isManualVerified) {
                authContainer.classList.remove('hidden');
                appShell.classList.add('hidden');
                loginForm.classList.add('hidden');
                document.querySelector('.auth-tabs').classList.add('hidden');
                verificationScreen.classList.remove('hidden');
                authTitle.textContent = "Vérification requise";
                authSubtitle.textContent = "Activez votre compte pour continuer";
                if (userVEmail) userVEmail.textContent = user.email;
                return;
            }

            authContainer.classList.add('hidden');
            appShell.classList.remove('hidden');
            const name = user.displayName || user.email.split('@')[0];
            if (displayNameElem) displayNameElem.textContent = name;
            const mobileName = document.getElementById('display-name-mobile');
            if (mobileName) mobileName.textContent = name;
            initApp();
        } else {
            currentUser = null;
            authContainer.classList.remove('hidden');
            appShell.classList.add('hidden');
            loginForm.classList.remove('hidden');
            document.querySelector('.auth-tabs').classList.remove('hidden');
            verificationScreen.classList.add('hidden');
            resetAuthUI();
        }
    });

    function resetAuthUI() {
        authMode = 'login';
        tabLogin.classList.add('active');
        tabSignup.classList.remove('active');
        authTitle.textContent = "Activité Surprise";
        authSubtitle.textContent = "Bienvenue dans votre espace famille";
        authSubmitBtn.textContent = "Se connecter";
        groupConfirmPassword.classList.add('hidden');
        document.getElementById('auth-error-msg').style.display = 'none';
    }

    // Toggle between Login and Signup
    if (tabLogin && tabSignup) {
        tabLogin.onclick = () => {
            authMode = 'login';
            tabLogin.classList.add('active');
            tabSignup.classList.remove('active');
            authTitle.textContent = "Activité Surprise";
            authSubtitle.textContent = "Bienvenue dans votre espace famille";
            authSubmitBtn.textContent = "Se connecter";
            groupConfirmPassword.classList.add('hidden');
            document.getElementById('auth-error-msg').style.display = 'none';
        };
        tabSignup.onclick = () => {
            authMode = 'signup';
            tabSignup.classList.add('active');
            tabLogin.classList.remove('active');
            authTitle.textContent = "Créer un compte";
            authSubtitle.textContent = "Rejoignez votre famille sur Activité Surprise";
            authSubmitBtn.textContent = "S'inscrire";
            groupConfirmPassword.classList.remove('hidden');
            document.getElementById('auth-error-msg').style.display = 'none';
        };
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = loginForm.email.value;
        const password = loginForm.password.value;
        const confirmPassword = loginForm['confirm-password'] ? loginForm['confirm-password'].value : '';
        const errorMsg = document.getElementById('auth-error-msg');
        const submitBtn = loginForm.querySelector('button');

        try {
            errorMsg.style.display = 'none';
            submitBtn.disabled = true;
            submitBtn.textContent = authMode === 'signup' ? 'Création...' : 'Connexion...';
            
            if (authMode === 'signup') {
                // Validation: Passwords must match
                if (password !== confirmPassword) {
                    throw new Error("Les mots de passe ne correspondent pas.");
                }
                
                const userCred = await createUserWithEmailAndPassword(auth, email, password);
                await updateProfile(userCred.user, { displayName: email.split('@')[0] });
                
                // Initialize Firestore user document right away
                await setDoc(doc(db, "users", userCred.user.uid), {
                    email: email,
                    displayName: email.split('@')[0],
                    manualVerified: false,
                    allowRequests: true,
                    lightMode: false,
                    soundEnabled: true,
                    language: 'fr',
                    createdAt: Date.now()
                });

                // Send verification email
                await sendEmailVerification(userCred.user);
                
                // The onAuthStateChanged will handle the UI switch to verification screen
            } else {
                await signInWithEmailAndPassword(auth, email, password);
            }
        } catch (error) {
            let msg = error.message;
            if (error.code === 'auth/invalid-credential') msg = "Email ou mot de passe incorrect.";
            if (error.code === 'auth/email-already-in-use') msg = "Cet email est déjà utilisé.";
            if (error.code === 'auth/weak-password') msg = "Le mot de passe doit faire au moins 6 caractères.";
            
            errorMsg.textContent = msg;
            errorMsg.style.display = 'block';
            showToast(msg, 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = authMode === 'signup' ? "S'inscrire" : "Se connecter";
        }
    });

    if (btnResendV) {
        btnResendV.onclick = async () => {
            if (auth.currentUser) {
                try {
                    await sendEmailVerification(auth.currentUser);
                    showToast("Un nouveau lien de validation a été envoyé !", 'success');
                } catch (e) {
                    showToast("Erreur: " + e.message, 'error');
                }
            }
        };
    }

    if (btnBackLogin) {
        btnBackLogin.onclick = () => signOut(auth);
    }

    if (btnRequestAdminV) {
        btnRequestAdminV.onclick = () => handleManualVerificationRequest(btnRequestAdminV);
    }

    // Support Ticket Logic
    const modalSupport = document.getElementById('modal-support-ticket');
    const btnSupportLogin = document.getElementById('btn-support-login');
    const btnSupportSettings = document.getElementById('btn-support-settings');
    const btnSubmitSupport = document.getElementById('btn-submit-support');
    const btnCancelSupport = document.getElementById('btn-cancel-support');

    function openSupportModal() {
        if (modalSupport) {
            modalSupport.classList.remove('hidden');
            const emailInput = document.getElementById('support-email');
            if (currentUser && currentUser.email) {
                emailInput.value = currentUser.email;
            } else {
                const loginEmail = document.getElementById('email');
                if (loginEmail && loginEmail.value) {
                    emailInput.value = loginEmail.value;
                }
            }
        }
    }

    if (btnSupportLogin) btnSupportLogin.onclick = openSupportModal;
    if (btnSupportSettings) btnSupportSettings.onclick = openSupportModal;

    if (btnCancelSupport) {
        btnCancelSupport.onclick = () => {
            modalSupport.classList.add('hidden');
            document.getElementById('support-desc').value = '';
            document.getElementById('support-type').value = '';
        };
    }

    if (btnSubmitSupport) {
        btnSubmitSupport.onclick = async () => {
            const email = document.getElementById('support-email').value.trim();
            const type = document.getElementById('support-type').value;
            const desc = document.getElementById('support-desc').value.trim();

            if (!email || !type || !desc) {
                return showToast("Veuillez remplir tous les champs.", 'error');
            }

            try {
                btnSubmitSupport.disabled = true;
                btnSubmitSupport.textContent = 'Envoi...';
                await addDoc(collection(db, "support_tickets"), {
                    email: email,
                    type: type,
                    description: desc,
                    status: 'open',
                    createdAt: Date.now(),
                    uid: currentUser ? currentUser.uid : 'unknown'
                });
                showToast("Votre demande a bien été envoyée !", 'success');
                modalSupport.classList.add('hidden');
                document.getElementById('support-desc').value = '';
                document.getElementById('support-type').value = '';
            } catch (e) {
                console.error("Support error", e);
                showToast("Erreur lors de l'envoi du ticket : " + e.message, 'error');
            } finally {
                btnSubmitSupport.disabled = false;
                btnSubmitSupport.textContent = 'Envoyer';
            }
        };
    }

    async function handleManualVerificationRequest(btn) {
        let email = "";
        let uid = "unknown";

        if (currentUser) {
            email = currentUser.email;
            uid = currentUser.uid;
        } else {
            // Try to get email from input
            const emailInput = document.getElementById('email');
            if (emailInput && emailInput.value) {
                email = emailInput.value.trim();
            } else {
                return showToast("Veuillez saisir votre email pour demander de l'aide.", 'info');
            }
        }

        try {
            const originalText = btn.textContent;
            btn.disabled = true;
            btn.textContent = "Demande en cours...";
            
            // Add a timeout of 10 seconds to the request
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error("Délai d'attente dépassé. Vérifiez votre connexion ou les droits Firestore.")), 10000)
            );

            const requestPromise = addDoc(collection(db, "verification_requests"), {
                uid: uid,
                email: email,
                status: 'pending',
                createdAt: Date.now()
            });
            
            await Promise.race([requestPromise, timeoutPromise]);
            
            showToast("Demande de validation manuelle envoyée à l'administrateur !", 'success');
            setTimeout(() => {
                btn.disabled = false;
                btn.textContent = originalText;
            }, 5000);

        } catch (e) {
            console.error("Erreur Manual Verification Request:", e);
            btn.disabled = false;
            btn.textContent = "Problème de validation ? Demander à l'admin";
            showToast("Erreur lors de l'envoi : " + e.message, 'error');
        }
    }

    function listenToVerificationRequests() {
        const settingsList = document.getElementById('admin-requests-list');
        const adminViewList = document.getElementById('admin-view-requests-list');
        const statReqBadge = document.getElementById('admin-stat-requests');
        
        const q = query(collection(db, "verification_requests"), where("status", "==", "pending"));
        onSnapshot(q, (snapshot) => {
            adminRequests = [];
            snapshot.forEach((reqDoc) => {
                adminRequests.push({ id: reqDoc.id, type: 'admin_verify', ...reqDoc.data() });
            });
            
            // Trigger combined notification render
            renderNotifications();

            // Stats in dashboard
            if (statReqBadge) statReqBadge.textContent = adminRequests.length;

            // Populate both lists
            [settingsList, adminViewList].forEach(list => {
                if (!list) return;
                if (adminRequests.length === 0) {
                    list.innerHTML = '<div class="notif-placeholder">Aucune demande en attente</div>';
                    return;
                }
                list.innerHTML = '';
                adminRequests.forEach((req) => {
                    const item = document.createElement('div');
                    item.className = 'admin-v-item';
                    item.innerHTML = `
                        <div style="width: 100%; display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                            <div class="admin-v-info">
                                <span class="admin-v-email" style="font-weight: 600;">${req.email}</span>
                                <span class="admin-v-date" style="font-size: 0.8rem; color: var(--text-muted);">${new Date(req.createdAt).toLocaleDateString()}</span>
                            </div>
                            <div style="display:flex; gap:10px;">
                                <button class="admin-v-btn" style="background:var(--error-color); padding: 5px 10px;" data-action="delete" data-id="${req.id}">X</button>
                                <button class="admin-v-btn" data-action="approve" data-id="${req.id}" data-uid="${req.uid}" data-email="${req.email}">Valider</button>
                            </div>
                        </div>
                    `;
                    item.querySelectorAll('button').forEach(btn => {
                        btn.onclick = async (e) => {
                            const target = e.currentTarget;
                            if (target.dataset.action === 'approve') {
                                approveUserManually(target.dataset.id, target.dataset.uid, target.dataset.email);
                            } else if (target.dataset.action === 'delete') {
                                try {
                                    target.disabled = true;
                                    await deleteDoc(doc(db, "verification_requests", target.dataset.id));
                                    showToast("Demande supprimée", "success");
                                } catch(err) {
                                    console.error(err);
                                    showToast("Erreur (les règles Firestore ne sont pas à jour ?)", "error");
                                    target.disabled = false;
                                }
                            }
                        };
                    });
                    list.appendChild(item);
                });
            });
        });
    }

    async function fetchAdminStats() {
        const userStat = document.getElementById('admin-stat-users');
        const actStat = document.getElementById('admin-stat-activities');

        try {
            // NOTE: For privacy and performance, in production you'd use a Cloud Function
            // to get aggregate counts. Here we do Client-side counts (limited by rules).
            const usersSnap = await getDocs(collection(db, "users"));
            if (userStat) userStat.textContent = usersSnap.size;

            const actsSnap = await getDocs(collection(db, "activities"));
            if (actStat) actStat.textContent = actsSnap.size;
        } catch (e) {
            console.warn("Admin stats restricted by current rules.");
        }
    }

    async function approveUserManually(requestId, userUid, email) {
        console.log("Tentative de validation pour:", email, "UID:", userUid);
        let targetUid = userUid;
        
        try {
            showToast("Validation en cours...", 'info');
            
            // Si l'UID est inconnu, on tente de le trouver par l'email
            if (!targetUid || targetUid === 'unknown' || targetUid === 'undefined') {
                const q = query(collection(db, "users"), where("email", "==", email));
                const userSnap = await getDocs(q);
                if (!userSnap.empty) {
                    targetUid = userSnap.docs[0].id;
                } else {
                    console.warn("Impossible de trouver l'UID pour l'email:", email);
                    return showToast("Profil technique manquant. Demandez à l'utilisateur de recliquer sur 'Demander validation'.", 'error', 8000);
                }
            }

            console.log("Validation en cours pour UID:", targetUid);
            
            // 1. On crée ou met à jour le profil (setDoc crée le doc s'il n'existe pas)
            await setDoc(doc(db, "users", targetUid), { 
                manualVerified: true,
                email: email,
                updatedAt: new Date().toISOString()
            }, { merge: true });

            // 2. On marque la demande comme approuvée
            await updateDoc(doc(db, "verification_requests", requestId), { status: 'approved' });
            
            showToast("Utilisateur validé avec succès !", 'success');
        } catch (e) {
            console.error("Erreur détaillée lors de la validation:", e);
            if (e.code === 'permission-denied') {
                showToast("Permission refusée. Vérifiez que les règles Firestore sont bien publiées.", 'error', 8000);
            } else {
                showToast("Erreur technique. Vérifiez la console (F12).", 'error', 6000);
            }
        }
    }
    function listenToSupportTickets() {
        const supportList = document.getElementById('admin-support-tickets-list');
        if (!supportList) return;

        const q = query(collection(db, "support_tickets"), where("status", "==", "open"));
        onSnapshot(q, (snapshot) => {
            if (snapshot.empty) {
                supportList.innerHTML = '<div class="notif-placeholder">Aucun ticket de support en attente.</div>';
                return;
            }

            supportList.innerHTML = '';
            snapshot.forEach((docSnap) => {
                const t = docSnap.data();
                const item = document.createElement('div');
                item.className = 'admin-v-item';
                item.style.flexDirection = 'column';
                item.style.alignItems = 'flex-start';
                item.style.padding = '15px';
                
                let typeLabel = "Autre";
                if(t.type === 'connexion') typeLabel = "Connexion";
                if(t.type === 'bug') typeLabel = "Bug";

                item.innerHTML = `
                    <div style="width: 100%; display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <div class="admin-v-info">
                            <span class="admin-v-email" style="font-weight: 600;">${t.email}</span>
                            <span class="admin-v-date" style="color: var(--primary-color); font-size: 0.8rem; font-weight: bold; background: rgba(86,171,47,0.1); padding: 2px 6px; border-radius: 4px;">${typeLabel}</span>
                        </div>
                        <button class="admin-v-btn btn-resolve" data-id="${docSnap.id}">Résoudre</button>
                    </div>
                    <div style="font-size: 0.9rem; color: var(--text-muted); background: rgba(0,0,0,0.02); padding: 10px; border-radius: 8px; width: 100%;">${t.description}</div>
                `;
                
                item.querySelector('.btn-resolve').onclick = async (e) => {
                    try {
                        e.target.disabled = true;
                        e.target.textContent = "Résolution...";
                        await updateDoc(doc(db, "support_tickets", docSnap.id), { status: 'resolved' });
                        showToast("Ticket marqué comme résolu.", 'success');
                    } catch (err) {
                        showToast("Erreur lors de la résolution.", 'error');
                        e.target.disabled = false;
                        e.target.textContent = "Résoudre";
                    }
                };

                supportList.appendChild(item);
            });
        });
    }

    logoutBtn.addEventListener('click', () => signOut(auth));

    // --- App Logic ---
    let calendar = null;
    let participants = [];
    let doughnutChart = null;
    let barChart = null;

    function initApp() {
        updateDate();
        setupNavigation();
        listenToActivities();
        listenToParticipants();
        listenToNotifications();
        loadUserSettings();
        setupViewInteractions();
    }

    function updateDate() {
        const options = { weekday: 'long', day: 'numeric', month: 'long' };
        const today = new Date().toLocaleDateString('fr-FR', options);
        currentDateElem.textContent = today.charAt(0).toUpperCase() + today.slice(1);
    }

    function setupNavigation() {
        const navItems = document.querySelectorAll('.nav-item, .mobile-nav-item');
        const views = document.querySelectorAll('.app-view');

        navItems.forEach(item => {
            item.addEventListener('click', () => {
                const viewName = item.dataset.view;
                const targetViewId = `view-${viewName}`;
                
                // Update Nav UI
                navItems.forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                
                playSound('click');

                // Switch View
                views.forEach(v => v.classList.remove('active'));
                const targetView = document.getElementById(targetViewId);
                if (targetView) targetView.classList.add('active');

                // Close sidebar on mobile
                const sidebar = document.querySelector('.sidebar');
                if (sidebar) sidebar.classList.remove('mobile-open');

                // Module Transitions
                if (viewName === 'calendar') renderCalendar();
                if (viewName === 'stats') renderStats();
                
                // Close notifications when switching views
                const notifPanel = document.getElementById('notification-panel');
                if (notifPanel) notifPanel.classList.add('hidden');

                // Render QR code if entering settings
                if (viewName === 'settings') {
                    renderAppSettingsQR();
                }
            });
        });
    }

    function setupViewInteractions() {
        // Mobile Sidebar Toggle
        const btnMenu = document.getElementById('btn-mobile-menu');
        const sidebar = document.querySelector('.sidebar');
        if (btnMenu && sidebar) {
            btnMenu.addEventListener('click', (e) => {
                e.stopPropagation();
                sidebar.classList.toggle('mobile-open');
            });
            document.addEventListener('click', (e) => {
                if (!sidebar.contains(e.target) && !btnMenu.contains(e.target)) {
                    sidebar.classList.remove('mobile-open');
                }
            });
        }

        // Mobile Search Toggle
        const btnMobileSearch = document.getElementById('btn-mobile-search');
        const searchPanel = document.getElementById('mobile-search-panel');
        const searchInput = document.getElementById('mobile-search-input');
        const btnCloseSearch = document.getElementById('btn-close-search');

        if (btnMobileSearch && searchPanel) {
            btnMobileSearch.addEventListener('click', () => {
                searchPanel.style.display = 'flex';
                searchPanel.classList.remove('hidden');
                searchInput.focus();
            });
            
            btnCloseSearch.addEventListener('click', () => {
                searchPanel.style.display = 'none';
                searchInput.value = '';
                // Clear search on both when closing or just let it be? Decoupled usually means independent.
                // Resetting both for a "clean" close
                homeFilters.searchQuery = '';
                managementFilters.searchQuery = '';
                window.updateDataViewsGlobal();
            });

            searchInput.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase();
                // Find which view is active to apply search only there
                const activeView = document.querySelector('.app-view.active');
                if (activeView && activeView.id === 'view-home') {
                    homeFilters.searchQuery = query;
                    renderRoulette();
                } else if (activeView && activeView.id === 'view-management') {
                    managementFilters.searchQuery = query;
                    renderActivities();
                } else {
                    // Fallback: update both
                    homeFilters.searchQuery = query;
                    managementFilters.searchQuery = query;
                    window.updateDataViewsGlobal();
                }
            });
        }

        // Management Tabs
        const tabLinks = document.querySelectorAll('.tab-link');
        const lists = document.querySelectorAll('.activity-cards-list');
        
        tabLinks.forEach(link => {
            link.addEventListener('click', () => {
                tabLinks.forEach(l => l.classList.remove('active'));
                lists.forEach(l => l.classList.remove('active'));
                
                link.classList.add('active');
                const targetList = document.getElementById(`pro-list-${link.dataset.tab}`);
                if (targetList) targetList.classList.add('active');
            });
        });

        // Notification Toggles
        const notifTriggers = document.querySelectorAll('.notification-trigger');
        const notifPanel = document.getElementById('notification-panel');
        
        notifTriggers.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                notifPanel.classList.toggle('hidden');
            });
        });

        document.addEventListener('click', (e) => {
            if (notifPanel && !notifPanel.contains(e.target) && !e.target.closest('.notification-trigger')) {
                notifPanel.classList.add('hidden');
            }
        });

        const btnClear = document.getElementById('btn-clear-notifs');
        const btnSaveProfile = document.getElementById('btn-save-profile');
        const inputDN = document.getElementById('settings-display-name');
        const toggleRequests = document.getElementById('setting-allow-requests');
        const toggleLight = document.getElementById('setting-light-mode');
        const selectLang = document.getElementById('setting-language');
        const toggleSounds = document.getElementById('setting-sounds');

        if (btnSaveProfile) {
            btnSaveProfile.onclick = async () => {
                const newName = inputDN.value.trim();
                if (newName) {
                    await updateProfile(currentUser, { displayName: newName });
                    await saveSetting('displayName', newName); // Sync to Firestore
                    displayNameElem.textContent = newName;
                    if (document.getElementById('display-name-mobile')) {
                        document.getElementById('display-name-mobile').textContent = newName;
                    }
                    showToast("Profil mis à jour !", 'success');
                }
            };
        }

        if (toggleRequests) {
            toggleRequests.onchange = (e) => saveSetting('allowRequests', e.target.checked);
        }

        if (toggleLight) {
            toggleLight.onchange = (e) => {
                const isLight = e.target.checked;
                document.body.classList.toggle('light-theme', isLight);
                saveSetting('lightMode', isLight);
                playSound('click');
            };
        }

        if (selectLang) {
            selectLang.onchange = (e) => {
                const lang = e.target.value;
                applyLanguage(lang);
                saveSetting('language', lang);
                playSound('click');
            };
        }

        if (toggleSounds) {
            toggleSounds.onchange = (e) => {
                userSettings.soundEnabled = e.target.checked;
                saveSetting('soundEnabled', e.target.checked);
                if (e.target.checked) playSound('click');
            };
        }

        const btnDownloadQR = document.getElementById('btn-download-qr');
        if (btnDownloadQR) {
            btnDownloadQR.onclick = () => downloadAppSettingsQR();
        }



        // Expose both states globally for debugging/search sync
        window.appState = { homeFilters, managementFilters };

        const updateDataViews = () => {
            renderActivities();
            renderRoulette();
        };
        window.updateDataViewsGlobal = () => {
            // Updated global update: detect active view or just sync both
            renderActivities();
            renderRoulette();
        };

        const syncVisualToggles = (containerSelector, filters) => {
            const container = document.querySelector(containerSelector);
            if (!container) return;

            // Sync Themes
            container.querySelectorAll('[data-filter-type="themes"] .toggle-btn').forEach(b => {
                if (filters.themes.has(b.dataset.theme)) b.classList.add('active');
                else b.classList.remove('active');
            });
            // Sync Types
            container.querySelectorAll('[data-filter-type="types"] .toggle-btn').forEach(b => {
                if (filters.types.has(b.dataset.type)) b.classList.add('active');
                else b.classList.remove('active');
            });
            // Sync Ratings
            container.querySelectorAll('[data-filter-type="rating"] .toggle-btn').forEach(b => {
                if (filters.minRating === parseInt(b.dataset.rating)) b.classList.add('active');
                else b.classList.remove('active');
            });
            // Sync Prices
            container.querySelectorAll('[data-filter-type="price"] .toggle-btn').forEach(b => {
                if (filters.maxPrice === parseInt(b.dataset.price)) b.classList.add('active');
                else b.classList.remove('active');
            });
        };

        function bindFilterGroup(containerSelector, filters, onUpdate) {
            const container = document.querySelector(containerSelector);
            if (!container) return;

            // Themes
            container.querySelectorAll('[data-filter-type="themes"] .toggle-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    if (filters.themes.has(btn.dataset.theme)) filters.themes.delete(btn.dataset.theme);
                    else filters.themes.add(btn.dataset.theme);
                    syncVisualToggles(containerSelector, filters);
                    onUpdate();
                });
            });

            // Types
            container.querySelectorAll('[data-filter-type="types"] .toggle-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    if (filters.types.has(btn.dataset.type)) filters.types.delete(btn.dataset.type);
                    else filters.types.add(btn.dataset.type);
                    syncVisualToggles(containerSelector, filters);
                    onUpdate();
                });
            });

            // Ratings
            container.querySelectorAll('[data-filter-type="rating"] .toggle-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const rating = parseInt(btn.dataset.rating);
                    filters.minRating = (filters.minRating === rating) ? 0 : rating;
                    syncVisualToggles(containerSelector, filters);
                    onUpdate();
                });
            });

            // Price
            container.querySelectorAll('[data-filter-type="price"] .toggle-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const price = parseInt(btn.dataset.price);
                    filters.maxPrice = (filters.maxPrice === price) ? 4 : price;
                    syncVisualToggles(containerSelector, filters);
                    onUpdate();
                });
            });
        }

        // Bind decoupled filters
        bindFilterGroup('#view-home', homeFilters, renderRoulette);
        bindFilterGroup('#view-management', managementFilters, renderActivities);

        // Add Activity
        const btnAddPro = document.getElementById('btn-add-pro');
        const inputPro = document.getElementById('pro-activity-input');
        const themeSelect = document.getElementById('pro-activity-theme');
        const addRating = document.getElementById('add-rating');
        const typeCheckboxes = document.querySelectorAll('.add-type-chk');

        btnAddPro.addEventListener('click', async () => {
            const title = inputPro.value.trim();
            const theme = themeSelect.value;
            const rating = parseInt(addRating.value);
            
            const types = [];
            typeCheckboxes.forEach(chk => { if (chk.checked) types.push(chk.value); });

            if (!title || !currentUser) return;
            if (!theme) return showToast("Veuillez sélectionner un thème.", 'error');
            if (types.length === 0) return showToast("Veuillez sélectionner au moins un type (seul, couple, etc).", 'error');

            try {
                btnAddPro.disabled = true;
                const newActivity = {
                    title,
                    theme,
                    types,
                    rating,
                    userId: currentUser.uid,
                    status: 'available',
                    date: new Date().toISOString().split('T')[0],
                    time: "10:00",
                    duration: "2h",
                    createdAt: Date.now()
                };
                await addDoc(collection(db, "activities"), newActivity);
                inputPro.value = '';
                themeSelect.value = '';
                addRating.value = '3';
                showToast("Activité ajoutée !", 'success');
            } catch (error) {
                showToast("Erreur lors de l'ajout", 'error');
            } finally {
                btnAddPro.disabled = false;
            }
        });

        // Set up Default List Import
        const btnImport = document.getElementById('btn-import-defaults');
        if (btnImport) {
            btnImport.addEventListener('click', async () => {
                if (!currentUser) return;
                const confirmImport = confirm("Voulez-vous importer la liste d'activités complète ? Cela ajoutera plus de 250 activités répertoriées ! 🎉");
                if (!confirmImport) return;

                btnImport.disabled = true;
                btnImport.textContent = "Importation en cours (patientez)...";

                try {
                    const response = await fetch('./data/activities.json');
                    const defaultData = await response.json();
                    
                    // Batch write logic
                    let batch = writeBatch(db);
                    let counter = 0;
                    
                    for (const item of defaultData) {
                        const newRef = doc(collection(db, "activities"));
                        batch.set(newRef, {
                            ...item,
                            userId: currentUser.uid,
                            status: 'available',
                            date: new Date().toISOString().split('T')[0],
                            duration: "1h-2h",
                            createdAt: Date.now()
                        });
                        counter++;
                        
                        // Firestore batches max 500 operations
                        if (counter % 400 === 0) {
                            await batch.commit();
                            batch = writeBatch(db);
                        }
                    }
                    if (counter % 400 !== 0) await batch.commit();
                    showToast(counter + " activités importées avec succès !", 'success');

                } catch(e) {
                    console.error("Erreur durant l'import", e);
                    showToast("Erreur durant l'import.", 'error');
                } finally {
                    btnImport.textContent = "Importer la liste par défaut";
                    btnImport.disabled = false;
                }
            });
        }

        // Participants UI
        const btnAddP = document.getElementById('btn-add-participant');
        const pInput = document.getElementById('participant-name');
        const pEmail = document.getElementById('participant-email');
        const pRelation = document.getElementById('participant-relation');
        
        btnAddP.addEventListener('click', async () => {
            const name = pInput.value.trim();
            const email = pEmail.value.trim();
            const relation = pRelation.value;
            
            if(!name || !currentUser) return;
            
            try {
                btnAddP.disabled = true;
                // 1. Create the participant locally/silently
                const pRef = await addDoc(collection(db, "participants"), {
                    name,
                    email: email || null,
                    relation: relation || "Membre",
                    userId: currentUser.uid,
                    status: email ? 'pending_link' : 'local',
                    joinedAt: Date.now()
                });

                // 2. If email, send a notification
                if (email) {
                    await addDoc(collection(db, "notifications"), {
                        type: 'link_request',
                        fromUid: currentUser.uid,
                        fromName: currentUser.displayName || currentUser.email,
                        fromEmail: currentUser.email, // Ajout crucial ici
                        toEmail: email,
                        relation: relation || "Membre",
                        participantId: pRef.id,
                        status: 'pending',
                        createdAt: Date.now()
                    });
                    showToast("Demande de lien envoyée ! Le membre apparaîtra comme 'En attente' jusqu'à son acceptation.", 'success');
                }

                pInput.value = '';
                pEmail.value = '';
                pRelation.value = '';
            } catch (err) {
                showToast("Erreur lors de l'ajout.", 'error');
            } finally {
                btnAddP.disabled = false;
            }
        });

        // Edit Participant Modal Handlers
        let currentEditingParticipant = null;
        const modalEditP = document.getElementById('modal-edit-participant');
        const editPName = document.getElementById('edit-p-name');
        const editPEmail = document.getElementById('edit-p-email');
        const editPRelation = document.getElementById('edit-p-relation');
        const btnSaveEditP = document.getElementById('btn-save-edit-p');
        const btnCancelEditP = document.getElementById('btn-cancel-edit-p');

        const openEditParticipantModal = (p) => {
            currentEditingParticipant = p;
            editPName.value = p.name || "";
            editPEmail.value = p.email || "";
            editPRelation.value = p.relation || "";
            modalEditP.classList.remove('hidden');
        };

        const closeEditParticipantModal = () => {
            currentEditingParticipant = null;
            modalEditP.classList.add('hidden');
        };

        if (btnCancelEditP) btnCancelEditP.onclick = closeEditParticipantModal;

        if (btnSaveEditP) {
            btnSaveEditP.onclick = async () => {
                if (!currentEditingParticipant || !currentUser) return;
                const newName = editPName.value.trim();
                const newEmail = editPEmail.value.trim();
                const newRelation = editPRelation.value;

                if (!newName) return showToast("Le nom est obligatoire.", 'error');

                try {
                    btnSaveEditP.disabled = true;
                    const updates = {
                        name: newName,
                        email: newEmail || null,
                        relation: newRelation || "Membre"
                    };

                    // If email changed and was linked, reset status to pending or local
                    if (newEmail !== currentEditingParticipant.email) {
                        updates.status = newEmail ? 'pending_link' : 'local';
                        if (newEmail) {
                            // Optionally send a new notification if email changed
                            await addDoc(collection(db, "notifications"), {
                                type: 'link_request',
                                fromUid: currentUser.uid,
                                fromName: currentUser.displayName || currentUser.email,
                                toEmail: newEmail,
                                relation: newRelation || "Membre",
                                participantId: currentEditingParticipant.id,
                                status: 'pending',
                                createdAt: Date.now()
                            });
                        }
                    }

                    await updateDoc(doc(db, "participants", currentEditingParticipant.id), updates);
                    closeEditParticipantModal();
                    playSound('success');
                } catch (err) {
                    console.error(err);
                    showToast("Erreur lors de la mise à jour.");
                } finally {
                    btnSaveEditP.disabled = false;
                }
            };
        }

        window.openEditParticipantModal = openEditParticipantModal;

        // Roulette Logic
        const btnSpin = document.getElementById('btn-spin');
        const wheelContainer = document.getElementById('roulette-container');
        const winnerOverlay = document.getElementById('winner-overlay');
        const winnerTitle = document.getElementById('winner-title');
        const btnCloseWinner = document.getElementById('btn-close-winner');
        let currentRotation = 0;
        let currentWinnerActivity = null;
        let currentWinnerRating = null;

        window.appState = { homeFilters, managementFilters }; // Expose state if needed

        const winnerStars = document.querySelectorAll('#winner-stars i');
        winnerStars.forEach(star => {
            star.addEventListener('mouseover', function() {
                const val = parseInt(this.dataset.val);
                winnerStars.forEach(s => {
                    if (parseInt(s.dataset.val) <= val) s.style.color = '#ffd700';
                    else s.style.color = 'rgba(255, 255, 255, 0.3)';
                });
            });
            star.addEventListener('mouseout', function() {
                winnerStars.forEach(s => {
                    if (currentWinnerRating && parseInt(s.dataset.val) <= currentWinnerRating) {
                        s.style.color = '#ffd700';
                    } else {
                        s.style.color = 'rgba(255, 255, 255, 0.3)';
                    }
                });
            });
            star.addEventListener('click', function() {
                currentWinnerRating = parseInt(this.dataset.val);
                winnerStars.forEach(s => {
                    if (parseInt(s.dataset.val) <= currentWinnerRating) {
                        s.classList.add('active');
                        s.style.color = '#ffd700';
                    } else {
                        s.classList.remove('active');
                        s.style.color = 'rgba(255, 255, 255, 0.3)';
                    }
                });
            });
        });

        const handleSurpriseSpin = (triggerBtn) => {
            // Check if we have enough activities first
            const basePool = activities.filter(a => a.status === 'available');
            const pool = getFilteredActivities(basePool, homeFilters);
            if (pool.length < 2) return showToast("Ajoutez au moins 2 activités pour faire tourner la roue !", 'error');

            // Open preparation modal instead of spinning
            if (modalSpinPrep) {
                modalSpinPrep.classList.remove('hidden');
                renderSpinParticipantSelection();
            }
        };

        function renderSpinParticipantSelection() {
            if (!spinPListCheck) return;
            spinPListCheck.innerHTML = '';
            
            if (participants.length === 0) {
                spinPListCheck.innerHTML = '<p style="font-size:0.8rem; opacity:0.6;">Aucun membre créé dans Profil.</p>';
            }

            participants.forEach(p => {
                const item = document.createElement('label');
                item.style.display = 'flex';
                item.style.alignItems = 'center';
                item.style.gap = '10px';
                item.style.cursor = 'pointer';
                item.style.padding = '5px';
                item.style.background = 'rgba(255,255,255,0.05)';
                item.style.borderRadius = '8px';

                item.innerHTML = `
                    <input type="checkbox" class="spin-member-chk" value="${p.id}" data-name="${p.name}">
                    <span style="font-size:0.9rem;">${p.name} <small style="opacity:0.6">(${p.relation || 'Membre'})</small></span>
                `;
                spinPListCheck.appendChild(item);
            });
        }

        // Prep Modal Listeners
        if (prepTypeBtns) {
            prepTypeBtns.forEach(btn => {
                btn.onclick = () => {
                    prepTypeBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    selectedSpinType = btn.dataset.type;
                    
                    if (selectedSpinType === 'seul') {
                        spinPSelection.classList.add('hidden');
                    } else {
                        spinPSelection.classList.remove('hidden');
                    }
                    playSound('click');
                };
            });
        }

        if (btnCancelSpin) {
            btnCancelSpin.onclick = () => {
                modalSpinPrep.classList.add('hidden');
            };
        }

        if (btnConfirmSpin) {
            btnConfirmSpin.onclick = () => {
                const selectedMembers = [];
                if (selectedSpinType !== 'seul') {
                    document.querySelectorAll('.spin-member-chk:checked').forEach(chk => {
                        selectedMembers.push(chk.dataset.name);
                    });
                    
                    if (selectedSpinType === 'couple' && selectedMembers.length < 1) {
                        return showToast("Veuillez sélectionner au moins 1 partenaire.", 'info');
                    }
                    if (selectedSpinType === 'famille' && selectedMembers.length < 1) {
                        return showToast("Veuillez sélectionner les membres participants.", 'info');
                    }
                }

                modalSpinPrep.classList.add('hidden');
                startFinalSpin(btnSpin, selectedSpinType, selectedMembers);
            };
        }

        const startFinalSpin = async (triggerBtn, type, members) => {
            const basePool = activities.filter(a => a.status === 'available');
            const pool = getFilteredActivities(basePool, homeFilters);
            
            triggerBtn.disabled = true;
            playSound('success');
            
            const randomIndex = Math.floor(Math.random() * pool.length);
            const picked = pool[randomIndex];
            currentWinnerActivity = picked;
            
            if (wheelContainer) {
                const segmentAngle = 360 / pool.length;
                const targetAngle = (360 - (randomIndex * segmentAngle)) - (segmentAngle / 2);
                const extraSpins = 5 * 360; 
                currentRotation += extraSpins + (targetAngle - (currentRotation % 360));
                wheelContainer.style.transform = `rotate(${currentRotation}deg)`;

                setTimeout(() => {
                    winnerTitle.textContent = picked.title;
                    
                    // Optionnel: On pourrait afficher qui participe dans le titre ou sous-titre
                    let participantsText = "Activité pour : " + (type === 'seul' ? "Moi seul" : (type === 'couple' ? "Nous deux" : "Toute la famille"));
                    if (members.length > 0) participantsText += " (" + members.join(', ') + ")";
                    
                    const subText = document.createElement('p');
                    subText.id = "winner-participants-info";
                    subText.style.fontSize = "0.9rem";
                    subText.style.opacity = "0.7";
                    subText.style.marginTop = "5px";
                    subText.textContent = participantsText;
                    
                    const existingInfo = document.getElementById('winner-participants-info');
                    if (existingInfo) existingInfo.remove();
                    winnerTitle.after(subText);
                    
                    currentWinnerRating = picked.rating || null;
                    winnerStars.forEach(s => {
                        s.classList.remove('active');
                        s.style.color = 'rgba(255, 255, 255, 0.3)';
                        if (currentWinnerRating && parseInt(s.dataset.val) <= currentWinnerRating) {
                            s.classList.add('active');
                            s.style.color = '#ffd700';
                        }
                    });

                    winnerOverlay.classList.remove('hidden');
                }, 5500);
            }
        };

        if (btnSpin) btnSpin.addEventListener('click', () => handleSurpriseSpin(btnSpin));

        if (btnCloseWinner) {
            btnCloseWinner.addEventListener('click', async () => {
                if (btnCloseWinner.disabled) return;
                btnCloseWinner.disabled = true;
                if (currentWinnerActivity) {
                    await updateDoc(doc(db, "activities", currentWinnerActivity.id), { 
                        status: 'done',
                        rating: currentWinnerRating || currentWinnerActivity.rating || 0
                    });
                }
                winnerOverlay.classList.add('hidden');
                if (btnSpin) btnSpin.disabled = false;
                btnCloseWinner.disabled = false;
            });
        }
    }

    // --- Modules Realization ---

    function listenToActivities() {
        if (!currentUser) return;
        
        // Remove 'where userId == currentUser.uid' to make activities globally shared
        const q = query(collection(db, "activities"));
        
        onSnapshot(q, (snapshot) => {
            activities = [];
            snapshot.forEach((doc) => {
                activities.push({ id: doc.id, ...doc.data() });
            });
            renderActivities();
            renderRoulette();
            renderActivityChips();
            if (calendar) renderCalendar(); // Refresh calendar if active
        });
    }

    function listenToParticipants() {
        if (!currentUser) return;
        const q = query(collection(db, "participants"), where("userId", "==", currentUser.uid));
        onSnapshot(q, (snapshot) => {
            participants = [];
            snapshot.forEach((doc) => {
                participants.push({ id: doc.id, ...doc.data() });
            });
            renderParticipants();
        });
    }

    function renderCalendar() {
        const calEl = document.getElementById('calendar-container');
        if (!calendar) {
            calendar = new FullCalendar.Calendar(calEl, {
                initialView: 'dayGridMonth',
                locale: 'fr',
                headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek' },
                events: []
            });
            calendar.render();
        }

        // Map activities to events
        const events = activities.map(a => ({
            title: a.title,
            start: a.date,
            color: a.status === 'done' ? '#94a3b8' : '#56ab2f'
        }));
        
        calendar.removeAllEvents();
        calendar.addEventSource(events);
    }

    let notifications = [];
    let adminRequests = [];

    function listenToNotifications() {
        if (!currentUser || !currentUser.email) return;
        
        const q = query(
            collection(db, "notifications"), 
            where("toEmail", "==", currentUser.email)
        );

        onSnapshot(q, (snapshot) => {
            if (userSettings && userSettings.allowRequests === false) {
                notifications = [];
                renderNotifications();
                return;
            }
            
            notifications = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                // Filter locally because Firestore doesn't support complex OR filters easily here without extra setup
                if (data.status === 'pending' || data.type === 'link_accepted') {
                    notifications.push({ id: doc.id, ...data });
                }
            });
            renderNotifications();
        });
    }

    async function loadUserSettings() {
        if (!currentUser) return;
        try {
            const userDoc = await getDoc(doc(db, "users", currentUser.uid));
            if (userDoc.exists()) {
                const data = userDoc.data();
                userSettings = { ...userSettings, ...data };
                
                // Apply UI
                if (document.getElementById('settings-display-name')) {
                    document.getElementById('settings-display-name').value = currentUser.displayName || "";
                }
                if (document.getElementById('setting-allow-requests')) {
                    document.getElementById('setting-allow-requests').checked = userSettings.allowRequests;
                }
                if (document.getElementById('setting-light-mode')) {
                    document.getElementById('setting-light-mode').checked = userSettings.lightMode;
                    document.body.classList.toggle('light-theme', userSettings.lightMode);
                }
                if (document.getElementById('setting-language')) {
                    document.getElementById('setting-language').value = userSettings.language || 'fr';
                    applyLanguage(userSettings.language || 'fr');
                }
                if (document.getElementById('setting-sounds')) {
                    document.getElementById('setting-sounds').checked = userSettings.soundEnabled;
                }
            } else {
                // Initialize default doc
                await setDoc(doc(db, "users", currentUser.uid), {
                    displayName: currentUser.displayName || "",
                    allowRequests: true,
                    lightMode: false,
                    soundEnabled: true,
                    language: 'fr',
                    createdAt: Date.now()
                });
            }
        } catch (e) {
            console.error("Error loading settings:", e);
        }
    }

    async function saveSetting(key, value) {
        if (!currentUser) return;
        userSettings[key] = value;
        try {
            await updateDoc(doc(db, "users", currentUser.uid), { [key]: value });
        } catch (e) {
            console.error("Error saving setting:", e);
        }
    }

    function renderNotifications() {
        const list = document.getElementById('notif-list');
        const badges = document.querySelectorAll('.notif-badge');
        if (!list) return;

        // Combine standard notifications and admin requests
        const combined = [...notifications, ...adminRequests].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        // Update badges
        const count = combined.length;
        badges.forEach(b => {
            b.textContent = count;
            b.classList.toggle('hidden', count === 0);
        });

        if (count === 0) {
            list.innerHTML = '<div class="notif-placeholder">Pas de nouvelles demandes</div>';
            return;
        }

        list.innerHTML = '';
        combined.forEach(n => {
            const item = document.createElement('div');
            item.className = `notif-item ${n.type === 'link_accepted' ? 'success' : ''} ${n.type === 'admin_verify' ? 'admin' : ''}`;
            
            if (n.type === 'link_accepted') {
                item.innerHTML = `
                    <div class="notif-text">
                        <i class='bx bxs-check-circle' style='color:#a8e063'></i>
                        <strong>${n.fromName}</strong> a accepté votre demande de lien familial !
                    </div>
                    <div class="notif-actions">
                        <button class="mini-btn accept">OK</button>
                    </div>
                `;
                item.querySelector('.accept').onclick = async () => {
                    await deleteDoc(doc(db, "notifications", n.id));
                };
            } else if (n.type === 'admin_verify') {
                item.innerHTML = `
                    <div class="notif-text" style="border-left: 3px solid #60a5fa; padding-left: 10px; width:100%;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="font-size: 0.7rem; text-transform: uppercase; color: #60a5fa; font-weight: 700;">Validation manuelle</span>
                            <button class="mini-btn decline-req" style="background:transparent; color:var(--error-color); padding:0; min-width:auto; font-weight:bold;">X</button>
                        </div>
                        <strong>${n.email}</strong> demande d'être validé.
                    </div>
                    <div class="notif-actions">
                        <button class="mini-btn accept" style="background:#60a5fa; width:100%;">Valider</button>
                    </div>
                `;
                item.querySelector('.accept').onclick = () => approveUserManually(n.id, n.uid, n.email);
                item.querySelector('.decline-req').onclick = async (e) => {
                    try {
                        e.currentTarget.disabled = true;
                        await deleteDoc(doc(db, "verification_requests", n.id));
                    } catch(err) {
                        showToast("Erreur de suppression.", "error");
                    }
                };
            } else {
                item.innerHTML = `
                    <div class="notif-text">
                        <strong>${n.fromName}</strong> souhaite vous lier en tant que <strong>${n.relation}</strong>.
                    </div>
                    <div class="notif-actions">
                        <button class="mini-btn accept">Accepter</button>
                        <button class="mini-btn decline">Refuser</button>
                    </div>
                `;
                item.querySelector('.accept').onclick = () => respondToRequest(n, 'accepted');
                item.querySelector('.decline').onclick = () => respondToRequest(n, 'declined');
            }
            
            list.appendChild(item);
        });
    }

    async function respondToRequest(notif, response) {
        try {
            // 1. Update/Delete notification status
            if (response === 'declined') {
                await deleteDoc(doc(db, "notifications", notif.id));
            } else {
                await updateDoc(doc(db, "notifications", notif.id), { status: response });
            }

            if (response === 'accepted') {
                // 2. Update the sender's participant document
                await updateDoc(doc(db, "participants", notif.participantId), { 
                    status: 'linked',
                    linkedUid: currentUser.uid 
                });
                
                // 3. RECIPROCITY: Create a participant entry for the receiver too!
                // So both people see each other in their lists automatically.
                await addDoc(collection(db, "participants"), {
                    name: notif.fromName || "Membre Famille",
                    email: notif.fromEmail || null,
                    relation: notif.relation || "Membre", // We use the same relation as a base
                    userId: currentUser.uid,
                    status: 'linked',
                    linkedUid: notif.fromUid,
                    joinedAt: Date.now()
                });

                // 4. Notify the sender of success
                const senderEmail = notif.fromEmail;
                if (senderEmail) {
                    await addDoc(collection(db, "notifications"), {
                        type: 'link_accepted',
                        fromUid: currentUser.uid,
                        fromName: currentUser.displayName || currentUser.email,
                        toEmail: senderEmail,
                        status: 'acknowledged',
                        createdAt: Date.now()
                    });
                }
                
                showToast("Lien familial accepté et créé dans les deux listes !", 'success');
            }
        } catch (e) {
            console.error("Error responding to request:", e);
            showToast("Erreur lors de la réponse.", 'error');
        }
    }

    function renderParticipants() {
        const list = document.getElementById('participants-list');
        if (!list) return;
        list.innerHTML = '';
        participants.forEach(p => {
            const card = document.createElement('div');
            card.className = 'participant-card glass';
            
            const isPending = p.status === 'pending_link';
            const isLinked = p.status === 'linked';
            
            const statusBadge = isPending 
                ? '<div class="p-status-badge p-status-pending">En attente</div>' 
                : (isLinked ? '<div class="p-status-badge p-status-linked">Lié</div>' : '');

            const emailBadge = p.email ? `<div class="p-email" title="${p.email}"><i class='bx bx-link'></i></div>` : '';
            
            card.innerHTML = `
                <div class="p-avatar-box">
                    <div class="p-avatar">${p.name.charAt(0)}</div>
                    ${emailBadge}
                </div>
                <div class="p-info">
                    <div class="p-name">${p.name}</div>
                    <div class="p-relation-badge">${p.relation || 'Membre'}</div>
                    ${statusBadge}
                </div>
                <div class="participant-actions">
                    <button class="action-btn-pro edit-btn" title="Modifier">
                        <i class='bx bx-edit-alt'></i>
                    </button>
                    <button class="action-btn-pro delete-btn" title="Supprimer">
                        <i class='bx bx-trash'></i>
                    </button>
                </div>
            `;
            
            card.querySelector('.edit-btn').onclick = () => window.openEditParticipantModal(p);
            card.querySelector('.delete-btn').onclick = () => {
                if(confirm(`Supprimer ${p.name} ?`)) {
                    deleteDoc(doc(db, "participants", p.id));
                }
            };
            list.appendChild(card);
        });
    }

    function renderStats() {
        const doneCount = activities.filter(a => a.status === 'done').length;
        const availCount = activities.filter(a => a.status === 'available').length;

        // Doughnut Chart
        const ctxD = document.getElementById('chart-doughnut').getContext('2d');
        if (doughnutChart) doughnutChart.destroy();
        doughnutChart = new Chart(ctxD, {
            type: 'doughnut',
            data: {
                labels: ['Faites', 'Disponibles'],
                datasets: [{
                    data: [doneCount, availCount],
                    backgroundColor: ['#56ab2f', 'rgba(255,255,255,0.1)'],
                    borderWidth: 0
                }]
            },
            options: { plugins: { legend: { labels: { color: '#fff' } } } }
        });

        // Bar Chart (Activity by day of week)
        const days = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
        const activityCounts = [0,0,0,0,0,0,0];
        activities.forEach(a => {
            const day = new Date(a.date).getDay();
            const index = day === 0 ? 6 : day - 1; // Map Sun to index 6
            activityCounts[index]++;
        });

        const ctxB = document.getElementById('chart-bar').getContext('2d');
        if (barChart) barChart.destroy();
        barChart = new Chart(ctxB, {
            type: 'bar',
            data: {
                labels: days,
                datasets: [{
                    label: 'Activités',
                    data: activityCounts,
                    backgroundColor: '#a8e063'
                }]
            },
            options: { scales: { y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#94a3b8' } }, x: { ticks: { color: '#94a3b8' } } } }
        });
    }

    // Filter engine function
    function getFilteredActivities(listToFilter, filters) {
        // Fallback if filters not provided
        if (!filters) filters = { themes: new Set(), types: new Set(), minRating: 0, maxPrice: 4, searchQuery: "" };
        return listToFilter.filter(a => {
            if (filters.themes.size > 0) {
                if (!a.theme) return false;
                // Handle Balades to Marseille mapping if needed or just use includes
                // Check if ANY of the selected themes is included in the activity's theme string
                const themeMatch = [...filters.themes].some(t => {
                    const searchStr = t === 'Balades' ? 'Marseille' : t;
                    return a.theme.includes(searchStr) || a.theme.includes(t);
                });
                if (!themeMatch) return false;
            }
            
            if (filters.types.size > 0) {
                if (!a.types || !Array.isArray(a.types)) return false;
                const match = [...filters.types].some(t => a.types.includes(t));
                if (!match) return false;
            }
            
            if (filters.minRating > 0 && (!a.rating || a.rating < filters.minRating)) return false;
            
            if (filters.maxPrice < 4) {
                // If maxPrice is specified, activity must have a price_level <= maxPrice
                const pLevel = a.price_level || 1; 
                if (pLevel > filters.maxPrice) return false;
            }
            
            if (filters.searchQuery) {
                if (!a.title || !a.title.toLowerCase().includes(filters.searchQuery)) return false;
            }
            
            return true;
        });
    }

    // --- Core View Renders ---
    function renderActivities() {
        const listAvailable = document.getElementById('pro-list-available');
        const listDone = document.getElementById('pro-list-done');
        const countAv = document.getElementById('count-available');
        const countDone = document.getElementById('count-done');
        if(!listAvailable || !listDone) return;
        
        listAvailable.innerHTML = '';
        listDone.innerHTML = '';

        // Apply filters!
        const filtered = getFilteredActivities(activities, managementFilters);

        let avCount = 0, dCount = 0;

        filtered.forEach(activity => {
            const card = createActivityCard(activity);
            if (activity.status === 'available') {
                listAvailable.appendChild(card);
                avCount++;
            } else {
                listDone.appendChild(card);
                dCount++;
            }
        });

        if (countAv) countAv.textContent = avCount;
        if (countDone) countDone.textContent = dCount;
    }

    function createActivityCard(activity) {
        const div = document.createElement('div');
        div.className = 'activity-card';
        
        // Build tag badges
        let tagsHtml = '';
        if (activity.theme) tagsHtml += `<span class="badge-count" style="background:var(--primary); color:white">${activity.theme}</span> `;
        if (activity.types && activity.types.length) {
            activity.types.forEach(t => {
                let icon = '👤'; if(t==='couple') icon='👫'; if(t==='famille') icon='👨‍👩‍👧‍👦';
                tagsHtml += `<span class="badge-count">${icon}</span> `;
            });
        } else if (!activity.types) {
             // Fallback if no types
        }
        if (activity.prix_str && activity.prix_str !== "N/A" && activity.prix_str !== "0€") tagsHtml += `<span class="badge-count" style="color:var(--primary-light)">💸 ${activity.prix_str}</span>`;

        div.innerHTML = `
            <div class="card-main">
                <h4>${activity.title}</h4>
                <div class="card-meta" style="margin-top:6px; flex-wrap:wrap">
                    ${tagsHtml}
                </div>
                <div class="card-rating-container" style="margin-top: 10px;"></div>
            </div>
            <div class="card-actions">
                <button class="action-btn-pro done-btn" title="Marquer comme fait">${activity.status === 'available' ? '✅' : '↩️'}</button>
                <button class="action-btn-pro delete-btn" title="Supprimer">🗑️</button>
            </div>
        `;
        
        // Inject interactive stars
        div.querySelector('.card-rating-container').appendChild(createInteractiveStars(activity.id, activity.rating));

        div.querySelector('.delete-btn').onclick = () => deleteDoc(doc(db, "activities", activity.id));
        div.querySelector('.done-btn').onclick = () => updateDoc(doc(db, "activities", activity.id), {
            status: activity.status === 'available' ? 'done' : 'available'
        });

        return div;
    }

    function renderRoulette() {
        const container = document.getElementById('roulette-container');
        if(!container || window.getComputedStyle(container).display === 'none') return;
        
        const basePool = activities.filter(a => a.status === 'available');
        let fullPool = getFilteredActivities(basePool, homeFilters);
        if (fullPool.length < 2) {
            container.innerHTML = '<div class="roulette-placeholder">Ajoutez des activités !</div>';
            return;
        }

        let pool = [...fullPool];
        if (pool.length > 8) pool = pool.sort(() => 0.5 - Math.random()).slice(0, 8);
        const segmentCount = 8;

        const size = 320; 
        const center = size / 2;
        const radius = 150; 
        const segmentAngle = 360 / Math.max(pool.length, segmentCount);
        
        const forestGreen = "#1e4d1a";
        const limeGreen = "#a4d65d";
        const grassGreen = "#6fb532";

        let svgHtml = `<svg viewBox="0 0 ${size} ${size}" style="overflow: visible;">
            <defs>
                <linearGradient id="glossyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" style="stop-color:white;stop-opacity:0.4" />
                    <stop offset="50%" style="stop-color:white;stop-opacity:0" />
                </linearGradient>
                <filter id="hubShadow">
                    <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.3"/>
                </filter>
            </defs>

            <!-- Main Wheel Outer Shadow -->
            <circle cx="${center}" cy="${center}" r="${radius}" fill="black" opacity="0.15" transform="translate(0, 10)" />
            
            <!-- Outer Ring Border -->
            <circle cx="${center}" cy="${center}" r="${radius}" fill="${forestGreen}" />`;
        
        const imageIcons = ['\ue97a', '\uea1a', '\uea7d', '\ueeb4', '\ueaa5', '\uea83', '\ueee5', '\ueed1'];

        pool.forEach((activity, i) => {
            if (i >= segmentCount) return;
            const startAngle = i * segmentAngle;
            const endAngle = (i + 1) * segmentAngle;
            const wheelRadius = radius - 6;
            const x1 = center + wheelRadius * Math.cos(Math.PI * (startAngle - 90) / 180);
            const y1 = center + wheelRadius * Math.sin(Math.PI * (startAngle - 90) / 180);
            const x2 = center + wheelRadius * Math.cos(Math.PI * (endAngle - 90) / 180);
            const y2 = center + wheelRadius * Math.sin(Math.PI * (endAngle - 90) / 180);
            
            const largeArc = segmentAngle > 180 ? 1 : 0;
            const fill = i % 2 === 0 ? limeGreen : grassGreen;
            
            svgHtml += `<path d="M ${center} ${center} L ${x1} ${y1} A ${wheelRadius} ${wheelRadius} 0 ${largeArc} 1 ${x2} ${y2} Z" 
                              fill="${fill}" stroke="${forestGreen}" stroke-width="1.5"/>`;
            
            const textAngle = startAngle + segmentAngle / 2;
            const iconRadius = wheelRadius * 0.65;
            const iconX = center + iconRadius * Math.cos(Math.PI * (textAngle - 90) / 180);
            const iconY = center + iconRadius * Math.sin(Math.PI * (textAngle - 90) / 180);
            
            svgHtml += `
                <text x="${iconX}" y="${iconY}" 
                      fill="white"
                      font-family="boxicons"
                      font-size="42" 
                      text-anchor="middle" 
                      dominant-baseline="middle" 
                      style="text-shadow: 0 2px 4px rgba(0,0,0,0.1);"
                      transform="rotate(${textAngle}, ${iconX}, ${iconY})">
                    ${imageIcons[i % imageIcons.length]}
                </text>`;
        });
        
        // Glossy Reflection Overlay
        svgHtml += `<path d="M ${center-radius+20} ${center-40} A ${radius-20} ${radius-20} 0 0 1 ${center+radius-20} ${center-40} L ${center+radius-50} ${center-40} A ${radius-50} ${radius-50} 0 0 0 ${center-radius+50} ${center-40} Z" 
                          fill="url(#glossyGrad)" opacity="0.5" />`;

        // Center Hub 
        svgHtml += `
            <circle cx="${center}" cy="${center}" r="${radius * 0.28}" fill="${forestGreen}" filter="url(#hubShadow)" />
            <circle cx="${center}" cy="${center}" r="${radius * 0.24}" fill="${grassGreen}" stroke="${forestGreen}" stroke-width="1.5" />
            <!-- The White Star -->
            <path d="M ${center} ${center-20} L ${center+5.5} ${center-7} L ${center+18} ${center-5.5} L ${center+9} ${center+3.5} L ${center+11} ${center+16} L ${center} ${center+11} L ${center-11} ${center+16} L ${center-9} ${center+3.5} L ${center-18} ${center-5.5} L ${center-5.5} ${center-7} Z" 
                  fill="white" />
            <!-- Face on the Star -->
            <circle cx="${center-4}" cy="${center-1}" r="1.8" fill="${forestGreen}" />
            <circle cx="${center+4}" cy="${center-1}" r="1.8" fill="${forestGreen}" />
            <path d="M ${center-3.5} ${center+5} Q ${center} ${center+9} ${center+3.5} ${center+5}" fill="none" stroke="${forestGreen}" stroke-width="1.8" stroke-linecap="round" />
        `;

        svgHtml += '</svg>';
        container.innerHTML = svgHtml;
    }

    function createInteractiveStars(activityId, currentRating) {
        const starsContainer = document.createElement('div');
        starsContainer.style.display = 'inline-flex';
        starsContainer.style.gap = '2px';
        
        for(let i=1; i<=5; i++) {
            const star = document.createElement('i');
            star.className = (currentRating && currentRating >= i) ? 'bx bxs-star' : 'bx bx-star';
            star.style.color = (currentRating && currentRating >= i) ? '#ffd700' : 'rgba(0,0,0,0.3)';
            star.style.fontSize = '1.25rem';
            star.style.cursor = 'pointer';
            star.style.transition = '0.2s ease';
            
            // Hover logic could be added here if desired, but direct click is fine for small stars
            star.onmouseover = () => star.style.transform = 'scale(1.2)';
            star.onmouseout = () => star.style.transform = 'scale(1)';
            
            star.onclick = (e) => {
                e.stopPropagation();
                updateDoc(doc(db, "activities", activityId), { rating: i });
            };
            starsContainer.appendChild(star);
        }
        return starsContainer;
    }

    function renderActivityChips() {
        const container = document.getElementById('chips-container');
        if (!container) return;
        
        // Show last 5 activities done
        const lastDone = activities
            .filter(a => a.status === 'done')
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
            .slice(0, 8);

        container.innerHTML = '';

        if (lastDone.length === 0) {
            container.innerHTML = '<div class="activity-chip">Aucun historique</div>';
            return;
        }

        lastDone.forEach(a => {
            const chip = document.createElement('div');
            chip.className = 'activity-chip';
            chip.style.display = 'flex';
            chip.style.flexDirection = 'column';
            chip.style.alignItems = 'center';
            chip.style.gap = '8px';
            chip.style.padding = '12px 18px';
            
            const titleSpan = document.createElement('span');
            titleSpan.textContent = a.title;
            titleSpan.style.fontWeight = '600';
            
            const starsBlock = createInteractiveStars(a.id, a.rating);
            
            chip.appendChild(titleSpan);
            chip.appendChild(starsBlock);
            container.appendChild(chip);
        });
    }

    function renderAppSettingsQR() {
        if (!window.QRCode) return;
        const targetUrl = "https://androlink.web.app";
        const canvas = document.getElementById('qr-canvas-settings');
        const hiddenDiv = document.getElementById('qr-hidden-renderer');
        if (!canvas || !hiddenDiv) return;

        hiddenDiv.innerHTML = '';
        const qrSize = 300;
        const qrObj = new QRCode(hiddenDiv, {
            text: targetUrl,
            width: qrSize,
            height: qrSize,
            correctLevel: QRCode.CorrectLevel.H
        });

        setTimeout(() => {
            const matrix = qrObj._oQRCode.modules;
            const mCount = matrix.length;
            const ctx = canvas.getContext('2d');
            
            canvas.width = (mCount + 6) * 10;
            canvas.height = (mCount + 6) * 10;
            const scaleCell = canvas.width / (mCount + 6);
            const padding = 3;

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            const darkColor = '#1a5208';

            for (let r = 0; r < mCount; r++) {
                for (let c = 0; c < mCount; c++) {
                    if (matrix[r][c]) {
                        if ((r < 8 && c < 8) || (r < 8 && c >= mCount - 8) || (r >= mCount - 8 && c < 8)) continue;
                        const x = (padding + c) * scaleCell + 1;
                        const y = (padding + r) * scaleCell + 1;
                        const s = scaleCell - 2;
                        
                        ctx.beginPath();
                        ctx.fillStyle = darkColor;
                        ctx.roundRect(x, y, s, s, s * 0.38);
                        ctx.fill();
                    }
                }
            }

            function drawFinder(sr, sc) {
                const ox = (padding + sc) * scaleCell;
                const oy = (padding + sr) * scaleCell;
                const total = 7 * scaleCell;
                ctx.fillStyle = darkColor;
                ctx.beginPath();
                ctx.roundRect(ox, oy, total, total, 6);
                ctx.fill();
                ctx.fillStyle = 'rgba(255,255,255,0.85)';
                ctx.beginPath();
                ctx.roundRect(ox + scaleCell, oy + scaleCell, 5 * scaleCell, 5 * scaleCell, 4);
                ctx.fill();
                ctx.fillStyle = darkColor;
                ctx.beginPath();
                ctx.roundRect(ox + 2 * scaleCell, oy + 2 * scaleCell, 3 * scaleCell, 3 * scaleCell, 4);
                ctx.fill();
            }

            drawFinder(0, 0);
            drawFinder(0, mCount - 7);
            drawFinder(mCount - 7, 0);

            const logo = new Image();
            logo.src = 'images/Icon_Activite-Surprise_192x192.png';
            logo.onload = () => {
                const logoSize = scaleCell * 9;
                const lx = (canvas.width - logoSize) / 2;
                const ly = (canvas.height - logoSize) / 2;
                ctx.fillStyle = 'rgba(210, 245, 120, 0.95)';
                ctx.beginPath();
                ctx.roundRect(lx - 5, ly - 5, logoSize + 10, logoSize + 10, 10);
                ctx.fill();
                ctx.save();
                ctx.beginPath();
                ctx.roundRect(lx, ly, logoSize, logoSize, 8);
                ctx.clip();
                ctx.drawImage(logo, lx, ly, logoSize, logoSize);
                ctx.restore();
            };
        }, 100);
    }

    function downloadAppSettingsQR() {
        const srcCanvas = document.getElementById('qr-canvas-settings');
        if (!srcCanvas) return;
        
        const EXPORT = 800;
        const exCard = document.createElement('canvas');
        exCard.width = EXPORT;
        exCard.height = EXPORT;
        const ec = exCard.getContext('2d');

        ec.fillStyle = '#0f1a0a';
        ec.fillRect(0, 0, EXPORT, EXPORT);
        
        const g = ec.createRadialGradient(EXPORT/2, EXPORT/2, 50, EXPORT/2, EXPORT/2, EXPORT/2);
        g.addColorStop(0, '#c8f06a');
        g.addColorStop(0.5, '#7bc940');
        g.addColorStop(1, '#2d7a16');
        
        ec.shadowBlur = 40;
        ec.shadowColor = 'rgba(140, 230, 40, 0.6)';
        ec.fillStyle = g;
        ec.beginPath();
        ec.roundRect(40, 40, EXPORT - 80, EXPORT - 80, 40);
        ec.fill();
        
        ec.shadowBlur = 0;
        const qrSize = EXPORT * 0.7;
        ec.drawImage(srcCanvas, (EXPORT-qrSize)/2, (EXPORT-qrSize)/2, qrSize, qrSize);

        const a = document.createElement('a');
        a.download = 'QR_Famille_Surprise.png';
        a.href = exCard.toDataURL('image/png');
        a.click();
        playSound('success');
    }
});



