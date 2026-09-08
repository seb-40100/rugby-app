const SPREADSHEET_ID = '16bfjaSFQIShF6jUNiQhh76gonKqdVlq6DRzdAOSSIQE';
const SHEET_NAME = 'presences';
let allPlayers = [];
let trainingDates = [];
let generatedGroups = [];
let showNiveaux = false;

const trainingSelect = document.getElementById('trainingSelect');
const groupCountInput = document.getElementById('groupCount');
const targetLevelsContainer = document.getElementById('targetLevels');
const btnGenerateGroups = document.getElementById('btnGenerateGroups');
const btnCopyGroups = document.getElementById('btnCopyGroups');
const btnReset = document.getElementById('btnReset');
const btnPrintGroups = document.getElementById('btnPrintGroups');
const btnToggleLevels = document.getElementById('btnToggleLevels');
const groupsOutput = document.getElementById('groupsOutput');

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
            updateTargetSizesDefault();
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

    const dateIndices = [];
    const dates = [];
    console.log('headerRow:', values[headerRowIndex]);
    for (let c = 5; c < values[headerRowIndex].length; c++) {
        const cell = values[headerRowIndex][c]?.trim();
        console.log('cell', c, ':', JSON.stringify(cell));
        if (cell && !cell.includes('Bilan') && cell.length > 0 && !/^\d+$/.test(cell)) {
            dates.push(cell);
            dateIndices.push(c);
        }
    }
    console.log('extracted dates:', dates, 'indices:', dateIndices);

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
            const val = row[dateIndices[c]];
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
    updateTargetSizesDefault();
});
trainingSelect.addEventListener('change', () => {
    btnGenerateGroups.disabled = false;
    updateTargetSizesDefault();
});
buildTargetLevelSelects();

// Build target level selects AND per-group size inputs
function buildTargetLevelSelects() {
    const num = Math.max(2, Math.min(10, parseInt(groupCountInput.value) || 3));
    targetLevelsContainer.innerHTML = '';
    for (let i = 0; i < num; i++) {
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.35rem;';
        row.innerHTML = `<span style="color: var(--text-muted); font-size: 0.85rem; width: 70px;">Groupe ${i+1}</span>`;
        const sel = document.createElement('select');
        sel.className = 'targetLevelSelect';
        sel.style.cssText = 'flex: 1; background: rgba(0,0,0,0.12); border: 1px solid rgba(255,255,255,0.06); border-radius:4px; padding:0.35rem; color: white; font-weight: 600;';
        ['A', 'B', 'C'].forEach(lvl => {
            const opt = document.createElement('option');
            opt.value = lvl;
            opt.textContent = lvl;
            opt.style.cssText = 'background: #333; color: white;';
            sel.appendChild(opt);
        });
        sel.value = 'C';

        const sizeInput = document.createElement('input');
        sizeInput.type = 'number';
        sizeInput.min = '0';
        sizeInput.step = '1';
        sizeInput.className = 'targetSizeInput';
        sizeInput.style.cssText = 'width:80px; padding:0.25rem; background: rgba(0,0,0,0.12); border-radius:4px; border:1px solid rgba(255,255,255,0.06); color: white;';
        sizeInput.placeholder = ''; // will be set by updateTargetSizesDefault

        row.appendChild(sel);
        row.appendChild(sizeInput);
        targetLevelsContainer.appendChild(row);
    }
}

// Propose defaults for each group's size input based on present players & number of groups
function updateTargetSizesDefault() {
    const selectedTraining = trainingSelect.value;
    const numGroups = Math.max(2, Math.min(10, parseInt(groupCountInput.value) || 3));
    const sizeInputs = Array.from(document.querySelectorAll('.targetSizeInput'));
    if (!selectedTraining || sizeInputs.length === 0) {
        sizeInputs.forEach(inp => { inp.placeholder = ''; });
        return;
    }
    const presentPlayers = allPlayers.filter(p => p.presences[selectedTraining] === 'P');
    const total = presentPlayers.length;
    if (total === 0) {
        sizeInputs.forEach(inp => { inp.placeholder = ''; inp.value = ''; });
        return;
    }
    // default: ceil(total / groups)
    const defaultVal = Math.ceil(total / numGroups);
    sizeInputs.forEach(inp => {
        inp.placeholder = String(defaultVal);
        if (!inp.value) inp.value = defaultVal;
    });
}

