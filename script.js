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

  initLiveNews();
  initStockTicker();
  initFeaturedVideos();
  initAnalyticsConsent();
  initNewsletterForm();
});

const YOUTUBE_ID_RE = /^[\w-]{11}$/;

function formatViewCount(n) {
  n = Number(n) || 0;
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M views';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K views';
  return n + ' views';
}

function buildStreamCard(video) {
  if (!YOUTUBE_ID_RE.test(video.videoId || '')) return null;

  const card = document.createElement('div');
  card.className = 'stream-card';

  const videoWrap = document.createElement('div');
  videoWrap.className = 'stream-video';
  const iframe = document.createElement('iframe');
  iframe.src = 'https://www.youtube.com/embed/' + encodeURIComponent(video.videoId);
  iframe.title = video.title || '';
  iframe.loading = 'lazy';
  iframe.allowFullscreen = true;
  videoWrap.appendChild(iframe);
  card.appendChild(videoWrap);

  const info = document.createElement('div');
  info.className = 'stream-info';
  const h3 = document.createElement('h3');
  h3.textContent = video.title || '';
  info.appendChild(h3);
  const p = document.createElement('p');
  p.textContent = video.channelTitle || '';
  info.appendChild(p);
  if (typeof video.viewCount === 'number') {
    const views = document.createElement('span');
    views.className = 'stream-views';
    views.textContent = formatViewCount(video.viewCount);
    info.appendChild(views);
  }
  card.appendChild(info);

  return card;
}

function initFeaturedVideos() {
  const grid = document.getElementById('streams-grid');
  const sub = document.getElementById('streams-sub');
  if (!grid) return;

  fetch('videos.json', { cache: 'no-store' })
    .then((res) => {
      if (!res.ok) throw new Error('videos.json not available');
      return res.json();
    })
    .then((data) => {
      const videos = Array.isArray(data.videos) ? data.videos : [];
      if (videos.length === 0) return; // keep static fallback cards

      const cards = videos.map(buildStreamCard).filter(Boolean);
      if (cards.length === 0) return;

      grid.innerHTML = '';
      cards.forEach((card) => grid.appendChild(card));
      if (sub) sub.textContent = "Automatically updated — today's most-watched AI videos";
    })
    .catch(() => {
      // network/parse failure, or no key configured yet: keep the static picks
    });
}

function initNewsletterForm() {
  const form = document.getElementById('newsletter-form');
  const status = document.getElementById('newsletter-status');
  if (!form || !status) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    status.textContent = 'Sending…';

    fetch(form.action, {
      method: 'POST',
      body: new FormData(form),
      headers: { Accept: 'application/json' },
    })
      .then((res) => {
        if (res.ok) {
          status.textContent = "Thanks — you're subscribed!";
          form.reset();
        } else {
          status.textContent = 'Something went wrong. Please try again.';
        }
      })
      .catch(() => {
        status.textContent = 'Something went wrong. Please try again.';
      });
  });
}

const GA_MEASUREMENT_ID = 'G-XXXXXXXXXX'; // replace with your real ID from analytics.google.com
const CONSENT_KEY = 'aistream_cookie_consent';

function loadGoogleAnalytics() {
  if (window.gaLoaded || GA_MEASUREMENT_ID.includes('XXXX')) return;
  window.gaLoaded = true;

  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_MEASUREMENT_ID;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', GA_MEASUREMENT_ID, { anonymize_ip: true });
}

function initAnalyticsConsent() {
  const banner = document.getElementById('cookie-banner');
  if (!banner) return;

  const stored = localStorage.getItem(CONSENT_KEY);
  if (stored === 'accepted') {
    loadGoogleAnalytics();
    return;
  }
  if (stored === 'rejected') {
    return;
  }

  banner.classList.add('visible');

  document.getElementById('cookie-accept').addEventListener('click', () => {
    localStorage.setItem(CONSENT_KEY, 'accepted');
    banner.classList.remove('visible');
    loadGoogleAnalytics();
  });

  document.getElementById('cookie-reject').addEventListener('click', () => {
    localStorage.setItem(CONSENT_KEY, 'rejected');
    banner.classList.remove('visible');
  });
}

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

