document.addEventListener('DOMContentLoaded', () => {
    // Register Service Worker with automatic update handling
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => console.log('Service Worker: Registered'))
                .catch(err => console.log(`Service Worker: Error: ${err}`));
        });

        // Ensure that new service worker takes over immediately and reloads the page
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (!refreshing) {
                window.location.reload();
                refreshing = true;
            }
        });
    }

    // State
    let activities = JSON.parse(localStorage.getItem('activities')) || [
        "Faire un jeu de société 🎲",
        "Regarder un film en famille 🍿",
        "Aller faire une balade au parc 🌳",
        "Faire de la pâtisserie 🧁"
    ]; 
    let blacklisted = JSON.parse(localStorage.getItem('blacklisted')) || [];

    // Elements
    const viewPicker = document.getElementById('view-picker');
    const viewManagement = document.getElementById('view-management');
    const navMgmtBtn = document.getElementById('nav-management-btn');
    const navHomeBtn = document.getElementById('nav-home-btn');
    
    const btnDraw = document.getElementById('btn-draw');
    const resultText = document.getElementById('result-text');
    
    const inputActivities = document.getElementById('input-activities');
    const btnAdd = document.getElementById('btn-add');
    const btnReset = document.getElementById('btn-reset');
    
    const countAvailable = document.getElementById('count-available');
    const countBlacklisted = document.getElementById('count-blacklisted');
    const listAvailable = document.getElementById('list-available');
    const listBlacklisted = document.getElementById('list-blacklisted');

    // Navigation
    navMgmtBtn.addEventListener('click', () => {
        viewPicker.classList.remove('active');
        viewManagement.classList.add('active');
        renderLists();
    });

    navHomeBtn.addEventListener('click', () => {
        viewManagement.classList.remove('active');
        viewPicker.classList.add('active');
        updatePickerState();
    });

    // Drawing Logic
    btnDraw.addEventListener('click', () => {
        if (activities.length === 0) return;

        // Visual spinning effect
        btnDraw.disabled = true;
        resultText.classList.add('spinning');
        
        let spins = 0;
        const spinInterval = setInterval(() => {
            const randomDummy = activities[Math.floor(Math.random() * activities.length)];
            resultText.textContent = randomDummy;
            spins++;
            
            if (spins > 20) {
                clearInterval(spinInterval);
                finishDraw();
            }
        }, 50); // 50ms per tick
    });

    function finishDraw() {
        const randomIndex = Math.floor(Math.random() * activities.length);
        const picked = activities[randomIndex];
        
        resultText.classList.remove('spinning');
        resultText.textContent = picked;
        resultText.style.transform = 'scale(1.1)';
        setTimeout(() => resultText.style.transform = 'none', 300);

        // Move to blacklist
        activities.splice(randomIndex, 1);
        blacklisted.push(picked);
        saveState();
        updatePickerState();

        btnDraw.disabled = false;
        shootConfetti();
    }

    function updatePickerState() {
        if (activities.length === 0) {
            btnDraw.disabled = true;
            btnDraw.style.opacity = '0.5';
            btnDraw.querySelector('.btn-text').textContent = 'Plus d\'activités';
            if(!resultText.textContent || resultText.textContent === "Prêt pour l'aventure ?") {
                 resultText.textContent = "Toutes les activités ont été faites ! 🌟";
            }
        } else {
            btnDraw.disabled = false;
            btnDraw.style.opacity = '1';
            btnDraw.querySelector('.btn-text').textContent = 'Activité Surprise';
        }
    }

    // Management Logic
    btnAdd.addEventListener('click', () => {
        const text = inputActivities.value.trim();
        if (!text) return;

        // Split by newlines, trim lines, and ignore empty
        const newActs = text.split('\n')
                            .map(a => a.trim())
                            .filter(a => a.length > 0);
        
        let addedCount = 0;
        for(let act of newActs) {
            // Check if already in available to prevent duplicate visible entries
            if (!activities.includes(act) && !blacklisted.includes(act)) {
                activities.push(act);
                addedCount++;
            } else if (blacklisted.includes(act) && !activities.includes(act)) {
                // If it's blacklisted, maybe we just un-blacklist it instead.
                activities.push(act);
                const idx = blacklisted.indexOf(act);
                if (idx > -1) {
                    blacklisted.splice(idx, 1);
                }
                addedCount++;
            }
        }

        if (addedCount > 0) {
             saveState();
             inputActivities.value = '';
             renderLists();
             updatePickerState();
             
             // Quick feedback
             const origText = btnAdd.textContent;
             btnAdd.textContent = `Ajouté (${addedCount}) !`;
             setTimeout(() => btnAdd.textContent = origText, 1500);
        } else {
             const origText = btnAdd.textContent;
             btnAdd.textContent = `Déjà existantes`;
             setTimeout(() => btnAdd.textContent = origText, 1500);
        }
    });

    btnReset.addEventListener('click', () => {
        if(confirm("Voulez-vous vraiment tout remettre disponible ? Les activités 'Déjà faites' retourneront dans le tirage au sort.")) {
            activities = [...activities, ...blacklisted];
            blacklisted = [];
            saveState();
            renderLists();
            updatePickerState();
            resultText.textContent = "Prêt pour l'aventure ?";
        }
    });

    function renderLists() {
        countAvailable.textContent = activities.length;
        countBlacklisted.textContent = blacklisted.length;

        listAvailable.innerHTML = '';
        activities.forEach((act, index) => {
            const item = createListItem(act, [
                { icon: '🗑️', class: 'delete', action: () => deleteActivity(index) }
            ]);
            listAvailable.appendChild(item);
        });

        listBlacklisted.innerHTML = '';
        blacklisted.forEach((act, index) => {
            const item = createListItem(act, [
                { icon: '↩️', class: '', action: () => restoreActivity(index) },
                { icon: '🗑️', class: 'delete', action: () => deleteBlacklisted(index) }
            ]);
            listBlacklisted.appendChild(item);
        });
    }

    function createListItem(text, buttons) {
        const div = document.createElement('div');
        div.className = 'list-item';
        
        const span = document.createElement('span');
        span.className = 'item-text';
        span.textContent = text;
        div.appendChild(span);

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'actions';
        
        buttons.forEach(btn => {
            const b = document.createElement('button');
            b.className = `action-btn ${btn.class}`;
            b.textContent = btn.icon;
            b.onclick = btn.action;
            actionsDiv.appendChild(b);
        });

        div.appendChild(actionsDiv);
        return div;
    }

    function deleteActivity(idx) {
        if(confirm("Supprimer définitivement cette activité ?")) {
            activities.splice(idx, 1);
            saveState();
            renderLists();
        }
    }

    function restoreActivity(idx) {
        const act = blacklisted.splice(idx, 1)[0];
        activities.push(act);
        saveState();
        renderLists();
    }

    function deleteBlacklisted(idx) {
        if(confirm("Supprimer définitivement cette activité ?")) {
            blacklisted.splice(idx, 1);
            saveState();
            renderLists();
        }
    }

    function saveState() {
        localStorage.setItem('activities', JSON.stringify(activities));
        localStorage.setItem('blacklisted', JSON.stringify(blacklisted));
    }

    // Tabs logic
    const tabs = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            tab.classList.add('active');
            document.getElementById(tab.dataset.target).classList.add('active');
        });
    });

    // Confetti Effect
    function shootConfetti() {
        const container = document.getElementById('view-picker');
        const colors = ['#f2d74e', '#ffffff', '#ff9a91', '#a8e063'];
        
        for (let i = 0; i < 40; i++) {
            const conf = document.createElement('div');
            conf.className = 'confetti';
            conf.style.left = Math.random() * 100 + 'vw';
            conf.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            conf.style.top = '-10px';
            
            // Random shapes
            if(Math.random() > 0.5) conf.style.borderRadius = '50%';
            
            container.appendChild(conf);

            const anim = conf.animate([
                { transform: `translate3d(0, 0, 0) rotate(0deg)`, opacity: 1 },
                { transform: `translate3d(${Math.random() * 100 - 50}px, 100vh, 0) rotate(${Math.random() * 720}deg)`, opacity: 0 }
            ], {
                duration: Math.random() * 1500 + 1000,
                easing: 'cubic-bezier(.37,0,.63,1)'
            });

            anim.onfinish = () => conf.remove();
        }
    }

    // Init
    updatePickerState();
});
