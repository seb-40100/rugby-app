const JSON_URL = 'https://script.google.com/macros/s/AKfycbwtvTP19_ISw8AZ34J4FNuY54bkmUKFN1FRkuZ_qa7Mq2QyXFg0fTEI2t92TBy5eIeH/exec';
const CORS_PROXY = 'https://api.allorigins.win/raw?url=';
const btnLoadData = document.getElementById('btnLoadData');
const jsonOutput = document.getElementById('jsonOutput');

btnLoadData.addEventListener('click', async () => {
    btnLoadData.disabled = true;
    btnLoadData.textContent = 'Chargement...';
    jsonOutput.textContent = '';
    
    try {
        const response = await fetch(CORS_PROXY + encodeURIComponent(JSON_URL));
        const data = await response.json();
        jsonOutput.textContent = JSON.stringify(data, null, 2);
    } catch (err) {
        jsonOutput.textContent = 'Erreur lors du chargement : ' + err.message;
    } finally {
        btnLoadData.disabled = false;
        btnLoadData.innerHTML = '<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg> Charger les données';
    }
});
