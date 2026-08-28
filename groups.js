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

// Players-per-group input: create if not present in HTML
let playersPerGroupInput = document.getElementById('playersPerGroup');
if (!playersPerGroupInput) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex; gap:0.5rem; align-items:center; margin-top:0.5rem;';
    const label = document.createElement('label');
    label.htmlFor = 'playersPerGroup';
    label.textContent = 'Joueurs / groupe';
    label.style.cssText = 'color: var(--text-muted); font-size:0.85rem; width:110px;';
    playersPerGroupInput = document.createElement('input');
    playersPerGroupInput.type = 'number';
    playersPerGroupInput.id = 'playersPerGroup';
    playersPerGroupInput.min = '1';
    playersPerGroupInput.step = '1';
    playersPerGroupInput.placeholder = '';
    playersPerGroupInput.style.cssText = 'width:80px; padding:0.3rem; background: rgba(0,0,0,0.12); border-radius:4px; border:1px solid rgba(255,255,255,0.06);';
    wrapper.appendChild(label);
    wrapper.appendChild(playersPerGroupInput);
    // try to insert near groupCountInput if possible
    if (groupCountInput && groupCountInput.parentNode) {
        groupCountInput.parentNode.insertBefore(wrapper, groupCountInput.nextSibling);
    } else if (btnGenerateGroups && btnGenerateGroups.parentNode) {
        btnGenerateGroups.parentNode.insertBefore(wrapper, btnGenerateGroups);
    }
}

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
            // update default players-per-group if training already selected
            updatePlayersPerGroupDefault();
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

groupCountInput.addEventListener('change', () => {
    buildTargetLevelSelects();
    updatePlayersPerGroupDefault();
});
trainingSelect.addEventListener('change', () => {
    btnGenerateGroups.disabled = false;
    updatePlayersPerGroupDefault();
});
buildTargetLevelSelects();

// Propose a default value for playersPerGroup based on present players and number of groups
function updatePlayersPerGroupDefault() {
    if (!trainingSelect || !playersPerGroupInput || !groupCountInput) return;
    const selectedTraining = trainingSelect.value;
    const numGroups = Math.max(2, Math.min(10, parseInt(groupCountInput.value) || 3));
    if (!selectedTraining) {
        playersPerGroupInput.placeholder = '';
        playersPerGroupInput.value = '';
        return;
    }
    const presentPlayers = allPlayers.filter(p => p.presences[selectedTraining] === 'P');
    const defaultVal = presentPlayers.length > 0 ? Math.ceil(presentPlayers.length / numGroups) : '';
    playersPerGroupInput.placeholder = defaultVal ? String(defaultVal) : '';
    // do not override user's explicit input; only set value if empty
    if (!playersPerGroupInput.value) playersPerGroupInput.value = defaultVal;
}

