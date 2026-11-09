// Private preview gate for the OWO site (theowo.com redesign + DXB100).
// Every request runs through this Worker first (assets.run_worker_first = true).
// Visitors without the access cookie see a branded sign-in page; the access code
// itself is never stored, only a salted SHA-256 hash (PREVIEW_SALT / PREVIEW_HASH in wrangler.jsonc).

const COOKIE = 'owo_preview';
const SESSION_SECONDS = 15 * 60; // each unlock lasts 15 minutes
const OPEN_PATHS = new Set(['/favicon.png', '/apple-touch-icon.png', '/og-image.jpg']);
const enc = new TextEncoder();

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
const normalise = s => String(s || '').trim().toLowerCase().replace(/\s+/g, '');
function readCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(/;\s*/)) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i) === name) return part.slice(i + 1);
  }
  return null;
}
function sameString(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
// Session cookie = "<expiry>.<signature>": the expiry is checked here on every request,
// so a visitor cannot extend their 15 minutes by keeping or editing the cookie.
const sign = (env, exp) => sha256('owo-preview-session:' + env.PREVIEW_HASH + ':' + exp);
async function makeToken(env, exp) { return exp + '.' + await sign(env, exp); }
async function validUntil(env, value) {
  if (!value || value.indexOf('.') < 1) return 0;
  const [e, sig] = value.split('.');
  const exp = parseInt(e, 10);
  if (!exp || exp * 1000 <= Date.now()) return 0;
  return sameString(sig, await sign(env, exp)) ? exp : 0;
}
function withoutSessionFlag(url) { const u = new URL(url); u.searchParams.delete('session'); return u.pathname + u.search; }
// Copy deterrents, added only while the site is a locked preview (removing the lock removes them):
// no right-click, text selection, image dragging, copy, save, print or view-source shortcuts.
// They stop casual copying; nothing shown in a browser can be fully protected.
const PREVIEW_GUARD = `<style>
body{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
input,textarea,select,[contenteditable]{-webkit-user-select:text;user-select:text}
img,svg,canvas{-webkit-user-drag:none;user-drag:none}
@media print{body>*{display:none!important}body::after{content:"This private preview cannot be printed.";display:block;padding:48px;font:16px/1.5 Georgia,serif}}
</style><script>(function(){
var editable=function(t){return t&&t.closest&&t.closest('input,textarea,select,[contenteditable]');};
['contextmenu','dragstart','copy','cut','selectstart'].forEach(function(ev){document.addEventListener(ev,function(e){if(!editable(e.target))e.preventDefault();},true);});
document.addEventListener('keydown',function(e){var k=(e.key||'').toLowerCase(),m=e.metaKey||e.ctrlKey;
if(k==='f12'||(m&&['s','u','p'].indexOf(k)>-1)||(m&&e.shiftKey&&['i','j','c'].indexOf(k)>-1)||(e.metaKey&&e.altKey&&['i','j','c','u'].indexOf(k)>-1)||(m&&k==='a'&&!editable(e.target))){e.preventDefault();e.stopPropagation();}},true);
})();</script>`;
// Sends the open page back to the sign-in screen the moment its 15 minutes run out.
const expiryScript = ms => `<script>(function(){var end=Date.now()+${Math.max(0, Math.floor(ms))};function done(){var u=new URL(location.href);u.searchParams.set('session','ended');u.hash='';location.replace(u.toString());}function check(){if(Date.now()>=end)done();}setTimeout(check,${Math.max(0, Math.floor(ms))}+600);setInterval(check,20000);document.addEventListener('visibilitychange',function(){if(!document.hidden)check();});})();</script>`;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const LOGO = `<span class="wordmark">OWO</span>`;

function lockPage(url, next, failed, ended) {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>OWO — Private preview</title>
<meta name="robots" content="noindex, nofollow">
<meta name="description" content="A private preview, shared by invitation.">
<meta property="og:type" content="website">
<meta property="og:title" content="OWO — The Office of Performance Architecture">
<meta property="og:description" content="A private preview, shared by invitation.">
<meta property="og:image" content="${esc(url.origin)}/og-image.jpg">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0A0A0B">
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=Cormorant+Garamond:ital,wght@0,400;1,400&family=Inter:wght@400;500;600&display=swap">
<style>
:root{--bg:#0A0A0B;--ink:#F3EEE4;--muted:#B9B2A6;--line:rgba(243,238,228,.16);--gold:#D9AE5F;--warn:#E8A06A;color-scheme:dark}
*{box-sizing:border-box}
html,body{margin:0;min-height:100%}
body{min-height:100dvh;display:grid;place-items:center;background:radial-gradient(110% 70% at 50% -10%,rgba(217,174,95,.2),rgba(217,174,95,0) 60%),#0A0A0B;color:var(--ink);font:400 16px/1.6 Inter,system-ui,sans-serif;padding:calc(32px + env(safe-area-inset-top,0px)) max(20px,env(safe-area-inset-right,0px)) calc(32px + env(safe-area-inset-bottom,0px)) max(20px,env(safe-area-inset-left,0px));overflow:hidden}
canvas{position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;opacity:.55}
main{width:min(440px,100%);display:grid;gap:26px;justify-items:center;text-align:center;position:relative;z-index:1}
.wordmark{font-family:Archivo,sans-serif;font-stretch:125%;font-weight:800;font-size:44px;letter-spacing:.05em;color:var(--ink);line-height:1}
.sub{font-family:"Cormorant Garamond",Georgia,serif;font-style:italic;font-size:18px;color:var(--muted);margin-top:-14px}
h1{font-family:"Cormorant Garamond",Georgia,serif;font-weight:400;font-size:clamp(38px,9vw,52px);line-height:1.02;margin:4px 0 0}
h1 em{color:var(--gold)}
p{margin:0;color:var(--muted);max-width:36ch}
form{width:100%;display:grid;gap:14px;margin-top:4px}
label{font-size:12px;color:var(--gold);text-align:left;letter-spacing:.28em;text-transform:uppercase}
.field{display:flex;border:1px solid var(--line);border-radius:999px;background:rgba(255,255,255,.04);transition:border-color .2s;padding-left:8px}
.field:focus-within{border-color:var(--gold)}
input{flex:1;min-width:0;background:none;border:0;color:var(--ink);font:500 18px/1 Inter,sans-serif;padding:16px 16px;letter-spacing:.06em}
input:focus{outline:none}
.show{background:none;border:0;color:var(--muted);font:500 13px Inter,sans-serif;padding:0 18px;cursor:pointer}
.show:focus-visible,button[type=submit]:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
button[type=submit]{height:54px;border:0;border-radius:999px;background:var(--gold);color:#0A0A0B;font:700 14px/1 Archivo,sans-serif;font-stretch:125%;letter-spacing:.18em;cursor:pointer;transition:transform .2s,box-shadow .2s}
button[type=submit]:hover{transform:translateY(-2px);box-shadow:0 16px 40px -14px rgba(217,174,95,.7)}
.err{color:var(--warn);font-size:14px;text-align:left}
.foot{font-size:13px;color:var(--muted);line-height:1.8}
.foot span{color:var(--ink);white-space:nowrap}
.coords{font-size:11px;letter-spacing:.32em;color:var(--gold);opacity:.8}
</style>
</head>
<body>
<canvas id="n" aria-hidden="true"></canvas>
<main>
  <div role="img" aria-label="OWO">${LOGO}</div>
  <div class="sub">The Office of Performance Architecture</div>
  <div style="display:grid;gap:12px;justify-items:center">
    <h1>Private <em>preview</em></h1>
    ${ended ? '<p>Your 15-minute preview has ended. Enter the access code again to continue.</p>' : '<p>This presentation has been shared with you personally. Enter the access code from your invitation to continue.</p>'}
  </div>
  <form method="post" action="/__unlock" autocomplete="off">
    <label for="code">Access code</label>
    <div class="field"><input id="code" name="code" type="password" required autofocus autocapitalize="off" autocorrect="off" spellcheck="false" aria-describedby="${failed ? 'err' : ''}"><button class="show" type="button" id="show" aria-pressed="false">Show</button></div>
    ${failed ? '<p class="err" id="err" role="alert">That code is not right. Check your invitation and try again.</p>' : ''}
    <input type="hidden" name="next" value="${esc(next)}">
    <button type="submit">ENTER</button>
  </form>
  <p class="foot">OWO · Dubai, United Arab Emirates<br>Need access? <span>Ask Ledon</span></p>
  <p class="coords">25.2048° N · 55.2708° E</p>
</main>
<script>
document.getElementById('show').addEventListener('click',function(){var i=document.getElementById('code'),on=i.type==='password';i.type=on?'text':'password';this.textContent=on?'Hide':'Show';this.setAttribute('aria-pressed',String(on));i.focus();});
(function(){var c=document.getElementById('n'),x=c.getContext('2d'),W,H,P=[],N=70,d=Math.min(devicePixelRatio||1,2);
function sz(){W=innerWidth;H=innerHeight;c.width=W*d;c.height=H*d;x.setTransform(d,0,0,d,0,0);}sz();addEventListener('resize',sz);
for(var i=0;i<N;i++)P.push({x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-.5)*.25,vy:(Math.random()-.5)*.25});
if(matchMedia('(prefers-reduced-motion: reduce)').matches)N=0;
(function f(){requestAnimationFrame(f);x.clearRect(0,0,W,H);var D=150;
for(var i=0;i<P.length;i++){var p=P[i];p.x+=p.vx;p.y+=p.vy;if(p.x<0||p.x>W)p.vx*=-1;if(p.y<0||p.y>H)p.vy*=-1;}
for(i=0;i<P.length;i++)for(var j=i+1;j<P.length;j++){var a=P[i],b=P[j],dd=Math.hypot(a.x-b.x,a.y-b.y);if(dd<D){x.strokeStyle='rgba(217,174,95,'+((1-dd/D)*.35).toFixed(3)+')';x.beginPath();x.moveTo(a.x,a.y);x.lineTo(b.x,b.y);x.stroke();}}
x.fillStyle='rgba(217,174,95,.85)';P.forEach(function(p){x.beginPath();x.arc(p.x,p.y,1.6,0,6.283);x.fill();});})();})();
</script>
</body>
</html>`;
  return new Response(html, {
    status: failed ? 401 : 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'same-origin' }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/robots.txt') {
      return new Response('User-agent: *\nDisallow: /\n', { headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } });
    }
    // Icons and the link-preview image stay public so shared links still show the brand.
    if (OPEN_PATHS.has(url.pathname)) return env.ASSETS.fetch(request);

    if (url.pathname === '/__unlock') {
      if (request.method !== 'POST') return Response.redirect(url.origin + '/', 303);
      let code = '', next = '/';
      try { const form = await request.formData(); code = form.get('code') || ''; next = form.get('next') || '/'; } catch (e) {}
      if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/__unlock')) next = '/';
      const hash = await sha256(env.PREVIEW_SALT + ':' + normalise(code));
      if (sameString(hash, env.PREVIEW_HASH)) {
        const exp = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
        const token = await makeToken(env, exp);
        return new Response(null, {
          status: 303,
          headers: { Location: next, 'Set-Cookie': `${COOKIE}=${token}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Lax`, 'Cache-Control': 'no-store' }
        });
      }
      await new Promise(r => setTimeout(r, 800)); // slow down guessing
      return lockPage(url, next, true, false);
    }

    const exp = await validUntil(env, readCookie(request, COOKIE));
    if (exp) {
      if (url.searchParams.has('session')) return new Response(null, { status: 303, headers: { Location: withoutSessionFlag(url), 'Cache-Control': 'no-store' } });
      const res = await env.ASSETS.fetch(request);
      const out = new Response(res.body, res);
      out.headers.set('X-Robots-Tag', 'noindex, nofollow');
      if ((out.headers.get('Content-Type') || '').includes('text/html')) {
        out.headers.set('Cache-Control', 'no-store');
        const script = PREVIEW_GUARD + expiryScript(exp * 1000 - Date.now());
        return new HTMLRewriter().on('body', { element(el) { el.append(script, { html: true }); } }).transform(out);
      }
      return out;
    }

    const accept = request.headers.get('Accept') || '';
    if (request.method === 'GET' && (accept.includes('text/html') || url.pathname === '/' || url.pathname.endsWith('.html') || !/\.[a-z0-9]+$/i.test(url.pathname))) {
      return lockPage(url, withoutSessionFlag(url), false, url.searchParams.get('session') === 'ended');
    }
    return new Response('This preview is private.', { status: 401, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
  }
};