function buildImpactBadge(impactLevel) {
  if (!impactLevel) return null;
  const known = ['Low', 'Medium', 'High', 'Critical'];
  if (!known.includes(impactLevel)) return null;
  const badge = document.createElement('span');
  badge.className = 'impact-badge impact-' + impactLevel.toLowerCase();
  badge.textContent = impactLevel;
  return badge;
}

function buildWhyItMatters(analysis) {
  if (!analysis || !analysis.whyItMatters) return null;
  const box = document.createElement('div');
  box.className = 'ai-analysis';
  const label = document.createElement('span');
  label.className = 'ai-analysis-label';
  label.textContent = 'AI ANALYSIS — Why it matters';
  box.appendChild(label);
  const text = document.createElement('p');
  text.textContent = analysis.whyItMatters;
  box.appendChild(text);
  return box;
}

function buildRelatedSources(relatedSources) {
  if (!Array.isArray(relatedSources) || relatedSources.length === 0) return null;
  const box = document.createElement('div');
  box.className = 'related-sources';

  const label = document.createElement('span');
  label.className = 'related-sources-label';
  label.textContent = 'Also covered by';
  box.appendChild(label);

  relatedSources.forEach((rs) => {
    const link = document.createElement('a');
    link.textContent = rs.source || 'Source';
    if (isSafeHttpUrl(rs.link)) {
      link.href = rs.link;
      link.rel = 'noopener noreferrer nofollow';
      link.target = '_blank';
    } else {
      link.href = '#';
    }
    box.appendChild(link);
  });

  return box;
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

  const impactBadge = buildImpactBadge(item.aiAnalysis && item.aiAnalysis.impactLevel);

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
    if (impactBadge) thumbWrap.appendChild(impactBadge);
    card.appendChild(thumbWrap);
  }

  const body = document.createElement('div');
  body.className = 'news-card-body';
  card.appendChild(body);

  if (!hasImage) {
    body.appendChild(tag);
    if (impactBadge) body.appendChild(impactBadge);
  }

  const h3 = document.createElement('h3');
  h3.textContent = item.title || '';
  body.appendChild(h3);

  const p = document.createElement('p');
  p.textContent = item.summary || '';
  body.appendChild(p);

  const whyItMatters = buildWhyItMatters(item.aiAnalysis);
  if (whyItMatters) body.appendChild(whyItMatters);

  const relatedSources = buildRelatedSources(item.relatedSources);
  if (relatedSources) body.appendChild(relatedSources);

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
  const relatedContainer = document.getElementById('featured-hero-related');
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

  if (relatedContainer) {
    relatedContainer.innerHTML = '';
    const relatedSources = buildRelatedSources(item.relatedSources);
    if (relatedSources) relatedContainer.appendChild(relatedSources);
  }
}

function groupByDay(items) {
  const groups = [];
  let currentKey = null;
  let currentGroup = null;

  items.forEach((item) => {
    const d = new Date(item.pubDate);
    const key = isNaN(d.getTime()) ? 'Earlier' : d.toDateString();
    if (key !== currentKey) {
      currentKey = key;
      currentGroup = { label: isNaN(d.getTime()) ? 'Earlier' : d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }), items: [] };
      groups.push(currentGroup);
    }
    currentGroup.items.push(item);
  });

  return groups;
}

function buildArchiveRow(item) {
  const row = document.createElement('article');
  row.className = 'archive-row';

  if (item.image && isSafeHttpUrl(item.image)) {
    const thumb = document.createElement('img');
    thumb.className = 'archive-thumb';
    thumb.src = item.image;
    thumb.alt = '';
    thumb.loading = 'lazy';
    row.appendChild(thumb);
  } else if (item.avatar && /^[\w-]+\.png$/.test(item.avatar)) {
    const avatar = document.createElement('img');
    avatar.className = 'archive-thumb archive-thumb-avatar';
    avatar.src = item.avatar;
    avatar.alt = '';
    row.appendChild(avatar);
  }

  const body = document.createElement('div');
  body.className = 'archive-row-body';

  const meta = document.createElement('div');
  meta.className = 'archive-row-meta';
  const cat = document.createElement('span');
  cat.className = 'archive-category';
  cat.textContent = item.category || 'News';
  meta.appendChild(cat);
  const rowBadge = buildImpactBadge(item.aiAnalysis && item.aiAnalysis.impactLevel);
  if (rowBadge) meta.appendChild(rowBadge);
  const time = document.createElement('span');
  time.textContent = formatNewsDate(item.pubDate);
  meta.appendChild(time);
  body.appendChild(meta);

  const h4 = document.createElement('h4');
  const link = document.createElement('a');
  link.textContent = item.title || '';
  if (isSafeHttpUrl(item.link)) {
    link.href = item.link;
    link.rel = 'noopener noreferrer nofollow';
    link.target = '_blank';
  } else {
    link.href = '#';
  }
  h4.appendChild(link);
  body.appendChild(h4);

  row.appendChild(body);
  return row;
}

