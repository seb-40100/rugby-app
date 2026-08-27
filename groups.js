// ============================================================
// CONFIGURATION
// ============================================================
const SPREADSHEET_ID = '16bfjaSFQIShF6jUNiQhh76gonKqdVlq6DRzdAOSSIQE';
const SHEET_NAME = 'presences';
let allPlayers = [];
let generatedGroups = [];

// ============================================================
// DOM ELEMENTS
// ============================================================
const btnGenerateGroups = document.getElementById('btnGenerateGroups');
const btnCopyGroups = document.getElementById('btnCopyGroups');
const groupCountInput = document.getElementById('groupCount');
const levelPrecisionSelect = document.getElementById('levelPrecision');
const respectBalanceCheckbox = document.getElementById('respectBalanceCheckbox');
const groupsStats = document.getElementById('groupsStats');
const groupsOutput = document.getElementById('groupsOutput');

// ============================================================
// LOAD DATA VIA GOOGLE SHEETS API (OAuth)
// ============================================================
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
            if (response.error) {
                console.error(response);
                return;
            }
            accessToken = response.access_token;
            btnGenerateGroups.disabled = true;
            showToast('Connexion réussie, chargement des données...', 'info');
            await loadSheetsData();
        }
    });
    btnGenerateGroups.disabled = false;
}

// Start as soon as the script loads
waitForGoogle();

// Set up connect button immediately (script is at end of body, DOM is ready)
const btnConnectSheets = document.getElementById('btnConnectSheets');
if (btnConnectSheets) {
    btnConnectSheets.addEventListener('click', () => {
        tokenClient.requestAccessToken({ prompt: 'consent' });
    });
}

