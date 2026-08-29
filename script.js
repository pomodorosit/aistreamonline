document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.main-nav');
  if (!toggle || !nav) return;

  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  nav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      nav.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });

  initVerdict();
  initLiveNews();
  initStockTicker();
});

function formatNewsDate(pubDate) {
  const d = new Date(pubDate);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function isSafeHttpUrl(url) {
  try {
    const u = new URL(url, window.location.href);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch (e) {
    return false;
  }
}

function buildNewsCard(item, isFeatured) {
  const card = document.createElement('article');
  card.className = 'news-card' + (isFeatured ? ' featured' : '');

  const hasImage = item.image && isSafeHttpUrl(item.image);

  const tag = document.createElement('span');
  tag.className = 'news-tag';
  // avatar must be a bare local filename (no path/protocol) to block traversal
  if (item.avatar && /^[\w-]+\.png$/.test(item.avatar)) {
    const img = document.createElement('img');
    img.className = 'tag-avatar';
    img.src = item.avatar;
    img.alt = '';
    tag.appendChild(img);
  }
  tag.appendChild(document.createTextNode(item.category || 'News'));

  if (hasImage) {
    card.classList.add('has-thumb');
    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'news-thumb';
    const thumb = document.createElement('img');
    thumb.src = item.image;
    thumb.alt = '';
    thumb.loading = 'lazy';
    thumbWrap.appendChild(thumb);
    thumbWrap.appendChild(tag);
    card.appendChild(thumbWrap);
  }

  const body = document.createElement('div');
  body.className = 'news-card-body';
  card.appendChild(body);

  if (!hasImage) {
    body.appendChild(tag);
  }

  const h3 = document.createElement('h3');
  h3.textContent = item.title || '';
  body.appendChild(h3);

  const p = document.createElement('p');
  p.textContent = item.summary || '';
  body.appendChild(p);

  const meta = document.createElement('div');
  meta.className = 'news-meta';

  const dateSpan = document.createElement('span');
  dateSpan.textContent = formatNewsDate(item.pubDate);
  meta.appendChild(dateSpan);

  const link = document.createElement('a');
  link.className = 'read-more';
  link.textContent = 'Read more →';
  if (isSafeHttpUrl(item.link)) {
    link.href = item.link;
    link.rel = 'noopener noreferrer nofollow';
    link.target = '_blank';
  } else {
    link.href = '#';
  }
  meta.appendChild(link);

  body.appendChild(meta);
  return card;
}

function populateFeaturedHero(item) {
  const bg = document.getElementById('featured-hero-bg');
  const tag = document.getElementById('featured-hero-tag');
  const title = document.getElementById('featured-hero-title');
  const sub = document.getElementById('featured-hero-sub');
  const link = document.getElementById('featured-hero-link');
  if (!bg || !tag || !title || !sub || !link) return;

  if (item.image && isSafeHttpUrl(item.image)) {
    bg.src = item.image;
    bg.style.display = 'block';
  }
  tag.textContent = item.category || 'AI News';
  title.textContent = item.title || title.textContent;
  sub.textContent = item.summary || sub.textContent;
  if (isSafeHttpUrl(item.link)) {
    link.href = item.link;
    link.rel = 'noopener noreferrer nofollow';
    link.target = '_blank';
  }
}

function initLiveNews() {
  const grid = document.getElementById('news-grid');
  if (!grid) return;

  fetch('news.json', { cache: 'no-store' })
    .then((res) => {
      if (!res.ok) throw new Error('news.json not available');
      return res.json();
    })
    .then((data) => {
      const items = Array.isArray(data.items) ? data.items : [];
      if (items.length === 0) return; // keep static fallback cards

      populateFeaturedHero(items[0]);

      const rest = items.slice(1);
      if (rest.length === 0) return;
      grid.innerHTML = '';
      rest.forEach((item) => {
        grid.appendChild(buildNewsCard(item, false));
      });
    })
    .catch(() => {
      // network/parse failure: silently keep the static placeholder cards
    });
}

function initStockTicker() {
  const track = document.getElementById('stock-ticker-track');
  if (!track) return;

  fetch('stocks.json', { cache: 'no-store' })
    .then((res) => {
      if (!res.ok) throw new Error('stocks.json not available');
      return res.json();
    })
    .then((data) => {
      const quotes = Array.isArray(data.quotes) ? data.quotes : [];
      if (quotes.length === 0) return;

      track.innerHTML = '';
      // duplicate the list so the CSS marquee loop is seamless
      [...quotes, ...quotes].forEach((q) => {
        track.appendChild(buildTickerItem(q));
      });
    })
    .catch(() => {
      // leave the ticker empty on failure rather than showing stale/fake data
    });
}

function buildTickerItem(quote) {
  const item = document.createElement('span');
  item.className = 'ticker-item';

  const symbol = document.createElement('span');
  symbol.className = 'ticker-symbol';
  symbol.textContent = quote.symbol;
  item.appendChild(symbol);

  const price = document.createElement('span');
  price.className = 'ticker-price';
  price.textContent = '$' + Number(quote.price).toFixed(2);
  item.appendChild(price);

  const change = Number(quote.changePercent);
  const changeSpan = document.createElement('span');
  changeSpan.className = 'ticker-change ' + (change >= 0 ? 'ticker-up' : 'ticker-down');
  changeSpan.textContent = (change >= 0 ? '▲ ' : '▼ ') + Math.abs(change).toFixed(2) + '%';
  item.appendChild(changeSpan);

  return item;
}

const VERDICT_ITEMS = [
  { id: 'v1', category: 'Business', avatar: 'char-woman-head.png', headline: 'Startup raises record funding for green-energy AI', score: 4 },
  { id: 'v2', category: 'Stock Market', avatar: 'char-mustache-head.png', headline: 'Markets rally as AI chipmakers post strong earnings', score: 2 },
  { id: 'v3', category: 'Travel', avatar: 'char-cap-head.png', headline: 'AI-planned rail route cuts commute times in half', score: 3 },
  { id: 'v4', category: 'Music', avatar: 'char-dog-head.png', headline: 'AI-generated album sparks copyright lawsuit', score: -2 },
  { id: 'v5', category: 'Art', avatar: 'char-blob-head.png', headline: 'Gallery cancels exhibit after funding cuts blamed on automation', score: -3 },
  { id: 'v6', category: 'Technology', avatar: 'char-robot-head.png', headline: 'Tech sell-off wipes billions off market cap', score: -4 },
];

const VERDICT_STORAGE_KEY = 'aistream_verdict_votes';

function loadVerdictVotes() {
  try {
    return JSON.parse(localStorage.getItem(VERDICT_STORAGE_KEY)) || {};
  } catch (e) {
    return {};
  }
}

function saveVerdictVotes(votes) {
  try {
    localStorage.setItem(VERDICT_STORAGE_KEY, JSON.stringify(votes));
  } catch (e) { /* ignore */ }
}

function initVerdict() {
  const goodList = document.getElementById('good-list');
  const badList = document.getElementById('bad-list');
  if (!goodList || !badList) return;

  const votes = loadVerdictVotes();
  let lastMovedId = null;

  function currentScore(item) {
    return item.score + (votes[item.id] || 0);
  }

  function render() {
    const scored = VERDICT_ITEMS.map((item) => ({ item, score: currentScore(item) }));
    const good = scored.filter((s) => s.score >= 0).sort((a, b) => b.score - a.score);
    const bad = scored.filter((s) => s.score < 0).sort((a, b) => a.score - b.score);

    goodList.innerHTML = '';
    badList.innerHTML = '';

    good.forEach(({ item, score }) => goodList.appendChild(renderCard(item, score)));
    bad.forEach(({ item, score }) => badList.appendChild(renderCard(item, score)));
  }

  function renderCard(item, score) {
    const card = document.createElement('article');
    card.className = 'verdict-card';
    if (item.id === lastMovedId) {
      card.classList.add('just-moved');
    }
    card.innerHTML = `
      <span class="verdict-tag">${item.category}</span>
      <h4>${item.headline}</h4>
      <div class="verdict-vote">
        <div class="vote-option">
          <span class="vote-label vote-label-good">Good</span>
          <button class="vote-round vote-up" data-id="${item.id}" aria-label="Vote good news">
            <img src="vote-good.png" alt="">
          </button>
        </div>
        <span class="vote-score">${score > 0 ? '+' : ''}${score}</span>
        <div class="vote-option">
          <span class="vote-label vote-label-bad">Bad</span>
          <button class="vote-round vote-down" data-id="${item.id}" aria-label="Vote bad news">
            <img src="vote-bad.png" alt="">
          </button>
        </div>
      </div>
    `;
    return card;
  }

  function handleVote(id, delta) {
    const item = VERDICT_ITEMS.find((i) => i.id === id);
    if (!item) return;
    const wasGood = currentScore(item) >= 0;
    votes[id] = (votes[id] || 0) + delta;
    saveVerdictVotes(votes);
    const isGood = currentScore(item) >= 0;
    lastMovedId = wasGood !== isGood ? id : null;
    render();
    if (lastMovedId) {
      setTimeout(() => { lastMovedId = null; }, 500);
    }
  }

  document.querySelectorAll('.verdict-list').forEach((list) => {
    list.addEventListener('click', (e) => {
      const btn = e.target.closest('.vote-round');
      if (!btn) return;
      const delta = btn.classList.contains('vote-up') ? 1 : -1;
      handleVote(btn.dataset.id, delta);
    });
  });

  render();
}