function initNewsArchive(items) {
  const container = document.getElementById('news-archive');
  if (!container || items.length === 0) return;

  container.innerHTML = '';
  groupByDay(items).forEach((group) => {
    const heading = document.createElement('h3');
    heading.className = 'archive-day-heading';
    heading.textContent = group.label;
    container.appendChild(heading);

    const list = document.createElement('div');
    list.className = 'archive-day-list';
    group.items.forEach((item) => {
      list.appendChild(buildArchiveRow(item));
    });
    container.appendChild(list);
  });
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
      const heroLink = items[0].link;
      const pool = items.filter((it) => it.link !== heroLink);

      function renderPool(filtered) {
        grid.innerHTML = '';
        const gridItems = filtered.slice(0, 6);
        if (gridItems.length === 0) {
          const empty = document.createElement('p');
          empty.className = 'topic-empty';
          empty.textContent = 'No stories match your followed topics right now.';
          grid.appendChild(empty);
        } else {
          gridItems.forEach((item) => grid.appendChild(buildNewsCard(item, false)));
        }
        initNewsArchive(filtered.slice(6));
      }

      renderPool(pool);
      initTopicFilters(items, (followed) => {
        if (followed.size === 0) {
          renderPool(pool);
          return;
        }
        renderPool(
          pool.filter((it) => {
            const techs = (it.aiAnalysis && it.aiAnalysis.technologies) || [];
            return techs.some((t) => followed.has(t));
          })
        );
      });

      initVerdict(items);
      initLeadershipDrilldown(items);
      initAskTheWorld(items);
    })
    .catch(() => {
      // network/parse failure: silently keep the static placeholder cards
    });

  initTimeMachine();
}

const TOPIC_STORAGE_KEY = 'aistream_followed_topics';
const KNOWN_TOPICS = [
  'Large language models', 'Generative AI', 'Agentic AI', 'Robotics',
  'Autonomous vehicles', 'AI chips', 'AI infrastructure', 'Computer vision',
  'Voice AI', 'AI safety', 'Open-weight models', 'AI regulation',
];

function loadFollowedTopics() {
  try {
    return new Set(JSON.parse(localStorage.getItem(TOPIC_STORAGE_KEY)) || []);
  } catch (e) {
    return new Set();
  }
}

function saveFollowedTopics(followed) {
  try {
    localStorage.setItem(TOPIC_STORAGE_KEY, JSON.stringify([...followed]));
  } catch (e) { /* ignore */ }
}

function initTopicFilters(newsItems, onChange) {
  const container = document.getElementById('topic-filters');
  if (!container) return;

  const present = new Set();
  newsItems.forEach((it) => {
    ((it.aiAnalysis && it.aiAnalysis.technologies) || []).forEach((t) => present.add(t));
  });
  const topics = KNOWN_TOPICS.filter((t) => present.has(t));
  if (topics.length === 0) return;

  const followed = loadFollowedTopics();

  const hint = document.createElement('span');
  hint.className = 'topic-filters-hint';
  hint.textContent = 'Follow a topic:';
  container.appendChild(hint);

  topics.forEach((topic) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'topic-chip' + (followed.has(topic) ? ' active' : '');
    btn.textContent = topic;
    btn.addEventListener('click', () => {
      if (followed.has(topic)) {
        followed.delete(topic);
      } else {
        followed.add(topic);
      }
      saveFollowedTopics(followed);
      btn.classList.toggle('active');
      onChange(followed);
    });
    container.appendChild(btn);
  });

  if (followed.size > 0) onChange(followed);
}