// UTIL: Fisher–Yates shuffle (in-place)
function shuffleInPlace(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function generateGroups() {
    const selectedTraining = trainingSelect.value;
    if (!selectedTraining) { showToast('Selecionne un entra\'nement.', 'info'); return; }

    const numGroups = Math.max(2, Math.min(10, parseInt(groupCountInput.value) || 3));
    const targetLevels = Array.from(document.querySelectorAll('.targetLevelSelect')).map(s => s.value);
    while (targetLevels.length < numGroups) targetLevels.push('C');

    const presentPlayers = allPlayers.filter(p => p.presences[selectedTraining] === 'P');
    if (presentPlayers.length < numGroups) { showToast('Pas assez de joueurs pr\'esents.', 'error'); return; }

    // Do not strictly sort deterministically — add randomness while keeping level priority.
    const levelsOrder = ['A', 'B+', 'B', 'B-', 'C'];
    const byLevel = {};
    levelsOrder.forEach(l => byLevel[l] = []);
    presentPlayers.forEach(p => {
        if (!byLevel[p.niveau]) byLevel[p.niveau] = [];
        byLevel[p.niveau].push(p);
    });
    // shuffle inside each level
    levelsOrder.forEach(l => shuffleInPlace(byLevel[l]));

    // Flatten with higher levels first
    const flattened = [];
    levelsOrder.forEach(l => {
        flattened.push(...byLevel[l]);
    });

    const targetNum = {'A':3,'B':2,'C':1};
    const groups = targetLevels.map(t => ({
        target: t, targetNum: targetNum[t], players: []
    }));

    // Determine sizes:
    // If playersPerGroup input provided and valid, use it as a per-group cap and allocate round-robin until all players assigned.
    // Otherwise use original balanced computation (base + remainder).
    const totalPlayers = flattened.length;
    let sizes = new Array(numGroups).fill(0);
    const userVal = parseInt(playersPerGroupInput.value);
    const hasUserVal = !isNaN(userVal) && userVal > 0;

    if (hasUserVal) {
        const cap = userVal;
        if (cap * numGroups < totalPlayers) {
            showToast(`Capacité insuffisante : ${cap} x ${numGroups} < ${totalPlayers} joueurs présents. Augmente le nombre / groupe ou le nombre de groupes.`, 'error');
            return;
        }
        // Round-robin allocate 1 by 1 up to cap per group to sum = totalPlayers
        let remaining = totalPlayers;
        let idx = 0;
        while (remaining > 0) {
            if (sizes[idx] < cap) {
                sizes[idx]++;
                remaining--;
            }
            idx = (idx + 1) % numGroups;
        }
    } else {
        const remainder = totalPlayers % numGroups;
        const baseSize = Math.floor(totalPlayers / numGroups);
        sizes = groups.map((_, i) => i < remainder ? baseSize + 1 : baseSize);
    }

    // Find shared target levels across groups
    const levelCounts = {};
    targetLevels.forEach(t => levelCounts[t] = (levelCounts[t] || 0) + 1);
    const sharedLevels = Object.entries(levelCounts).filter(([,c]) => c > 1).map(([l]) => l);

    // First pass: assign exact-level players to shared groups, spread evenly (round-robin) after shuffle
    for (const level of sharedLevels) {
        const matchingPlayers = (byLevel[level] || []).slice();
        shuffleInPlace(matchingPlayers);
        const matchingGroupIndices = targetLevels.map((t, i) => t === level ? i : -1).filter(i => i !== -1);
        matchingPlayers.forEach((p, i) => {
            const groupIndex = matchingGroupIndices[i % matchingGroupIndices.length];
            if (groups[groupIndex].players.length < sizes[groupIndex]) {
                groups[groupIndex].players.push({ nom: p.nom, prenom: p.prenom, niveau: p.niveau });
            }
        });
    }

    // Second pass: assign remaining players based on best match but use randomness to break ties
    const assignedSet = new Set();
    for (const g of groups) g.players.forEach(p => assignedSet.add((p.nom + '|' + p.prenom)));
    const remainingPlayers = flattened.filter(p => !assignedSet.has(p.nom + '|' + p.prenom));
    shuffleInPlace(remainingPlayers);

    for (const player of remainingPlayers) {
        let bestScore = Infinity;
        const scores = [];
        for (let g = 0; g < numGroups; g++) {
            const spaceLeft = sizes[g] - groups[g].players.length;
            if (spaceLeft <= 0) {
                scores.push({ g, score: Infinity });
                continue;
            }
            const levelDiff = Math.abs(player.niveauNum - groups[g].targetNum);
            const sizePenalty = (groups[g].players.length) * 0.01;
            const score = levelDiff * 10 + sizePenalty;
            scores.push({ g, score });
            if (score < bestScore) bestScore = score;
        }

        const EPS = 0.001;
        const candidates = scores.filter(s => isFinite(s.score) && s.score <= bestScore + EPS).map(s => s.g);

        let chosenGroup = -1;
        if (candidates.length === 0) {
            let minSize = Infinity;
            for (let g = 0; g < numGroups; g++) {
                if (groups[g].players.length < minSize && groups[g].players.length < sizes[g]) {
                    minSize = groups[g].players.length;
                    chosenGroup = g;
                }
            }
            if (chosenGroup === -1) chosenGroup = 0;
        } else if (candidates.length === 1) {
            chosenGroup = candidates[0];
        } else {
            chosenGroup = candidates[Math.floor(Math.random() * candidates.length)];
        }

        groups[chosenGroup].players.push({ nom: player.nom, prenom: player.prenom, niveau: player.niveau });
    }

    // Final sort inside groups for stable display (alphabetical)
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

// PRINT - Optimized popup with A4 layout in 2 columns (compact for single page)
btnPrintGroups.addEventListener('click', () => {
    const showNiveaux = showNiveauCheck.checked;
    
    // Create HTML content for print
    let printHTML = `
        <!DOCTYPE html>
        <html lang="fr">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Groupes d'entrainement</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                
                body {
                    font-family: 'Arial', sans-serif;
                    background: white;
                    color: #333;
                    padding: 12px;
                    line-height: 1.2;
                }
                
                .print-container {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 12px;
                    max-width: 210mm;
                    margin: 0 auto;
                }
                
                .group-card {
                    break-inside: avoid;
                    page-break-inside: avoid;
                    border: 1.5px solid #333;
                    padding: 10px;
                    background: #f9f9f9;
                    border-radius: 4px;
                }
                
                .group-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: baseline;
                    margin-bottom: 8px;
                    border-bottom: 1.5px solid #333;
                    padding-bottom: 4px;
                }
                
                .group-title {
                    font-size: 14px;
                    font-weight: bold;
                    color: #1a1a1a;
                }
                
                .group-count {
                    font-size: 11px;
                    color: #666;
                    font-weight: bold;
                }
                
                .player-list {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }
                
                .player-item {
                    font-size: 12px;
                    padding: 2px 4px;
                    background: white;
                    border-radius: 2px;
                    line-height: 1.3;
                }
                
                .player-name {
                    font-weight: 500;
                }
                
                .player-level {
                    color: #666;
                    font-size: 11px;
                    margin-left: 3px;
                }
                
                @media print {
                    body {
                        padding: 8px;
                        margin: 0;
                    }
                    .print-container {
                        gap: 10px;
                    }
                    .group-card {
                        break-inside: avoid;
                        page-break-inside: avoid;
                    }
                }
                
                @page {
                    size: A4;
                    margin: 8mm;
                }
            </style>
        </head>
        <body>
            <div class="print-container">
    `;
    
    // Add groups to HTML
    generatedGroups.forEach((group, i) => {
        printHTML += `
            <div class="group-card">
                <div class="group-header">
                    <div class="group-title">Groupe ${i + 1}</div>
                    <div class="group-count">${group.players.length}</div>
                </div>
                <div class="player-list">
        `;
        
        group.players.forEach(player => {
            printHTML += `
                <div class="player-item">
                    <span class="player-name">${player.nom} ${player.prenom}</span>
                    ${showNiveaux ? `<span class="player-level">(${player.niveau})</span>` : ''}
                </div>
            `;
        });
        
        printHTML += `
                </div>
            </div>
        `;
    });
    
    printHTML += `
            </div>
        </body>
        </html>
    `;
    
    // Open popup window
    const printWindow = window.open('', '_blank');
    printWindow.document.write(printHTML);
    printWindow.document.close();
    
    // Trigger print after a short delay to ensure content is rendered
    setTimeout(() => {
        printWindow.print();
    }, 250);
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
    btnPrintGroups.disabled = true;
    trainingSelect.selectedIndex = 0;
    groupCountInput.value = 3;
    if (playersPerGroupInput) playersPerGroupInput.value = '';
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