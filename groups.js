const GOOGLE_CLIENT_ID = '517412786952-ocuhpuucqitb90g6dkruo9nvqfnauvts.apps.googleusercontent.com';
const SPREADSHEET_ID = '16bfjaSFQIShF6jUNiQhh76gonKqdVlq6DRzdAOSSIQE';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets.readonly';

let tokenClient;
let accessToken = null;

const btnConnect = document.getElementById('btnConnect');
const jsonOutput = document.getElementById('jsonOutput');
const groupsStatus = document.getElementById('groups-status');

// Wait for Google Identity Services
function waitForGoogle() {
    if (window.google && google.accounts && google.accounts.oauth2) {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: SCOPES,
            callback: async (response) => {
                if (response.error) {
                    showError('Erreur d\'authentification Google.');
                    return;
                }
                accessToken = response.access_token;
                btnConnect.textContent = 'Données chargées';
                btnConnect.disabled = true;
                groupsStatus.style.display = 'none';
                jsonOutput.style.display = 'block';
                await loadSheetsData();
            }
        });
    } else {
        setTimeout(waitForGoogle, 100);
    }
}

btnConnect.addEventListener('click', () => {
    if (!tokenClient) {
        showError("Google Identity Services n'est pas encore chargé.");
        return;
    }
    btnConnect.textContent = 'Connexion...';
    tokenClient.requestAccessToken({ prompt: 'consent' });
});

async function loadSheetsData() {
    const range = encodeURIComponent('\'présences\'!A:ZZ');
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const data = await response.json();

        if (!response.ok) {
            if (response.status === 401) {
                accessToken = null;
                showError('Session expirée. reconnectez-vous.');
            } else {
                showError(data.error?.message || 'Erreur Google Sheets.');
            }
            return;
        }

        jsonOutput.textContent = JSON.stringify(data, null, 2);
        groupsStatus.textContent = 'Données récupérées avec succès.';
        groupsStatus.style.display = 'block';
    } catch (error) {
        showError('Erreur réseau.');
        console.error(error);
    }
}

function showError(message) {
    groupsStatus.textContent = '❌ ' + message;
    groupsStatus.style.display = 'block';
    btnConnect.textContent = 'Se connecter';
    btnConnect.disabled = false;
}

waitForGoogle();