function tokenizeSearch(text) {
  return (text || '').toLowerCase().match(/[a-z0-9']+/g) || [];
}

const SEARCH_STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'in', 'on', 'of', 'for',
  'to', 'and', 'or', 'what', 'how', 'why', 'about', 'with', 'this', 'that',
]);

function scoreItemForSearch(item, queryTokens) {
  const haystack = tokenizeSearch(
    [
      item.title,
      item.summary,
      item.category,
      ...((item.aiAnalysis && item.aiAnalysis.companies) || []),
      ...((item.aiAnalysis && item.aiAnalysis.countries) || []),
      ...((item.aiAnalysis && item.aiAnalysis.technologies) || []),
    ].join(' ')
  );
  const haySet = new Set(haystack);
  let score = 0;
  queryTokens.forEach((t) => {
    if (haySet.has(t)) score++;
  });
  return score;
}

function initAskTheWorld(newsItems) {
  const form = document.getElementById('ask-world-form');
  const input = document.getElementById('ask-world-input');
  const results = document.getElementById('ask-world-results');
  if (!form || !input || !results) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = input.value.trim();
    results.innerHTML = '';
    if (!query) return;

    const tokens = tokenizeSearch(query).filter((t) => !SEARCH_STOPWORDS.has(t) && t.length > 1);
    const scored = newsItems
      .map((item) => ({ item, score: scoreItemForSearch(item, tokens) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    if (scored.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'topic-empty';
      empty.textContent = 'No stories matched. Try a company, country, or technology name.';
      results.appendChild(empty);
      return;
    }

    scored.forEach(({ item }) => results.appendChild(buildArchiveRow(item)));
  });
}

function initTimeMachine() {
  const select = document.getElementById('time-machine-select');
  const panel = document.getElementById('time-machine-results');
  if (!select || !panel) return;

  function loadSnapshot(date) {
    panel.innerHTML = '';
    fetch(`archive/${date}.json`, { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error('snapshot not available');
        return res.json();
      })
      .then((data) => {
        const items = Array.isArray(data.items) ? data.items : [];
        panel.innerHTML = '';
        if (items.length === 0) {
          panel.textContent = 'No stories recorded for that date.';
          return;
        }
        items.forEach((item) => panel.appendChild(buildArchiveRow(item)));
      })
      .catch(() => {
        panel.textContent = 'Could not load that date.';
      });
  }

  fetch('archive/index.json', { cache: 'no-store' })
    .then((res) => {
      if (!res.ok) throw new Error('archive index not available');
      return res.json();
    })
    .then((data) => {
      const dates = Array.isArray(data.dates) ? data.dates : [];
      if (dates.length === 0) {
        panel.textContent = 'No historical snapshots yet — check back after a few days.';
        return;
      }
      select.innerHTML = '';
      dates.forEach((d) => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = d;
        select.appendChild(opt);
      });
      select.addEventListener('change', () => loadSnapshot(select.value));
      loadSnapshot(dates[0]);
    })
    .catch(() => {
      panel.textContent = 'Historical data unavailable right now.';
    });
}

