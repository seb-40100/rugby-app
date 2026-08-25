        // State Management
        let players = [];

        // DOM Elements
        const rawTextInput = document.getElementById('rawTextInput');
        const btnProcess = document.getElementById('btnProcess');
        const btnExport = document.getElementById('btnExport');
        const btnCopyStatusCol = document.getElementById('btnCopyStatusCol');
        const btnResetAll = document.getElementById('btnResetAll');
        const playerTableBody = document.getElementById('playerTableBody');
        const headerCheckbox = document.getElementById('headerCheckbox');
        const previewCheckbox = document.getElementById('previewCheckbox');
        const csvPreview = document.getElementById('csvPreview');
        const toast = document.getElementById('toast');
        const toastMessage = document.getElementById('toastMessage');

        // Stats elements
        const statTotal = document.getElementById('statTotal');
        const statPresent = document.getElementById('statPresent');
        const statWaiting = document.getElementById('statWaiting');
        const statAbsent = document.getElementById('statAbsent');
        const statUnselected = document.getElementById('statUnselected');

        // Process button logic
        btnProcess.addEventListener('click', (e) => {
            e.preventDefault();
            const text = rawTextInput.value;
            if (!text.trim()) {
                showToast('Veuillez d\'abord coller du texte.', 'info');
                return;
            }
            parseAndDisplayList(text);
        });

        // Reset all application
        btnResetAll.addEventListener('click', (e) => {
            e.preventDefault();
            players = [];
            rawTextInput.value = '';
            renderTable();
            updateStats();
            updateCsvPreview();
            showToast('Application réinitialisée.', 'info');
        });

        // Copy status abbreviations column
        btnCopyStatusCol.addEventListener('click', () => {
            if (players.length === 0) return;
            
            const sortedPlayers = [...players].sort((a, b) => {
                const cmp = a.lastName.localeCompare(b.lastName, 'fr', { sensitivity: 'base' });
                return cmp !== 0 ? cmp : a.firstName.localeCompare(b.firstName, 'fr', { sensitivity: 'base' });
            });
            
            const statusText = sortedPlayers.map(p => {
                if (p.status === 'Présent') return 'P';
                if (p.status === 'En attente') return '?';
                if (p.status === 'Absent') return 'A';
                if (p.status === 'Non retenu') return 'N';
                return p.status;
            }).join('\r\n');
            
            navigator.clipboard.writeText(statusText).then(() => {
                showToast('Colonne des statuts copiée avec succès !', 'success');
            }).catch(err => {
                showToast('Erreur lors de la copie dans le presse-papiers.', 'error');
            });
        });

        // Toggle Live CSV Preview
        previewCheckbox.addEventListener('change', () => {
            if (previewCheckbox.checked) {
                csvPreview.classList.add('active');
                updateCsvPreview();
            } else {
                csvPreview.classList.remove('active');
            }
        });

        headerCheckbox.addEventListener('change', updateCsvPreview);

        // Smart Parser Function
        function parseInputText(text) {
            const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            let currentStatus = 'Présent';
            const parsedPlayers = [];

            // Keywords to match lines of exact status indicator
            const statusKeywords = {
                'Présent': [/^(présent|dispo|retenu|oui|présence|present|disponible|retenus|présents)$/i],
                'Absent': [/^(absent|indispo|non|absence|absents|indisponible|indisponibles)$/i],
                'En attente': [/^(attente|sans réponse|sans reponse|incertain|peut-être|peut-etre|\?)$/i],
                'Non retenu': [/^(non retenu|pas retenu|remplaçant|remplacant|non retenus|pas retenus|remplaçants)$/i]
            };

            // More lenient keywords for headers or inline parsing
            const generalKeywords = {
                'Présent': [/présent/i, /dispo/i, /retenu/i, /oui/i, /présence/i],
                'Absent': [/absent/i, /indispo/i, /non/i, /absence/i],
                'En attente': [/attente/i, /sans r/i, /incertain/i, /peut-être/i, /peut-etre/i, /\?/],
                'Non retenu': [/non retenu/i, /pas retenu/i, /rempla/i]
            };

            for (let i = 0; i < lines.length; i++) {
                let line = lines[i];

                // Ignore lines containing "avatar" (case-insensitive)
                if (line.toLowerCase().includes('avatar')) {
                    continue;
                }

                // Ignore lines containing "glisser-déposer un membre ici"
                if (line.toLowerCase().includes('glisser-déposer un membre ici') || 
                    line.toLowerCase().includes('glisser-deposer un membre ici')) {
                    continue;
                }

                // 1. Check if the line is exactly a status keyword (e.g. "Présent" alone)
                let exactStatus = null;
                for (const [status, regexes] of Object.entries(statusKeywords)) {
                    for (const regex of regexes) {
                        if (regex.test(line)) {
                            exactStatus = status;
                            break;
                        }
                    }
                    if (exactStatus) break;
                }

                if (exactStatus) {
                    // Update previous player's status if they were just added on the line above
                    if (parsedPlayers.length > 0) {
                        parsedPlayers[parsedPlayers.length - 1].status = exactStatus;
                    }
                    currentStatus = exactStatus;
                    continue;
                }

                // 2. Check if the line is a section header (e.g. "Présents (12)")
                let headerDetected = false;
                for (const [status, regexes] of Object.entries(generalKeywords)) {
                    for (const regex of regexes) {
                        if (regex.test(line)) {
                            const hasNumbersOrParen = /[\(\)\d]/.test(line);
                            const isShort = line.length < 25;
                            const cleanLine = line.replace(/[\d\(\)\s]/g, '').toLowerCase();
                            const statusNameClean = status.replace(/\s/g, '').toLowerCase();
                            
                            // Check if it is highly likely to be a header
                            if ((isShort && cleanLine.includes(statusNameClean)) || (hasNumbersOrParen && cleanLine.includes(statusNameClean))) {
                                currentStatus = status;
                                headerDetected = true;
                                break;
                            }
                        }
                    }
                    if (headerDetected) break;
                }

                if (headerDetected) {
                    continue;
                }

                // 3. Check if the line has inline status (e.g. "John Doe - Présent")
                let playerStatus = currentStatus;
                let playerName = line;
                let inlineStatusDetected = false;

                for (const [status, regexes] of Object.entries(generalKeywords)) {
                    for (const regex of regexes) {
                        if (regex.test(line)) {
                            const matchIndex = line.toLowerCase().search(regex);
                            // Avoid matching if there is no name preceding the status keyword
                            if (matchIndex > 0) {
                                const beforeMatch = line.substring(0, matchIndex);
                                // Check for common separators
                                if (/[-–—:,\(\[\{]/.test(line)) {
                                    playerName = beforeMatch.replace(/[-–—:,\(\[\{\s]+$/, '').trim();
                                    playerStatus = status;
                                    inlineStatusDetected = true;
                                    break;
                                }
                            }
                        }
                    }
                    if (inlineStatusDetected) break;
                }

                // Clean name: remove leading numbers, bullets, dots, spaces (e.g. "1. Dupont Jean" or "- Garcia Bruno" -> "Dupont Jean" / "Garcia Bruno")
                playerName = playerName.replace(/^[\d\s\.\-\*\•\)\/]+/, '').trim();

                // Remove trailing metadata like "(Capitaine)", "- Blessé", etc., for cleaner CSV
                playerName = playerName.replace(/\s*[-–—:\(].*$/, '').trim();

                // Skip lines that are too short, numbers-only, or look like dates/times/metadata
                if (playerName.length < 2 || /^\d+$/.test(playerName) || /^\d{2}[:h]\d{2}$/.test(playerName) || 
                    /^[a-zA-Z\s]+ \d{2}:\d{2}$/.test(playerName) || playerName.toLowerCase().includes('convocation') || 
                    playerName.toLowerCase().includes('match')) {
                    continue;
                }

                parsedPlayers.push({
                    name: playerName,
                    firstName: playerName.split(' ')[0] || playerName,
                    lastName: playerName.substring(playerName.indexOf(' ') + 1).trim() || playerName,
                    status: playerStatus
                });
            }

            return parsedPlayers;
        }

        // Parse & display logic
        function parseAndDisplayList(text) {
            let parsed = parseInputText(text);
            if (parsed.length === 0) {
                showToast("Aucun joueur n'a pu être détecté dans ce texte.", 'error');
                return;
            }
            // Remove duplicate "En attente" for Bricka, Hacini, Lopez
            const specialNames = ['bricka', 'hacini', 'lopez'];
            parsed = parsed.filter((p, i) => {
                const baseName = p.lastName.split(' ')[0].toLowerCase();
                if (!specialNames.some(name => baseName.includes(name))) return true;
                if (p.status === 'En attente') {
                    const hasOther = parsed.some((other, j) => {
                        if (j === i) return false;
                        const otherBase = other.lastName.split(' ')[0].toLowerCase();
                        return otherBase === baseName && other.status !== 'En attente';
                    });
                    if (hasOther) return false;
                }
                return true;
            });

            // Sort players alphabetically by last name (case-insensitive)
            parsed.sort((a, b) => {
                const cmp = a.lastName.localeCompare(b.lastName, 'fr', { sensitivity: 'base' });
                return cmp !== 0 ? cmp : a.firstName.localeCompare(b.firstName, 'fr', { sensitivity: 'base' });
            });
            players = parsed;
            renderTable();
            updateStats();
            updateCsvPreview();
            showToast(`${players.length} joueurs détectés avec succès !`, 'success');
        }

        // Calculate and display statistics
        function updateStats() {
            const counts = {
                'Total': players.length,
                'Présent': 0,
                'En attente': 0,
                'Absent': 0,
                'Non retenu': 0
            };

            players.forEach(p => {
                if (counts[p.status] !== undefined) {
                    counts[p.status]++;
                }
            });

            statTotal.innerText = counts['Total'];
            statPresent.innerText = counts['Présent'];
            statWaiting.innerText = counts['En attente'];
            statAbsent.innerText = counts['Absent'];
            statUnselected.innerText = counts['Non retenu'];

            // Disable export/copy if list is empty
            const listIsEmpty = (players.length === 0);
            btnExport.disabled = listIsEmpty;
            btnCopyStatusCol.disabled = listIsEmpty;
        }

        // Render table rows
        function renderTable() {
            playerTableBody.innerHTML = '';

            if (players.length === 0) {
                playerTableBody.innerHTML = `
                    <tr class="table-empty-row">
                        <td colspan="2">
                            <div class="empty-state">
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                </svg>
                                <div>Aucun joueur dans la liste.</div>
                            </div>
                        </td>
                    </tr>`;
                return;
            }

            players.forEach((player, index) => {
                const originalIndex = players.indexOf(player);
                const tr = document.createElement('tr');
                
                // Name Input cell
                const tdName = document.createElement('td');
                const nameInput = document.createElement('input');
                nameInput.type = 'text';
                nameInput.value = player.name;
                nameInput.className = 'player-name-input';
                nameInput.addEventListener('change', (e) => {
                    players[originalIndex].name = e.target.value.trim();
                    updateCsvPreview();
                });
                tdName.appendChild(nameInput);

                // Status dropdown cell
                const tdStatus = document.createElement('td');
                const select = document.createElement('select');
                select.className = `status-select ${getStatusClass(player.status)}`;
                
                const statuses = ['Présent', 'En attente', 'Absent', 'Non retenu'];
                statuses.forEach(status => {
                    const opt = document.createElement('option');
                    opt.value = status;
                    opt.innerText = status;
                    opt.selected = (player.status === status);
                    select.appendChild(opt);
                });

                select.addEventListener('change', (e) => {
                    const newStatus = e.target.value;
                    players[originalIndex].status = newStatus;
                    select.className = `status-select ${getStatusClass(newStatus)}`;
                    updateStats();
                    updateCsvPreview();
                });
                tdStatus.appendChild(select);

                tr.appendChild(tdName);
                tr.appendChild(tdStatus);
                playerTableBody.appendChild(tr);
            });
        }

        function getStatusClass(status) {
            switch(status) {
                case 'Présent': return 'present';
                case 'Absent': return 'absent';
                case 'En attente': return 'waiting';
                default: return 'unselected';
            }
        }

        // Generate CSV String
        function generateCSV() {
            const separator = ';';
            const includeHeader = headerCheckbox.checked;
            let rows = [];

            if (includeHeader) {
                rows.push(['Nom', 'Statut'].join(separator));
            }

            // Create a copy and sort players alphabetically by last name (case-insensitive)
            const sortedPlayers = [...players].sort((a, b) => {
                const cmp = a.lastName.localeCompare(b.lastName, 'fr', { sensitivity: 'base' });
                return cmp !== 0 ? cmp : a.firstName.localeCompare(b.firstName, 'fr', { sensitivity: 'base' });
            });

            sortedPlayers.forEach(p => {
                // Escape quotes inside name if any
                const escapedName = p.name.replace(/"/g, '""');
                // Wrap in double quotes if name contains separator or quotes
                const formattedName = escapedName.includes(separator) || escapedName.includes('"') 
                    ? `"${escapedName}"` 
                    : escapedName;
                
                // Replace status values with abbreviations
                let statusAbbr = p.status;
                if (p.status === 'Présent') statusAbbr = 'P';
                else if (p.status === 'En attente') statusAbbr = '?';
                else if (p.status === 'Absent') statusAbbr = 'A';
                else if (p.status === 'Non retenu') statusAbbr = 'N';

                rows.push([formattedName, statusAbbr].join(separator));
            });

            return rows.join('\r\n');
        }

        // Update preview field
        function updateCsvPreview() {
            if (!previewCheckbox.checked || players.length === 0) return;
            const csv = generateCSV();
            csvPreview.innerText = csv;
        }

        // Toast notifications logic
        let toastTimeout;
        function showToast(message, type = 'success') {
            clearTimeout(toastTimeout);
            toastMessage.innerText = message;
            toast.className = 'toast show';
            if (type === 'success') toast.classList.add('toast-success');
            if (type === 'info') toast.classList.add('toast-info');

            toastTimeout = setTimeout(() => {
                toast.classList.remove('show');
            }, 4000);
        }

        // Copy CSV to clipboard
        btnExport.addEventListener('click', () => {
            if (players.length === 0) return;
            
            const csvContent = generateCSV();
            
            navigator.clipboard.writeText(csvContent).then(() => {
                showToast('CSV copié dans le presse-papiers !', 'success');
            }).catch(() => {
                showToast('Erreur lors de la copie dans le presse-papiers.', 'error');
            });
        });