async function loadSheetsData() {
    const range = encodeURIComponent(`'${SHEET_NAME}'!A:ZZ`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}`;
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const data = await response.json();
        if (!response.ok) {
            console.error('Sheets error:', data.error);
            showToast('Erreur : ' + (data.error?.message || 'impossible de lire la feuille'), 'error');
            return;
        }
        console.log('Réponse JSON complète :', JSON.stringify(data).substring(0, 200));
        allPlayers = parseSheetsJSON(data.values);
        console.log('Joueurs chargés :', allPlayers.length);
        if (allPlayers.length > 0) {
            showToast(`${allPlayers.length} joueurs chargés !`, 'success');
            btnGenerateGroups.disabled = false;
        } else {
            showToast('Aucun joueur trouvé dans la feuille.', 'error');
        }
    } catch (err) {
        console.error(err);
        showToast('Erreur réseau : ' + err.message, 'error');
    }
}

// ============================================================
// JSON PARSER
// ============================================================
function parseSheetsJSON(values) {
    console.log('parseSheetsJSON input:', values ? `${values.length} lignes` : 'null/undefined');
    if (!values || !Array.isArray(values) || values.length < 5) return [];

    // Find the header row (row with "Nom"), skip metadata rows
    let headerRowIndex = -1;
    for (let i = 0; i < values.length; i++) {
        if (values[i].length >= 5 && values[i][1] === 'Nom') {
            headerRowIndex = i;
            break;
        }
    }

    if (headerRowIndex === -1) return [];

    // Extract dates from header row (columns 5+)
    const dates = [];
    for (let c = 5; c < values[headerRowIndex].length; c++) {
        const cell = values[headerRowIndex][c];
        if (cell && !cell.includes('Bilan') && cell.trim() !== '') {
            dates.push(cell.trim());
        }
    }

    // Parse player rows
    const players = [];
    for (let r = headerRowIndex + 1; r < values.length; r++) {
        const row = values[r];
        if (!row || row.length < 5) continue;

        const nom = row[1]?.trim() || '';
        const prenom = row[2]?.trim() || '';
        const annee = row[3]?.trim() || '';
        const niveau = row[4]?.trim() || '';

        if (!nom) continue;

        // Check presence for each date column
        const presences = {};
        for (let c = 0; c < dates.length; c++) {
            const val = row[5 + c];
            presences[dates[c]] = parsePresenceVal(val);
        }

        // Count statuses
        let presentCount = 0;
        let absentCount = 0;
        let totalChecked = 0;

        for (const [date, status] of Object.entries(presences)) {
            if (status === 'P') {
                presentCount++;
                totalChecked++;
            } else if (status === 'A' || status === 'B') {
                absentCount++;
                totalChecked++;
            }
        }

        players.push({
            nom,
            prenom,
            fullName: `${prenom} ${nom}`,
            annee: annee ? parseInt(annee) : null,
            niveau: niveau,
            niveauNum: parseNiveau(niveau),
            presences,
            presentCount,
            absentCount,
            totalChecked,
            presenceRate: totalChecked > 0 ? presentCount / totalChecked : 0
        });
    }

    return players;
}

function parseNiveau(niveau) {
    if (!niveau) return 0;
    const map = { 'A': 3, 'B+': 2.5, 'B': 2, 'B-': 1.5, 'C+': 1.25, 'C': 1 };
    return map[niveau] || 0;
}

function parsePresenceVal(val) {
    if (!val) return '?';
    val = val.trim().toUpperCase();
    if (val.startsWith('P')) return 'P';
    if (val === 'A') return 'A';
    return '?';
}

// ============================================================
// GROUP GENERATION
// ============================================================
btnGenerateGroups.addEventListener('click', () => {
    if (allPlayers.length === 0) {
        showToast('Aucun joueur chargé.', 'info');
        return;
    }

    const numGroups = parseInt(groupCountInput.value) || 4;
    const precision = parseInt(levelPrecisionSelect.value);
    const respectBalance = respectBalanceCheckbox.checked;

    generatedGroups = generateGroups(allPlayers, numGroups, precision, respectBalance);
    renderGroups();
});

function generateGroups(players, numGroups, precision, respectBalance) {
    if (players.length === 0) return [];

    const groupSize = Math.ceil(players.length / numGroups);

    // Sort by niveau desc, then by presence rate desc for better mixing
    const sorted = [...players].sort((a, b) => {
        const cmp = b.niveauNum - a.niveauNum;
        return cmp !== 0 ? cmp : b.presenceRate - a.presenceRate;
    });

    // Alternate distribution: best in even groups, worst in odd groups (snake draft)
    const groups = Array.from({ length: numGroups }, () => []);

    for (let i = 0; i < sorted.length; i++) {
        // Pick which group to add to based on snake order
        const posInRound = i % numGroups;
        let targetGroup = posInRound;
        if (Math.floor(i / numGroups) % 2 === 1) {
            targetGroup = numGroups - 1 - posInRound;
        }

        // Apply balance consideration - if respecting balance, prefer groups with fewer presences
        if (respectBalance) {
            let bestGroup = targetGroup;
            let bestBalanceScore = Infinity;
            for (let g = 0; g < numGroups; g++) {
                const rateDiff = Math.abs(sorted[i].presenceRate - getAvgPresence(groups[g]) * 100);
                const sizeDiff = Math.abs(groups[g].length - groupSize);
                const score = rateDiff * 0.7 + sizeDiff * 30;
                if (score < bestBalanceScore) {
                    bestBalanceScore = score;
                    bestGroup = g;
                }
            }
            targetGroup = bestGroup;
        }

        groups[targetGroup].push(sorted[i]);
    }

    return groups;
}

function getAvgPresence(group) {
    if (group.length === 0) return 0;
    return group.reduce((sum, p) => sum + p.presenceRate, 0) / group.length;
}

function getAvgNiveau(group) {
    if (group.length === 0) return 0;
    return group.reduce((sum, p) => sum + p.niveauNum, 0) / group.length;
}

// ============================================================
// RENDER
// ============================================================
function renderGroups() {
    generatedGroups.forEach((group, i) => {
        const avgNiv = getAvgNiveau(group);
        const avgPres = getAvgPresence(group);

        const statsPanel = document.createElement('div');
        statsPanel.style.cssText = 'background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.05); border-radius: var(--radius-md); padding: 1rem; text-align: center; flex: 1;';
        statsPanel.innerHTML = `
            <div style="font-family: 'Outfit', sans-serif; font-size: 1.3rem; font-weight: 700; color: var(--primary); margin-bottom: 0.25rem;">Groupe ${i + 1}</div>
            <div style="font-size: 0.8rem; color: var(--text-secondary);">${group.length} joueurs · Niveau moyen : ${avgNiv.toFixed(1)} · Présence moy. : ${avgPres.toFixed(0)}%</div>
        `;
        groupsStats.appendChild(statsPanel);

        // Render group player list
        const groupDiv = document.createElement('div');
        groupDiv.style.cssText = 'background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.05); border-radius: var(--radius-md); padding: 1rem;';
        groupDiv.innerHTML = `<h4 style="margin-bottom: 0.5rem; font-size: 1rem; color: var(--primary);">Groupe ${i + 1}</h4>`;

        const playerList = document.createElement('div');
        playerList.style.gap = '0.25rem';
        playerList.style.cssText = 'display: flex; flex-direction: column;';
        groupDiv.appendChild(playerList);

        group.forEach(p => {
            const badge = getStatusBadge(p.presenceRate);
            const row = document.createElement('div');
            row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 0.35rem 0.5rem; border-radius: var(--radius-sm); font-size: 0.85rem;';
            row.style.background = p.presenceRate > 0.5 ? 'rgba(6,78,59,0.3)' : (p.presenceRate > 0 ? 'rgba(120,53,15,0.3)' : 'rgba(127,29,29,0.3)');
            row.innerHTML = `
                <span>${p.nom} ${p.prenom} <span style="color: var(--text-muted); font-size: 0.75rem;">(${p.niveau})</span></span>
                <span>${badge}</span>
            `;
            playerList.appendChild(row);
        });

        groupsOutput.appendChild(groupDiv);
    });

    btnCopyGroups.disabled = false;
}

function getStatusBadge(rate) {
    if (rate > 0.66) return '✅';
    if (rate > 0) return '⚠️';
    return '❌';
}

// ============================================================
// COPY
// ============================================================
btnCopyGroups.addEventListener('click', () => {
    let text = '=== GROUPES ===\n\n';
    generatedGroups.forEach((group, i) => {
        text += `GROUPE ${i + 1} (${group.length} joueurs, niveau moy. ${getAvgNiveau(group).toFixed(1)})\n`;
        group.forEach(p => {
            text += `  ${p.nom} ${p.prenom} (${p.niveau})\n`;
        });
        text += '\n';
    });

    navigator.clipboard.writeText(text).then(() => {
        showToast('Groupes copiés !', 'success');
    }).catch(() => {
        showToast('Erreur lors de la copie.', 'error');
    });
});

// ============================================================
// TOAST (simple inline)
// ============================================================
function showToast(message, type) {
    // Re-use existing toast from main JS if available
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