function initLeadershipDrilldown(newsItems) {
  const list = document.querySelector('.leadership-rank-list');
  const panel = document.getElementById('leadership-drilldown');
  if (!list || !panel) return;

  const items = newsItems || [];

  function articlesForCountry(country) {
    return items.filter(
      (it) => it.aiAnalysis && Array.isArray(it.aiAnalysis.countries) && it.aiAnalysis.countries.includes(country)
    );
  }

  function renderPanel(country, matches) {
    panel.innerHTML = '';

    const heading = document.createElement('h4');
    heading.className = 'drilldown-heading';
    heading.textContent = country + ' — recent AI stories';
    panel.appendChild(heading);

    if (matches.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'drilldown-empty';
      empty.textContent = 'No recent stories tagged to ' + country + ' yet.';
      panel.appendChild(empty);
    } else {
      const list = document.createElement('ul');
      list.className = 'drilldown-list';
      matches.slice(0, 6).forEach((it) => {
        const li = document.createElement('li');
        const link = document.createElement('a');
        link.textContent = it.title || '';
        if (isSafeHttpUrl(it.link)) {
          link.href = it.link;
          link.rel = 'noopener noreferrer nofollow';
          link.target = '_blank';
        } else {
          link.href = '#';
        }
        li.appendChild(link);
        list.appendChild(li);
      });
      panel.appendChild(list);
    }

    panel.classList.add('visible');
  }

  list.querySelectorAll('li').forEach((li) => {
    const countrySpan = li.querySelector('.rank-country');
    if (!countrySpan) return;
    const country = countrySpan.textContent.trim();

    li.classList.add('clickable');
    li.setAttribute('role', 'button');
    li.setAttribute('tabindex', '0');

    const activate = () => {
      const alreadyActive = li.classList.contains('active');
      list.querySelectorAll('li').forEach((other) => other.classList.remove('active'));
      if (alreadyActive) {
        panel.classList.remove('visible');
        return;
      }
      li.classList.add('active');
      renderPanel(country, articlesForCountry(country));
    };

    li.addEventListener('click', activate);
    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate();
      }
    });
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

const VERDICT_MY_VOTES_KEY = 'aistream_my_votes';
const VERDICT_MAX_ITEMS = 10;
const VERDICT_ADVANCE_DELAY_MS = 700;

// stable short id for a real article, used both as the localStorage key for
// "did I already vote on this" and as the shared vote-counter key on the
// server -- same link always hashes to the same id
function hashId(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return 'a' + (h >>> 0).toString(36);
}

function aiSentimentScore(analysis) {
  if (!analysis) return 0;
  if (typeof analysis.sentimentScore === 'number') return analysis.sentimentScore;
  const good = Array.isArray(analysis.goodFor) ? analysis.goodFor.length : 0;
  const bad = Array.isArray(analysis.badFor) ? analysis.badFor.length : 0;
  return Math.max(-2, Math.min(2, good - bad));
}

function aiLeanLabel(score) {
  if (score > 0) return 'AI leans Good';
  if (score < 0) return 'AI leans Bad';
  return 'AI reads this as neutral';
}

function loadMyVerdictVotes() {
  try {
    return JSON.parse(localStorage.getItem(VERDICT_MY_VOTES_KEY)) || {};
  } catch (e) {
    return {};
  }
}

function saveMyVerdictVotes(votes) {
  try {
    localStorage.setItem(VERDICT_MY_VOTES_KEY, JSON.stringify(votes));
  } catch (e) { /* ignore */ }
}

