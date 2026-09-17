const config = await fetch('/config.json').then((response) => response.json());
const code = new URL(location.href).searchParams.get('code');
if (!code) throw new Error('Authorization code is missing');
const verifier = sessionStorage.getItem('pkce_verifier');
const body = new URLSearchParams({ grant_type: 'authorization_code', client_id: config.clientId, code, redirect_uri: config.redirectUri, code_verifier: verifier });
const result = await fetch(`${config.authDomain}/oauth2/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body }).then((response) => response.json());
sessionStorage.removeItem('pkce_verifier'); localStorage.setItem('meeting_memory_tokens', JSON.stringify(result)); location.replace('/');
