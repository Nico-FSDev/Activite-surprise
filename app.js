import { auth, db } from './firebase-config.js';
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged,
    updateProfile
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    collection, 
    addDoc, 
    query, 
    where, 
    onSnapshot, 
    deleteDoc, 
    doc, 
    updateDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    // --- State & Elements ---
    let currentUser = null;
    let activities = [];

    const authContainer = document.getElementById('auth-container');
    const appShell = document.getElementById('app-shell');
    const loginForm = document.getElementById('login-form');
    const logoutBtn = document.getElementById('logout-btn');
    const showSignupLink = document.getElementById('show-signup');
    const displayNameElem = document.getElementById('display-name');
    const currentDateElem = document.getElementById('current-date');

    // --- Auth Logic ---
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
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
        }
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = loginForm.email.value;
        const password = loginForm.password.value;
        const errorMsg = document.getElementById('auth-error-msg');
        const submitBtn = loginForm.querySelector('button');

        try {
            errorMsg.style.display = 'none';
            submitBtn.disabled = true;
            submitBtn.textContent = 'Connexion...';
            
            if (showSignupLink.textContent === 'Se connecter') {
                // Handling Sign Up mode
                const userCred = await createUserWithEmailAndPassword(auth, email, password);
                await updateProfile(userCred.user, { displayName: email.split('@')[0] });
            } else {
                // Handling Login mode
                await signInWithEmailAndPassword(auth, email, password);
            }
        } catch (error) {
            errorMsg.textContent = "Erreur: " + error.message;
            errorMsg.style.display = 'block';
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = showSignupLink.textContent === 'Se connecter' ? 'S\'inscrire' : 'Se connecter';
        }
    });

    showSignupLink.addEventListener('click', (e) => {
        e.preventDefault();
        const h1 = authContainer.querySelector('h1');
        const p = authContainer.querySelector('p');
        const btn = loginForm.querySelector('button');
        
        if (showSignupLink.textContent === 'S\'inscrire') {
            h1.textContent = 'Créer un compte';
            p.textContent = 'Rejoignez votre famille sur Activité Surprise';
            btn.textContent = 'S\'inscrire';
            showSignupLink.textContent = 'Se connecter';
        } else {
            h1.textContent = 'Activité Surprise';
            p.textContent = 'Bienvenue dans votre espace famille';
            btn.textContent = 'Se connecter';
            showSignupLink.textContent = 'S\'inscrire';
        }
    });

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

                // Switch View
                views.forEach(v => v.classList.remove('active'));
                const targetView = document.getElementById(targetViewId);
                if (targetView) targetView.classList.add('active');

                // Module Transitions
                if (viewName === 'calendar') renderCalendar();
                if (viewName === 'stats') renderStats();
            });
        });
    }

    function setupViewInteractions() {
        // Management Tabs
        const tabLinks = document.querySelectorAll('.tab-link');
        const lists = document.querySelectorAll('.activity-cards-list');
        
        tabLinks.forEach(link => {
            link.addEventListener('click', () => {
                tabLinks.forEach(l => l.classList.remove('active'));
                lists.forEach(l => l.classList.remove('active'));
                
                link.classList.add('active');
                document.getElementById(`pro-list-${link.dataset.tab}`).classList.add('active');
            });
        });

        // Add Activity
        const btnAddPro = document.getElementById('btn-add-pro');
        const inputPro = document.getElementById('pro-activity-input');

        btnAddPro.addEventListener('click', async () => {
            const title = inputPro.value.trim();
            if (!title || !currentUser) return;

            try {
                btnAddPro.disabled = true;
                const newActivity = {
                    title,
                    userId: currentUser.uid,
                    status: 'available',
                    date: new Date().toISOString().split('T')[0],
                    time: "10:00",
                    duration: "2h",
                    createdAt: Date.now()
                };
                await addDoc(collection(db, "activities"), newActivity);
                inputPro.value = '';
            } catch (error) {
                alert("Erreur lors de l'ajout");
            } finally {
                btnAddPro.disabled = false;
            }
        });

        // Participants UI
        const btnAddP = document.getElementById('btn-add-participant');
        const pInput = document.getElementById('participant-name');
        
        btnAddP.addEventListener('click', async () => {
            const name = pInput.value.trim();
            if(!name || !currentUser) return;
            
            await addDoc(collection(db, "participants"), {
                name,
                userId: currentUser.uid,
                joinedAt: Date.now()
            });
            pInput.value = '';
        });

        // Roulette Logic
        const btnSpin = document.getElementById('btn-spin');
        const btnSurpriseMobile = document.getElementById('btn-surprise-mobile');
        const wheelContainer = document.getElementById('roulette-container');
        let currentRotation = 0;

        const handleSurpriseSpin = async (triggerBtn) => {
            const pool = activities.filter(a => a.status === 'available');
            if (pool.length < 2) return alert("Ajoutez au moins 2 activités pour faire tourner la roue !");

            triggerBtn.disabled = true;
            
            // Pick result in advance
            const randomIndex = Math.floor(Math.random() * pool.length);
            const picked = pool[randomIndex];
            
            // For Desktop Wheel (only if visible)
            if (wheelContainer && window.getComputedStyle(wheelContainer).display !== 'none') {
                const segmentAngle = 360 / pool.length;
                const targetAngle = (360 - (randomIndex * segmentAngle)) - (segmentAngle / 2);
                const extraSpins = 5 * 360; 
                currentRotation += extraSpins + (targetAngle - (currentRotation % 360));
                wheelContainer.style.transform = `rotate(${currentRotation}deg)`;

                setTimeout(async () => {
                    alert(`L'activité choisie est : ${picked.title} ! 🎲✨`);
                    await updateDoc(doc(db, "activities", picked.id), { status: 'done' });
                    triggerBtn.disabled = false;
                }, 5500);
            } else {
                // For Mobile (No wheel show, just a quick fancy alert)
                alert(`🎲 Le dé est lancé... \n\nL'activité choisie est : ${picked.title} ! ✨`);
                await updateDoc(doc(db, "activities", picked.id), { status: 'done' });
                triggerBtn.disabled = false;
            }
        };

        if (btnSpin) btnSpin.addEventListener('click', () => handleSurpriseSpin(btnSpin));
        if (btnSurpriseMobile) btnSurpriseMobile.addEventListener('click', () => handleSurpriseSpin(btnSurpriseMobile));
    }

    // --- Modules Realization ---

    function listenToActivities() {
        if (!currentUser) return;
        
        const q = query(collection(db, "activities"), where("userId", "==", currentUser.uid));
        
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

    function renderParticipants() {
        const list = document.getElementById('participants-list');
        list.innerHTML = '';
        participants.forEach(p => {
            const card = document.createElement('div');
            card.className = 'participant-card glass';
            card.innerHTML = `
                <div class="p-avatar">${p.name.charAt(0)}</div>
                <div class="p-name">${p.name}</div>
                <button class="action-btn-pro" onclick="this.dataset.id='${p.id}'">🗑️</button>
            `;
            // Quick delete logic
            card.querySelector('button').onclick = () => deleteDoc(doc(db, "participants", p.id));
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

    // --- Core View Renders ---
    function renderActivities() {
        const listAvailable = document.getElementById('pro-list-available');
        const listDone = document.getElementById('pro-list-done');
        if(!listAvailable || !listDone) return;
        
        listAvailable.innerHTML = '';
        listDone.innerHTML = '';

        activities.forEach(activity => {
            const card = createActivityCard(activity);
            if (activity.status === 'available') {
                listAvailable.appendChild(card);
            } else {
                listDone.appendChild(card);
            }
        });
    }

    function createActivityCard(activity) {
        const div = document.createElement('div');
        div.className = 'activity-card';
        div.innerHTML = `
            <div class="card-main">
                <h4>${activity.title}</h4>
                <div class="card-meta">
                    <span>📅 ${activity.date}</span>
                    <span>🕒 ${activity.duration}</span>
                </div>
            </div>
            <div class="card-actions">
                <button class="action-btn-pro done-btn" title="Marquer comme fait">${activity.status === 'available' ? '✅' : '↩️'}</button>
                <button class="action-btn-pro delete-btn" title="Supprimer">🗑️</button>
            </div>
        `;

        div.querySelector('.delete-btn').onclick = () => deleteDoc(doc(db, "activities", activity.id));
        div.querySelector('.done-btn').onclick = () => updateDoc(doc(db, "activities", activity.id), {
            status: activity.status === 'available' ? 'done' : 'available'
        });

        return div;
    }

    function renderRoulette() {
        const container = document.getElementById('roulette-container');
        if(!container || window.getComputedStyle(container).display === 'none') return;
        const pool = activities.filter(a => a.status === 'available');
        
        if (pool.length < 2) {
            container.innerHTML = '<div class="roulette-placeholder">Ajoutez des activités !</div>';
            return;
        }

        const size = 320;
        const center = size / 2;
        const radius = center - 10;
        const segmentAngle = 360 / pool.length;
        
        let svgHtml = `<svg viewBox="0 0 ${size} ${size}" class="roulette-wheel-svg">`;
        
        pool.forEach((activity, i) => {
            const startAngle = i * segmentAngle;
            const endAngle = (i + 1) * segmentAngle;
            const x1 = center + radius * Math.cos(Math.PI * startAngle / 180);
            const y1 = center + radius * Math.sin(Math.PI * startAngle / 180);
            const x2 = center + radius * Math.cos(Math.PI * endAngle / 180);
            const y2 = center + radius * Math.sin(Math.PI * endAngle / 180);
            const largeArc = segmentAngle > 180 ? 1 : 0;
            const color = i % 2 === 0 ? '#56ab2f' : '#a8e063';
            svgHtml += `<path d="M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z" fill="${color}" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>`;
            const textAngle = startAngle + segmentAngle / 2;
            const textX = center + (radius * 0.7) * Math.cos(Math.PI * textAngle / 180);
            const textY = center + (radius * 0.7) * Math.sin(Math.PI * textAngle / 180);
            
            // Truncate long titles to avoid overflow
            let label = activity.title;
            const emoji = activity.title.match(/[\p{Emoji_Presentation}\p{Emoji}\p{Emoji_Component}]/gu)?.[0] || '';
            const titleWithoutEmoji = label.replace(emoji, '').trim();
            
            // Limit to ~10 chars + ... if needed
            let displayLabel = titleWithoutEmoji.length > 10 ? titleWithoutEmoji.substring(0, 8) + '..' : titleWithoutEmoji;
            if (emoji) displayLabel = emoji + ' ' + displayLabel;

            svgHtml += `<text x="${textX}" y="${textY}" class="segment-text" text-anchor="middle" dominant-baseline="middle" font-size="11" font-weight="600" fill="white" transform="rotate(${textAngle + 90}, ${textX}, ${textY})">${displayLabel}</text>`;
        });
        
        svgHtml += '</svg>';
        container.innerHTML = svgHtml;
    }

    function renderActivityChips() {
        const container = document.getElementById('chips-container');
        if (!container) return;
        
        // Show last 5 activities done
        const lastDone = activities
            .filter(a => a.status === 'done')
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
            .slice(0, 5);

        if (lastDone.length === 0) {
            container.innerHTML = '<div class="activity-chip">Aucun historique</div>';
            return;
        }

        container.innerHTML = lastDone.map(a => `
            <div class="activity-chip">${a.title}</div>
        `).join('');
    }
});