function initVerdict(newsItems) {
  const stage = document.getElementById('verdict-stage');
  const summary = document.getElementById('verdict-summary');
  const progress = document.getElementById('verdict-progress');
  const skipBtn = document.getElementById('verdict-skip');
  if (!stage || !summary || !progress || !skipBtn) return;

  const queue = (newsItems || [])
    .filter((it) => it.aiAnalysis)
    .slice(0, VERDICT_MAX_ITEMS)
    .map((it) => ({ id: hashId(it.link), item: it, aiScore: aiSentimentScore(it.aiAnalysis) }));

  if (queue.length === 0) return; // nothing to show rather than fake data

  const myVotes = loadMyVerdictVotes();
  let index = 0;
  let serverAvailable = true; // flips permanently false on first failed call this session

  async function fetchCounts(id) {
    if (!serverAvailable) return null;
    try {
      const res = await fetch('/api/vote?id=' + encodeURIComponent(id), { cache: 'no-store' });
      if (!res.ok) {
        serverAvailable = false;
        return null;
      }
      return await res.json();
    } catch (e) {
      serverAvailable = false;
      return null;
    }
  }

  async function postVote(id, direction) {
    if (!serverAvailable) return null;
    try {
      const res = await fetch('/api/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, direction }),
      });
      if (!res.ok) {
        serverAvailable = false;
        return null;
      }
      return await res.json();
    } catch (e) {
      serverAvailable = false;
      return null;
    }
  }

  function renderSummary(counts, aiScore) {
    summary.innerHTML = '';

    const aiSpan = document.createElement('span');
    aiSpan.className = 'verdict-ai-lean';
    aiSpan.textContent = aiLeanLabel(aiScore);
    summary.appendChild(aiSpan);

    const communitySpan = document.createElement('span');
    communitySpan.className = 'verdict-community';
    if (counts) {
      const total = counts.good + counts.bad;
      if (total > 0) {
        const pct = Math.round((counts.good / total) * 100);
        communitySpan.textContent = `Community: ${pct}% Good (${total} vote${total === 1 ? '' : 's'})`;
      } else {
        communitySpan.textContent = 'Community: no votes yet — be the first';
      }
    } else {
      communitySpan.textContent = 'Community voting unavailable right now';
    }
    summary.appendChild(communitySpan);
  }

  async function renderCard() {
    const { id, item, aiScore } = queue[index];
    progress.textContent = (index + 1) + ' / ' + queue.length;

    stage.innerHTML = '';
    const card = document.createElement('article');
    card.className = 'verdict-card';

    const tag = document.createElement('span');
    tag.className = 'verdict-tag';
    tag.textContent = item.category || 'News';
    card.appendChild(tag);

    const h4 = document.createElement('h4');
    const link = document.createElement('a');
    link.textContent = item.title || '';
    if (isSafeHttpUrl(item.link)) {
      link.href = item.link;
      link.rel = 'noopener noreferrer nofollow';
      link.target = '_blank';
    } else {
      link.href = '#';
    }
    h4.appendChild(link);
    card.appendChild(h4);

    const myVote = myVotes[id];
    if (myVote) {
      const already = document.createElement('p');
      already.className = 'verdict-already-voted';
      already.textContent = 'You voted: ' + (myVote === 'good' ? 'Good' : 'Bad');
      card.appendChild(already);
    }

    const vote = document.createElement('div');
    vote.className = 'verdict-vote';
    vote.innerHTML = `
        <div class="vote-option">
          <span class="vote-label vote-label-good">Good</span>
          <button class="vote-round vote-up" aria-label="Vote good news" ${myVote ? 'disabled' : ''}>
            <img src="vote-good.png" alt="">
          </button>
        </div>
        <div class="vote-option">
          <span class="vote-label vote-label-bad">Bad</span>
          <button class="vote-round vote-down" aria-label="Vote bad news" ${myVote ? 'disabled' : ''}>
            <img src="vote-bad.png" alt="">
          </button>
        </div>
    `;
    vote.querySelector('.vote-up').addEventListener('click', () => handleVote(id, 'good'));
    vote.querySelector('.vote-down').addEventListener('click', () => handleVote(id, 'bad'));
    card.appendChild(vote);

    stage.appendChild(card);

    renderSummary(null, aiScore);
    const counts = await fetchCounts(id);
    // only apply if still showing the same card (user may have skipped ahead already)
    if (queue[index].id === id) renderSummary(counts, aiScore);
  }

  async function handleVote(id, direction) {
    myVotes[id] = direction;
    saveMyVerdictVotes(myVotes);

    // lock the buttons and show "you voted" immediately -- don't wait for
    // the network call or the next render, otherwise a second click inside
    // the advance delay would submit a duplicate vote
    stage.querySelectorAll('.vote-round').forEach((btn) => { btn.disabled = true; });
    if (!stage.querySelector('.verdict-already-voted')) {
      const already = document.createElement('p');
      already.className = 'verdict-already-voted';
      already.textContent = 'You voted: ' + (direction === 'good' ? 'Good' : 'Bad');
      stage.querySelector('.verdict-card').insertBefore(already, stage.querySelector('.verdict-vote'));
    }

    const aiScore = queue[index].aiScore;
    renderSummary(null, aiScore); // clear stale counts while the vote is in flight
    const counts = await postVote(id, direction);
    if (queue[index].id === id) renderSummary(counts, aiScore);

    setTimeout(advance, VERDICT_ADVANCE_DELAY_MS);
  }

  function advance() {
    index = (index + 1) % queue.length;
    renderCard();
  }

  skipBtn.addEventListener('click', advance);
  renderCard();
}
