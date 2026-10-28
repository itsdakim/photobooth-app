/**
 * The one static page guests land on after scanning a QR code. It's uploaded to
 * the bucket root as v.html and reads each event's album.json, so every event
 * (and its expiry) is handled by data, not by extra pages:
 *
 *   v.html?f=<Event Name>&s=<stamp>    a guest's own photo + GIF, with a link to the album
 *   v.html?f=<Event Name>              everyone's photos from the event
 *
 * (Older links used ?e=<eventId> and events/<eventId>/album.json; they still work.)
 *
 * Plain HTML/CSS/JS with no libraries so it stays small and works from any host.
 * Note: no backticks or dollar-brace sequences in the script, so it can sit in
 * this template string untouched.
 */

/** Bump when the page changes so the app re-uploads it. */
export const VIEWER_VERSION = 2

export const VIEWER_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Your Photos</title>
<style>
  :root { --bg:#f8ecdc; --surface:#fdf3e7; --ink:#2b211b; --muted:#6f6157; --accent:#f08a5d; --yellow:#ffd36e; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font-family:"Trebuchet MS","Segoe UI",system-ui,sans-serif; }
  main { max-width:760px; margin:0 auto; padding:24px 16px 56px; text-align:center; }
  h1 { font-family:"Segoe Print","Bradley Hand","Comic Sans MS",cursive; font-size:34px; line-height:1.1; margin:8px 0 4px; }
  .sub { color:var(--muted); font-size:15px; margin:0 0 20px; }
  .card { background:var(--surface); border:2px solid var(--ink); border-radius:18px; padding:14px; margin:0 auto 18px; max-width:420px; }
  .card.wide { max-width:560px; }
  .card h2 { font-size:12px; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); margin:0 0 10px; }
  .card img { display:block; width:auto; max-width:100%; height:auto; max-height:72vh; margin:0 auto; border-radius:8px; }
  .btn { display:inline-block; margin-top:12px; padding:13px 26px 12px; border:2px solid var(--ink); border-radius:999px; background:var(--yellow); color:var(--ink); font-weight:700; letter-spacing:.06em; text-transform:uppercase; font-size:14px; text-decoration:none; }
  .btn.alt { background:transparent; }
  .hint { color:var(--muted); font-size:13px; margin:10px 0 0; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); gap:12px; text-align:left; margin-top:8px; }
  .tile { position:relative; display:block; border:2px solid var(--ink); border-radius:12px; overflow:hidden; background:#fff; aspect-ratio:2/3; }
  .tile.land { aspect-ratio:3/2; }
  .tile img { width:100%; height:100%; object-fit:contain; display:block; background:var(--surface); }
  .chip { position:absolute; right:6px; bottom:6px; background:var(--ink); color:#fff; font-size:11px; font-weight:700; letter-spacing:.06em; padding:3px 8px; border-radius:999px; }
  .msg { padding:40px 8px; color:var(--muted); line-height:1.5; }
</style>
</head>
<body>
<main id="app"><p class="msg">Loading your photos&hellip;</p></main>
<script>
(function () {
  var app = document.getElementById('app');
  var params = new URLSearchParams(location.search);
  var ID = /^[A-Za-z0-9_-]{1,64}$/;
  var STAMP = /^[A-Za-z0-9_.-]{1,64}$/;
  var folder = params.get('f') || '';
  var legacyId = params.get('e') || '';
  var sessionId = params.get('s') || '';
  // Identifies the event in links: ?f=<folder> now, ?e=<id> on older links.
  var linkKey = folder ? 'f' : 'e';
  var linkValue = folder || legacyId;
  var albumPath = folder ? folder + '/album.json' : 'events/' + legacyId + '/album.json';
  var tries = 0;
  var timer = null;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function clear() { while (app.firstChild) app.removeChild(app.firstChild); }
  function message(text) { clear(); app.appendChild(el('p', 'msg', text)); }
  function link(href, text, cls) {
    var a = el('a', 'btn' + (cls ? ' ' + cls : ''), text);
    a.href = href;
    return a;
  }
  function header(album, title, sub) {
    app.appendChild(el('h1', '', title));
    if (sub) app.appendChild(el('p', 'sub', sub));
  }
  function expiryNote(album) {
    if (!album.expiresAt) return '';
    var d = new Date(album.expiresAt);
    if (isNaN(d.getTime())) return '';
    return 'Available until ' + d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  }
  function mediaCard(title, src, filename, saveText) {
    var card = el('div', 'card');
    card.appendChild(el('h2', '', title));
    var img = el('img');
    img.src = src;
    img.alt = title;
    card.appendChild(img);
    var a = link(src, saveText);
    a.setAttribute('download', filename);
    card.appendChild(a);
    return card;
  }
  // Keys can contain spaces and other characters, so encode each part of the path.
  function url(path) {
    return new URL(path.split('/').map(encodeURIComponent).join('/'), location.href).toString();
  }
  function pageLink(id) {
    return '?' + linkKey + '=' + encodeURIComponent(linkValue) + (id ? '&s=' + encodeURIComponent(id) : '');
  }

  function showSession(album, item) {
    clear();
    header(album, album.name || 'Your Photos', 'Thanks for celebrating with us!');
    var base = (album.name || 'photo') + ' ' + item.id;
    if (item.photo) app.appendChild(mediaCard('Your photo', url(item.photo), base + '.png', 'Download photo'));
    if (item.gif) app.appendChild(mediaCard('Your GIF', url(item.gif), base + '.gif', 'Download GIF'));
    app.appendChild(el('p', 'hint', 'On a phone you can also press and hold a picture to save it.'));
    app.appendChild(link(pageLink(''), 'See the full album', 'alt'));
    var note = expiryNote(album);
    if (note) app.appendChild(el('p', 'hint', note));
  }

  function showAlbum(album) {
    clear();
    var items = (album.sessions || []).slice().sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });
    header(album, album.name || 'Photo Album', items.length + (items.length === 1 ? ' photo' : ' photos') + ' from the event');
    var note = expiryNote(album);
    if (note) app.appendChild(el('p', 'sub', note));
    if (items.length === 0) { app.appendChild(el('p', 'msg', 'No photos yet — check back soon.')); return; }
    var grid = el('div', 'grid');
    items.forEach(function (it) {
      var a = el('a', 'tile' + (it.landscape ? ' land' : ''));
      a.href = pageLink(it.id);
      var img = el('img');
      img.loading = 'lazy';
      img.alt = 'Photo';
      img.src = url(it.thumb || it.photo || '');
      a.appendChild(img);
      if (it.gif) a.appendChild(el('span', 'chip', 'GIF'));
      grid.appendChild(a);
    });
    app.appendChild(grid);
  }

  function load() {
    var folderOk = folder && folder.length <= 200 && folder.indexOf('/') < 0 &&
      folder.indexOf(String.fromCharCode(92)) < 0 && folder !== '..' && folder !== '.';
    if ((!folderOk && !ID.test(legacyId)) || (sessionId && !STAMP.test(sessionId))) {
      message('This link does not look right. Please scan the QR code again.');
      return;
    }
    fetch(url(albumPath), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('missing'); return r.json(); })
      .then(function (album) {
        if (!sessionId) { showAlbum(album); return; }
        var item = (album.sessions || []).filter(function (s) { return s.id === sessionId; })[0];
        if (!item) throw new Error('pending');
        showSession(album, item);
      })
      .catch(function () {
        tries += 1;
        if (tries <= 10) {
          message('Your photos are on their way — this page will refresh by itself.');
          timer = setTimeout(load, 6000);
        } else {
          message('We could not find these photos. If they were taken a while ago, the album may no longer be online.');
        }
      });
  }
  load();
})();
</script>
</body>
</html>
`
