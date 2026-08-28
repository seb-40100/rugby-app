const SPREADSHEET_ID = '16bfjaSFQIShF6jUNiQhh76gonKqdVlq6DRzdAOSSIQE';
const SHEET_NAME = 'presences';
let allPlayers = [];
let trainingDates = [];
let generatedGroups = [];

const trainingSelect = document.getElementById('trainingSelect');
const groupCountInput = document.getElementById('groupCount');
const targetLevelsContainer = document.getElementById('targetLevels');
const btnGenerateGroups = document.getElementById('btnGenerateGroups');
const btnCopyGroups = document.getElementById('btnCopyGroups');
const btnReset = document.getElementById('btnReset');
const btnPrintGroups = document.getElementById('btnPrintGroups');
const groupsOutput = document.getElementById('groupsOutput');
const showNiveauCheck = document.getElementById('showNiveauCheck');

let tokenClient;
let accessToken = null;

function waitForGoogle() {
    if (!window.google || !google.accounts || !google.accounts.oauth2) {
        setTimeout(waitForGoogle, 100);
        return;
    }
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: '517412786952-ocuhpuucqitb90g6dkruo9nvqfnauvts.apps.googleusercontent.com',
        scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
        callback: async (response) => {
            if (response.error) { console.error(response); return; }
            accessToken = response.access_token;
            showToast('Connexion r\'ussie, chargement...', 'info');
            await loadSheetsData();
        }
    });
}
waitForGoogle();

const btnConnectSheets = document.getElementById('btnConnectSheets');
if (btnConnectSheets) {
    btnConnectSheets.addEventListener('click', () => {
        tokenClient.requestAccessToken({ prompt: 'consent' });
    });
}

async function loadSheetsData() {
    const range = encodeURIComponent('\'presences\'!A:ZZ');
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}`;
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const data = await response.json();
        if (!response.ok) {
            showToast('Erreur : ' + (data.error?.message || ''), 'error');
            return;
        }
        allPlayers = parseSheetsJSON(data.values);
        trainingDates = Object.keys(allPlayers.length > 0 ? allPlayers[0].presences : {});
        console.log('players:', allPlayers.length, 'dates:', trainingDates);
        if (allPlayers.length > 0) {
            populateTrainingSelect();
            showToast(`${allPlayers.length} joueurs charg\'es !`, 'success');
            btnGenerateGroups.disabled = false;
        }
    } catch (err) {
        showToast('Erreur r\'eseau : ' + err.message, 'error');
    }
}

function parseSheetsJSON(values) {
    if (!values || !Array.isArray(values) || values.length < 5) return [];
    let headerRowIndex = -1;
    for (let i = 0; i < values.length; i++) {
        if (values[i][1] === 'Nom') { headerRowIndex = i; break; }
    }
    if (headerRowIndex === -1) return [];

    const dates = [];
    console.log('headerRow:', values[headerRowIndex]);
    for (let c = 5; c < values[headerRowIndex].length; c++) {
        const cell = values[headerRowIndex][c]?.trim();
        console.log('cell', c, ':', JSON.stringify(cell));
        if (cell && !cell.includes('Bilan') && cell.length > 0 && !/^\d+$/.test(cell)) {
            dates.push(cell);
        }
    }
    console.log('extracted dates:', dates);

    const players = [];
    for (let r = headerRowIndex + 1; r < values.length; r++) {
        const row = values[r];
        if (!row || row.length < 5 || !row[1]?.trim()) continue;
        const niveau = row[4]?.trim() || '';
        if (!niveau || !['A', 'B+', 'B', 'B-', 'C'].includes(niveau)) continue;

        players.push({
            nom: row[1].trim(),
            prenom: row[2]?.trim() || '',
            niveau,
            niveauNum: {'A':3,'B+':2.5,'B':2,'B-':1.5,'C':1}[niveau],
            presences: {}
        });

        for (let c = 0; c < dates.length; c++) {
            const val = row[5 + c];
            players[players.length - 1].presences[dates[c]] = val?.trim().toUpperCase().startsWith('P') ? 'P' : (val?.trim().toUpperCase() === 'A' ? 'A' : '?');
        }
    }
    return players;
}

function populateTrainingSelect() {
    trainingSelect.innerHTML = '<option value="">-- Selectionner un entrainement --</option>';
    for (const date of trainingDates) {
        const opt = document.createElement('option');
        opt.value = date;
        opt.textContent = date;
        trainingSelect.appendChild(opt);
    }
}

groupCountInput.addEventListener('change', buildTargetLevelSelects);
trainingSelect.addEventListener('change', () => { btnGenerateGroups.disabled = false; });
buildTargetLevelSelects();

function buildTargetLevelSelects() {
    const num = Math.max(2, Math.min(10, parseInt(groupCountInput.value) || 3));
    targetLevelsContainer.innerHTML = '';
    for (let i = 0; i < num; i++) {
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; align-items: center; gap: 0.5rem;';
        row.innerHTML = `<span style="color: var(--text-muted); font-size: 0.85rem; width: 70px;">Groupe ${i+1}</span>`;
        const sel = document.createElement('select');
        sel.className = 'targetLevelSelect';
        sel.style.cssText = 'flex: 1; background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.1); border-radius: var(--radius-sm); padding: 0.4rem 0.5rem; color: var(--text-primary); font-size: 0.9rem; outline: none;';
        ['A', 'B', 'C'].forEach(lvl => {
            const opt = document.createElement('option');
            opt.value = lvl;
            opt.textContent = lvl;
            sel.appendChild(opt);
        });
        sel.value = 'C';
        row.appendChild(sel);
        targetLevelsContainer.appendChild(row);
    }
}