// UTIL: Fisher–Yates shuffle (in-place)
function shuffleInPlace(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Rule matrix:
// Group A: allowed ['A', 'B+', 'B'] (forbidden 'B-', 'C')
// Group B: allowed ['B+', 'B', 'B-'] (forbidden 'A', 'C')
// Group C: allowed ['B', 'B-', 'C'] (forbidden 'A', 'B+')
function isLevelAllowed(playerLevel, groupTarget) {
    if (groupTarget === 'A') return ['A', 'B+', 'B'].includes(playerLevel);
    if (groupTarget === 'B') return ['B+', 'B', 'B-'].includes(playerLevel);
    if (groupTarget === 'C') return ['B', 'B-', 'C'].includes(playerLevel);
    return true;
}

function assignPlayerToBestGroup(player, groups) {
    // 1. Filtrer les groupes autorisés selon les règles strictes de niveau
    let allowedGroups = groups
        .map((g, index) => ({ group: g, index }))
        .filter(({ group }) => isLevelAllowed(player.niveau, group.target));

    // Fallback si aucun groupe adapté n'existe dans la sélection globale
    if (allowedGroups.length === 0) {
        allowedGroups = groups.map((g, index) => ({ group: g, index }));
    }

    // 2. Chercher parmi les groupes autorisés ceux qui ont encore de la place
    const groupsWithSpace = allowedGroups.filter(
        ({ group }) => group.players.length < group.capacity
    );

    // Si de la place est disponible, on choisit parmi ceux-ci.
    // Sinon, on accepte d'élargir la capacité des groupes autorisés pour respecter les niveaux.
    const candidatePool = groupsWithSpace.length > 0 ? groupsWithSpace : allowedGroups;

    // 3. Calculer un score pour départager les candidats
    let minScore = Infinity;
    const scored = candidatePool.map(({ group, index }) => {
        const levelDiff = Math.abs(player.niveauNum - group.targetNum);
        const fillMetric = group.capacity > 0 
            ? (group.players.length / group.capacity) 
            : group.players.length;
        // Priorité 1 : écart de niveau minimal (poids 100)
        // Priorité 2 : taux de remplissage le plus faible pour équilibrer (poids 10)
        const score = (levelDiff * 100) + (fillMetric * 10);
        if (score < minScore) minScore = score;
        return { index, score };
    });

    const EPS = 0.001;
    const bestCandidates = scored.filter(s => s.score <= minScore + EPS).map(s => s.index);
    const chosenGroupIndex = bestCandidates[Math.floor(Math.random() * bestCandidates.length)];

    groups[chosenGroupIndex].players.push({ nom: player.nom, prenom: player.prenom, niveau: player.niveau });
}

function generateGroups() {
    const selectedTraining = trainingSelect.value;
    if (!selectedTraining) { showToast('Sélectionne un entraînement.', 'info'); return; }

    const numGroups = Math.max(2, Math.min(10, parseInt(groupCountInput.value) || 3));
    const targetLevels = Array.from(document.querySelectorAll('.targetLevelSelect')).map(s => s.value);
    while (targetLevels.length < numGroups) targetLevels.push('C');

    const sizeInputs = Array.from(document.querySelectorAll('.targetSizeInput'));
    if (sizeInputs.length < numGroups) {
        showToast('Erreur interne: inputs de taille manquants.', 'error');
        return;
    }

    const presentPlayers = allPlayers.filter(p => p.presences[selectedTraining] === 'P');
    if (presentPlayers.length < 1) { showToast('Pas de joueurs présents.', 'error'); return; }

    // Parse capacities per group from inputs
    const sizes = sizeInputs.map((inp, i) => {
        const v = parseInt(inp.value);
        return isNaN(v) || v < 0 ? 0 : v;
    });

    const totalCapacity = sizes.reduce((a, b) => a + b, 0);
    const totalPlayers = presentPlayers.length;
    if (totalCapacity < totalPlayers) {
        showToast(`Capacité insuffisante : capacité totale ${totalCapacity} < ${totalPlayers} joueurs présents. Augmente les tailles ou le nombre de groupes.`, 'error');
        return;
    }

    // Prepare players: group by level and shuffle within same level
    const levelsOrder = ['A', 'B+', 'B', 'B-', 'C'];
    const byLevel = {};
    levelsOrder.forEach(l => byLevel[l] = []);
    presentPlayers.forEach(p => {
        if (!byLevel[p.niveau]) byLevel[p.niveau] = [];
        byLevel[p.niveau].push(p);
    });
    levelsOrder.forEach(l => shuffleInPlace(byLevel[l]));

    const targetNum = {'A': 3, 'B': 2, 'C': 1};
    const groups = targetLevels.map((t, i) => ({
        target: t, targetNum: targetNum[t], players: [], capacity: sizes[i] || 0
    }));

    // Répartition par ordre de contrainte (Most Constrained First) :
    // 1. Joueurs les plus contraints : 'A' (Groupe A uniquement) et 'C' (Groupe C uniquement)
    const priority1 = [...byLevel['A'], ...byLevel['C']];
    priority1.forEach(p => assignPlayerToBestGroup(p, groups));

    // 2. Joueurs à flexibilité intermédiaire : 'B+' (Groupes A ou B) et 'B-' (Groupes B ou C)
    const priority2 = [...byLevel['B+'], ...byLevel['B-']];
    shuffleInPlace(priority2);
    priority2.forEach(p => assignPlayerToBestGroup(p, groups));

    // 3. Joueurs les plus flexibles : 'B' (Groupes A, B ou C, avec priorité naturelle pour le Groupe B)
    const priority3 = [...byLevel['B']];
    priority3.forEach(p => assignPlayerToBestGroup(p, groups));

    // Vérification des dépassements éventuels ou incompatibilités forcées
    let overflowCount = 0;
    let incompatibleCount = 0;
    groups.forEach((g) => {
        if (g.players.length > g.capacity) {
            overflowCount += (g.players.length - g.capacity);
        }
        g.players.forEach(p => {
            if (!isLevelAllowed(p.niveau, g.target)) {
                incompatibleCount++;
            }
        });
    });

    // Final sort inside groups for stable display (alphabetical)
    groups.forEach(g => g.players.sort((a, b) => a.nom.localeCompare(b.nom)));

    generatedGroups = groups;
    btnToggleLevels.disabled = false;
    renderGroups();

    if (incompatibleCount > 0) {
        showToast(`Attention : ${incompatibleCount} joueur(s) n'ont pas pu respecter les règles de niveau (aucun groupe adapté configuré).`, 'info');
    } else if (overflowCount > 0) {
        showToast(`Groupes générés ! (${overflowCount} place(s) excédentaire(s) pour respecter les niveaux)`, 'info');
    }
}

function renderGroups() {
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

// Toggle levels button
btnToggleLevels.addEventListener('click', () => {
    if (generatedGroups.length === 0) {
        showToast('Génère d\'abord les groupes.', 'info');
        return;
    }
    showNiveaux = !showNiveaux;
    btnToggleLevels.textContent = showNiveaux ? '🙈 Masquer les niveaux' : '👁️ Afficher les niveaux';
    renderGroups();
});

// PRINT - Optimized popup with A4 layout in 2 columns (compact for single page)
btnPrintGroups.addEventListener('click', () => {
    
    // Create HTML content for print
    let printHTML = `
        <!DOCTYPE html>
        <html lang="fr">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Groupes d'entrainement</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: 'Arial', sans-serif; background: white; color: #333; padding: 12px; line-height: 1.2; }
                .print-container { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; max-width: 210mm; margin: 0 auto; }
                .group-card { break-inside: avoid; page-break-inside: avoid; border: 1.5px solid #333; padding: 10px; background: #f9f9f9; border-radius: 4px; }
                .group-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; border-bottom: 1.5px solid #333; padding-bottom: 4px; }
                .group-title { font-size: 14px; font-weight: bold; color: #1a1a1a; }
                .group-count { font-size: 11px; color: #666; font-weight: bold; }
                .group-level { font-size: 11px; color: white; background: #333; padding: 2px 6px; border-radius: 3px; font-weight: bold; }
                .player-list { display: flex; flex-direction: column; gap: 2px; }
                .player-item { font-size: 12px; padding: 2px 4px; background: white; border-radius: 2px; line-height: 1.3; }
                .player-name { font-weight: 500; }
                .player-level { color: #666; font-size: 11px; margin-left: 3px; }
                @media print { body { padding: 8px; margin: 0; } .print-container { gap: 10px; } .group-card { break-inside: avoid; page-break-inside: avoid; } }
                @page { size: A4; margin: 8mm; }
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
                    <div class="group-count">${group.players.length} joueurs</div>
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
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(printHTML);
    printWindow.document.close();
    //setTimeout(() => printWindow.print(), 250);
});

// COPY
btnCopyGroups.addEventListener('click', () => {
    let text = '';
    generatedGroups.forEach((g, i) => {
        text += `GROUPE ${i+1} (niveau ${g.target}) - cible ${g.capacity}\n${g.players.length} joueurs\n`;
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
    btnToggleLevels.disabled = true;
    btnToggleLevels.textContent = '👁️ Afficher les niveaux';
    showNiveaux = false;
    trainingSelect.selectedIndex = 0;
    groupCountInput.value = 3;
    buildTargetLevelSelects();
    updateTargetSizesDefault();
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