function generateGroups() {
    const selectedTraining = trainingSelect.value;
    if (!selectedTraining) { showToast('Selecionne un entra\'nement.', 'info'); return; }

    const numGroups = Math.max(2, Math.min(10, parseInt(groupCountInput.value) || 3));
    const targetLevels = Array.from(document.querySelectorAll('.targetLevelSelect')).map(s => s.value);
    while (targetLevels.length < numGroups) targetLevels.push('C');

    const presentPlayers = allPlayers.filter(p => p.presences[selectedTraining] === 'P');
    if (presentPlayers.length < numGroups) { showToast('Pas assez de joueurs pr\'esents.', 'error'); return; }

    presentPlayers.sort((a, b) => b.niveauNum - a.niveauNum);

    const targetNum = {'A':3,'B':2,'C':1};
    const groups = targetLevels.map(t => ({
        target: t, targetNum: targetNum[t], players: []
    }));

    const groupSizes = presentPlayers.length % numGroups;
    const baseSize = Math.floor(presentPlayers.length / numGroups);
    let sizes = groups.map((_, i) => i < groupSizes ? baseSize + 1 : baseSize);

    // Find shared target levels across groups
    const levelCounts = {};
    targetLevels.forEach(t => levelCounts[t] = (levelCounts[t] || 0) + 1);
    const sharedLevels = Object.entries(levelCounts).filter(([,c]) => c > 1).map(([l]) => l);

    // First pass: assign exact-level players to shared groups, spread evenly
    for (const level of sharedLevels) {
        const matchingPlayers = presentPlayers.filter(p => p.niveau === level);
        const matchingGroupIndices = targetLevels.map((t, i) => t === level ? i : -1).filter(i => i !== -1);
        matchingPlayers.forEach((p, i) => {
            const groupIndex = matchingGroupIndices[i % matchingGroupIndices.length];
            groups[groupIndex].players.push({ nom: p.nom, prenom: p.prenom, niveau: p.niveau });
        });
    }

    // Second pass: assign remaining players based on best match
    const assignedSet = new Set();
    for (const g of groups) g.players.forEach(p => assignedSet.add(p.nom + p.prenom));
    const remainingPlayers = presentPlayers.filter(p => !assignedSet.has(p.nom + p.prenom));

    for (const player of remainingPlayers) {
        let bestGroup = -1;
        let bestScore = Infinity;

        for (let g = 0; g < numGroups; g++) {
            const sizeDiff = sizes[g] - groups[g].players.length;
            if (sizeDiff <= 0) continue;

            const levelDiff = Math.abs(player.niveauNum - groups[g].targetNum);
            const score = levelDiff * 10 + (6 - groups[g].players.length) * 0.01;

            if (score < bestScore) { bestScore = score; bestGroup = g; }
        }

        if (bestGroup === -1) {
            let minSize = Infinity;
            for (let g = 0; g < numGroups; g++) {
                if (groups[g].players.length < minSize) { minSize = groups[g].players.length; bestGroup = g; }
            }
        }

        groups[bestGroup].players.push({ nom: player.nom, prenom: player.prenom, niveau: player.niveau });
    }

    groups.forEach(g => g.players.sort((a, b) => a.nom.localeCompare(b.nom)));

    generatedGroups = groups;
    renderGroups();
}

function renderGroups() {
    const showNiveaux = showNiveauCheck.checked;
    groupsOutput.innerHTML = '';
    generatedGroups.forEach((group, i) => {
        const div = document.createElement('div');
        div.style.cssText = 'background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.05); border-radius: var(--radius-md); padding: 1rem;';
        let html = `<h4 style="margin-bottom: 0.5rem; font-size: 1rem; color: var(--primary);">Groupe ${i+1} - ${group.players.length} joueurs</h4>`;
        html += '<div style="display: flex; flex-direction: column; gap: 0.25rem;">';
        group.players.forEach(p => {
            html += `<div style="padding: 0.25rem 0.5rem; font-size: 0.85rem;">${p.nom} ${p.prenom}${showNiveaux ? ` <span style="color: var(--text-muted); font-size: 0.75rem;">(${p.niveau})</span>` : ''}</div>`;
        });
        html += '</div>';
        div.innerHTML = html;
        groupsOutput.appendChild(div);
    });
    btnCopyGroups.disabled = false;
    btnPrintGroups.disabled = false;
}

btnGenerateGroups.addEventListener('click', generateGroups);

// PRINT
btnPrintGroups.addEventListener('click', () => {
    window.print();
});

// COPY
btnCopyGroups.addEventListener('click', () => {
    const showNiveaux = showNiveauCheck.checked;
    let text = '';
    generatedGroups.forEach((g, i) => {
        text += `GROUPE ${i+1} (niveau ${g.target})\n${g.players.length} joueurs\n`;
        g.players.forEach(p => { text += `${p.nom} ${p.prenom}${showNiveaux ? ` (${p.niveau})` : ''}\n`; });
        text += '\n';
    });
    navigator.clipboard.writeText(text).then(() => showToast('Groupes copies !', 'success'));
});

// RESET
btnReset.addEventListener('click', () => {
    generatedGroups = [];
    groupsOutput.innerHTML = '';
    btnCopyGroups.disabled = true;
    trainingSelect.selectedIndex = 0;
    groupCountInput.value = 3;
    buildTargetLevelSelects();
    showToast('Reinitialise.', 'info');
});

function showToast(message, type) {
    const toastMsg = document.getElementById('toastMessage');
    if (toastMsg) {
        toastMsg.innerText = message;
        const toast = document.getElementById('toast');
        if (toast) {
            toast.className = `toast show ${type === 'success' ? 'toast-success' : 'toast-info'}`;
            setTimeout(() => toast.classList.remove('show'), 3000);
        }
    }
}
