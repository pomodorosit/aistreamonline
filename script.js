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
  initPodcasts();
  initAiPulse();
  initCountryExplore();
  initAnalyticsConsent();
  initNewsletterForm();
  initRadio();
  initJokes();
  initCoverageChart();
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
  if (video.topic) {
    const topic = document.createElement('span');
    topic.className = 'stream-topic';
    topic.textContent = video.topic;
    info.appendChild(topic);
  }
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
      if (sub) sub.textContent = "Automatically updated — top video from each AI topic";
    })
    .catch(() => {
      // network/parse failure, or no key configured yet: keep the static picks
    });
}

function buildPodcastRow(ep) {
  if (!isSafeHttpUrl(ep.link)) return null;

  const row = document.createElement('a');
  row.className = 'podcast-row';
  row.href = ep.link;
  row.rel = 'noopener noreferrer nofollow';
  row.target = '_blank';

  const play = document.createElement('span');
  play.className = 'podcast-play';
  play.textContent = '▶';
  row.appendChild(play);

  const info = document.createElement('span');
  info.className = 'podcast-info';

  const name = document.createElement('span');
  name.className = 'podcast-name';
  name.textContent = ep.name || '';
  info.appendChild(name);

  const host = document.createElement('span');
  host.className = 'podcast-host';
  host.textContent = ep.host || '';
  info.appendChild(host);

  if (ep.episodeTitle) {
    const episode = document.createElement('span');
    episode.className = 'podcast-episode';
    episode.textContent = ep.episodeTitle;
    info.appendChild(episode);
  }

  row.appendChild(info);
  return row;
}

function initPodcasts() {
  const list = document.getElementById('podcast-list');
  const sub = document.getElementById('podcasts-sub');
  if (!list) return;

  fetch('podcasts.json', { cache: 'no-store' })
    .then((res) => {
      if (!res.ok) throw new Error('podcasts.json not available');
      return res.json();
    })
    .then((data) => {
      const episodes = Array.isArray(data.episodes) ? data.episodes : [];
      if (episodes.length === 0) return; // keep static fallback rows

      const rows = episodes.map(buildPodcastRow).filter(Boolean);
      if (rows.length === 0) return;

      list.innerHTML = '';
      rows.forEach((row) => list.appendChild(row));
      if (sub) sub.textContent = 'Automatically updated — latest episode from each show';
    })
    .catch(() => {
      // network/parse failure: keep the static fallback rows
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

function buildEntityTags(analysis, maxTags) {
  maxTags = maxTags || 4;
  if (!analysis) return null;
  const entities = [];
  ['companies', 'countries', 'technologies'].forEach((key) => {
    (analysis[key] || []).forEach((name) => {
      if (!entities.includes(name)) entities.push(name);
    });
  });
  if (entities.length === 0) return null;

  const box = document.createElement('div');
  box.className = 'entity-tags';
  const label = document.createElement('span');
  label.className = 'entity-tags-label';
  label.textContent = 'Related companies & topics';
  box.appendChild(label);
  entities.slice(0, maxTags).forEach((name) => {
    const tag = document.createElement('span');
    tag.className = 'entity-tag';
    tag.textContent = name;
    box.appendChild(tag);
  });
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

  const entityTags = buildEntityTags(item.aiAnalysis);
  if (entityTags) body.appendChild(entityTags);

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
  const groups = groupByDay(items);
  const dayElements = [];

  groups.forEach((group) => {
    const heading = document.createElement('h3');
    heading.className = 'archive-day-heading';
    heading.textContent = group.label;
    heading.hidden = true;

    const list = document.createElement('div');
    list.className = 'archive-day-list';
    group.items.forEach((item) => {
      list.appendChild(buildArchiveRow(item));
    });
    list.hidden = true;

    dayElements.push(heading, list);
    container.appendChild(heading);
    container.appendChild(list);
  });

  const showText = `Show full archive — ${items.length} stories over ${groups.length} day${groups.length === 1 ? '' : 's'} ▾`;
  const hideText = 'Hide archive ▴';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'archive-show-more';
  toggle.textContent = showText;

  let expanded = false;
  toggle.addEventListener('click', () => {
    expanded = !expanded;
    dayElements.forEach((el) => { el.hidden = !expanded; });
    toggle.textContent = expanded ? hideText : showText;
    if (!expanded) {
      // collapsing can yank away content the user had scrolled deep into --
      // bring them back to the toggle instead of leaving them stranded
      toggle.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
  container.insertBefore(toggle, dayElements[0]);
}

function renderDataFreshness(generatedAt) {
  const el = document.getElementById('data-freshness');
  if (!el || !generatedAt) return;
  const then = new Date(generatedAt).getTime();
  if (Number.isNaN(then)) return;

  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  let text;
  if (mins < 1) text = 'Data refreshed moments ago';
  else if (mins < 60) text = `Data refreshed ${mins} minute${mins === 1 ? '' : 's'} ago`;
  else {
    const hours = Math.round(mins / 60);
    text = `Data refreshed ${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  el.textContent = text;
  el.hidden = false;
}

function pubDayUTC(pubDate) {
  const d = new Date(pubDate);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function renderTodayInAi(items) {
  const el = document.getElementById('today-in-ai');
  if (!el) return;

  const todayStr = new Date().toISOString().slice(0, 10);
  const todays = items.filter((it) => pubDayUTC(it.pubDate) === todayStr);
  if (todays.length === 0) return;

  const impactCounts = { High: 0, Medium: 0, Low: 0 };
  const countryCounts = {};
  todays.forEach((it) => {
    const level = it.aiAnalysis && it.aiAnalysis.impactLevel;
    if (impactCounts[level] !== undefined) impactCounts[level]++;
    ((it.aiAnalysis && it.aiAnalysis.countries) || []).forEach((c) => {
      countryCounts[c] = (countryCounts[c] || 0) + 1;
    });
  });

  const parts = [`${todays.length} ${todays.length === 1 ? 'story' : 'stories'} tracked today`];
  if (impactCounts.High > 0) {
    parts.push(`${impactCounts.High} high-impact`);
  }
  const topCountry = Object.entries(countryCounts).sort((a, b) => b[1] - a[1])[0];
  if (topCountry) {
    parts.push(`most-mentioned country: ${topCountry[0]}`);
  }

  el.textContent = 'Today in AI: ' + parts.join(' · ');
  el.hidden = false;
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

      renderDataFreshness(data.generatedAt);
      renderTodayInAi(items);
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
      initAskTheWorld(items);
      initReturnBanner(items);
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
  const entityTokens = tokenizeSearch(
    [
      item.category,
      ...((item.aiAnalysis && item.aiAnalysis.companies) || []),
      ...((item.aiAnalysis && item.aiAnalysis.countries) || []),
      ...((item.aiAnalysis && item.aiAnalysis.technologies) || []),
    ].join(' ')
  );
  const textTokens = tokenizeSearch([item.title, item.summary].join(' '));

  function tokenScore(t, haystack, exactWeight, partialWeight) {
    if (haystack.includes(t)) return exactWeight;
    if (t.length >= 4 && haystack.some((h) => h.length >= 4 && (h.startsWith(t) || t.startsWith(h)))) {
      return partialWeight;
    }
    return 0;
  }

  let score = 0;
  queryTokens.forEach((t) => {
    score += tokenScore(t, entityTokens, 3, 1.5);
    score += tokenScore(t, textTokens, 1, 0.3);
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
  const grid = document.getElementById('calendar-grid');
  const monthLabel = document.getElementById('calendar-month-label');
  const prevBtn = document.getElementById('calendar-prev');
  const nextBtn = document.getElementById('calendar-next');
  const panel = document.getElementById('time-machine-results');
  if (!grid || !monthLabel || !prevBtn || !nextBtn || !panel) return;

  let entryByDate = {};
  let currentMonth = null;
  let selectedDate = null;

  function loadSnapshot(dateStr) {
    panel.innerHTML = '';

    const url = new URL(location.href);
    url.searchParams.set('date', dateStr);
    url.hash = 'time-machine';
    history.replaceState(null, '', url);

    fetch(`archive/${dateStr}.json`, { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error('snapshot not available');
        return res.json();
      })
      .then((data) => {
        const items = Array.isArray(data.items) ? data.items : [];
        panel.innerHTML = '';

        const shareBtn = document.createElement('button');
        shareBtn.type = 'button';
        shareBtn.className = 'btn btn-outline share-btn time-machine-share';
        shareBtn.textContent = 'Share this day';
        shareBtn.dataset.shareUrl = url.toString();
        shareBtn.dataset.shareTitle = `AI news from ${dateStr} — AI Stream Online`;
        panel.appendChild(shareBtn);

        if (items.length === 0) {
          const empty = document.createElement('p');
          empty.textContent = 'No stories recorded for that date.';
          panel.appendChild(empty);
        } else {
          items.forEach((item) => panel.appendChild(buildArchiveRow(item)));
        }

        if (typeof anime === 'function') {
          anime({
            targets: panel,
            opacity: [0, 1],
            translateY: [16, 0],
            duration: 380,
            easing: 'easeOutQuad',
          });
          // safety net: see animateNumber -- guarantee the panel is fully
          // visible even if anime's rAF loop never gets to tick
          setTimeout(() => {
            panel.style.opacity = '';
            panel.style.transform = '';
          }, 430);
        }
      })
      .catch(() => {
        panel.textContent = 'Could not load that date.';
      });
  }

  function selectDate(dateStr) {
    selectedDate = dateStr;
    renderCalendar();
    loadSnapshot(dateStr);
  }

  function renderCalendar() {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    monthLabel.textContent = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const startWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    grid.innerHTML = '';

    for (let i = 0; i < startWeekday; i++) {
      const empty = document.createElement('div');
      empty.className = 'calendar-day calendar-day-empty';
      grid.appendChild(empty);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const cell = document.createElement('div');
      cell.className = 'calendar-day';

      const num = document.createElement('span');
      num.className = 'calendar-day-number';
      num.textContent = String(day);
      cell.appendChild(num);

      const entry = entryByDate[dateStr];
      if (entry) {
        cell.classList.add('has-data');
        cell.setAttribute('role', 'button');
        cell.setAttribute('tabindex', '0');
        if (entry.count > 0) {
          const preview = document.createElement('span');
          preview.className = 'calendar-day-preview';
          preview.textContent = entry.count === 1 ? '1 story' : `${entry.count} stories`;
          cell.appendChild(preview);
        }
        cell.addEventListener('click', () => selectDate(dateStr));
        cell.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            selectDate(dateStr);
          }
        });
      }

      if (dateStr === selectedDate) cell.classList.add('selected');
      grid.appendChild(cell);
    }

    const now = new Date();
    nextBtn.disabled = year === now.getFullYear() && month === now.getMonth();
  }

  prevBtn.addEventListener('click', () => {
    currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
    renderCalendar();
  });
  nextBtn.addEventListener('click', () => {
    if (nextBtn.disabled) return;
    currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
    renderCalendar();
  });

  fetch('archive/index.json', { cache: 'no-store' })
    .then((res) => {
      if (!res.ok) throw new Error('archive index not available');
      return res.json();
    })
    .then((data) => {
      const entries = Array.isArray(data.entries)
        ? data.entries
        : (Array.isArray(data.dates) ? data.dates.map((d) => ({ date: d, topHeadline: null })) : []);
      if (entries.length === 0) {
        panel.textContent = 'No historical snapshots yet — check back after a few days.';
        return;
      }

      entryByDate = {};
      entries.forEach((e) => { entryByDate[e.date] = e; });

      const mostRecent = entries[0].date;
      const requestedDate = new URLSearchParams(location.search).get('date');
      const initialDate = requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : mostRecent;

      const [y, m] = initialDate.split('-').map(Number);
      currentMonth = new Date(y, m - 1, 1);
      selectedDate = initialDate;

      renderCalendar();
      loadSnapshot(initialDate);
    })
    .catch(() => {
      panel.textContent = 'Historical data unavailable right now.';
    });
}

const LAST_VISIT_KEY = 'aistream_last_visit';

function initReturnBanner(newsItems) {
  const banner = document.getElementById('return-banner');
  if (!banner) return;

  const now = Date.now();
  let previousVisit = null;
  try {
    const stored = localStorage.getItem(LAST_VISIT_KEY);
    if (stored) previousVisit = parseInt(stored, 10);
  } catch (e) { /* ignore */ }

  if (previousVisit && !isNaN(previousVisit)) {
    const newCount = newsItems.filter((it) => {
      const t = new Date(it.pubDate).getTime();
      return !isNaN(t) && t > previousVisit;
    }).length;

    if (newCount > 0) {
      const when = new Date(previousVisit).toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      });
      banner.textContent = `${newCount} new AI ${newCount === 1 ? 'story' : 'stories'} since your last visit (${when})`;
      banner.hidden = false;
    }
  }

  try {
    localStorage.setItem(LAST_VISIT_KEY, String(now));
  } catch (e) { /* ignore */ }
}

function countryFlagFallback() { return '🌐'; }

const KNOWN_COUNTRY_FLAGS = {
  'United States': '🇺🇸', 'United Kingdom': '🇬🇧', 'Germany': '🇩🇪', 'France': '🇫🇷',
  'India': '🇮🇳', 'Canada': '🇨🇦', 'Spain': '🇪🇸', 'Australia': '🇦🇺', 'Switzerland': '🇨🇭',
  'Netherlands': '🇳🇱', 'Singapore': '🇸🇬', 'Austria': '🇦🇹', 'Italy': '🇮🇹',
  'United Arab Emirates': '🇦🇪', 'South Korea': '🇰🇷', 'Israel': '🇮🇱', 'Mexico': '🇲🇽',
  'Japan': '🇯🇵', 'Sweden': '🇸🇪', 'Czech Republic': '🇨🇿', 'Brazil': '🇧🇷', 'Belgium': '🇧🇪',
  'Poland': '🇵🇱', 'South Africa': '🇿🇦', 'Turkey': '🇹🇷', 'China': '🇨🇳', 'Ukraine': '🇺🇦',
  'Lithuania': '🇱🇹', 'Portugal': '🇵🇹', 'Malaysia': '🇲🇾', 'Taiwan': '🇹🇼', 'Indonesia': '🇮🇩',
  'Saudi Arabia': '🇸🇦', 'Romania': '🇷🇴', 'Norway': '🇳🇴', 'Slovakia': '🇸🇰', 'Finland': '🇫🇮',
  'Denmark': '🇩🇰', 'Chile': '🇨🇱', 'Cyprus': '🇨🇾', 'Egypt': '🇪🇬', 'Estonia': '🇪🇪',
  'Ireland': '🇮🇪', 'New Zealand': '🇳🇿', 'Russia': '🇷🇺', 'Argentina': '🇦🇷',
};

function countrySlugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// ISO 3166-1 alpha-2 codes, matching the path/group ids in world-map.svg
// (a public-domain map, see methodology.html) -- used only to color regions
// by real tracked-company counts, never to imply the shapes themselves are
// anything but a visual index into the same data shown in the chip list.
const COUNTRY_ISO_CODES = {
  'United States': 'us', 'United Kingdom': 'gb', 'Germany': 'de', 'France': 'fr',
  'India': 'in', 'Canada': 'ca', 'Spain': 'es', 'Australia': 'au', 'Switzerland': 'ch',
  'Netherlands': 'nl', 'Singapore': 'sg', 'Austria': 'at', 'Italy': 'it',
  'United Arab Emirates': 'ae', 'South Korea': 'kr', 'Israel': 'il', 'Mexico': 'mx',
  'Japan': 'jp', 'Sweden': 'se', 'Czech Republic': 'cz', 'Brazil': 'br', 'Belgium': 'be',
  'Poland': 'pl', 'South Africa': 'za', 'Turkey': 'tr', 'China': 'cn', 'Ukraine': 'ua',
  'Lithuania': 'lt', 'Portugal': 'pt', 'Malaysia': 'my', 'Taiwan': 'tw', 'Indonesia': 'id',
  'Saudi Arabia': 'sa', 'Romania': 'ro', 'Norway': 'no', 'Slovakia': 'sk', 'Finland': 'fi',
  'Denmark': 'dk', 'Chile': 'cl', 'Cyprus': 'cy', 'Egypt': 'eg', 'Estonia': 'ee',
  'Ireland': 'ie', 'New Zealand': 'nz', 'Russia': 'ru', 'Argentina': 'ar',
};

// Discrete buckets read far more clearly than a continuous gradient at map
// scale, where subtle differences between adjacent countries are hard to
// tell apart. Boundaries chosen from the real distribution (not evenly
// spaced) so each bucket holds a meaningful, roughly comparable group
// rather than being dominated by outliers like the US's 278. Hue AND
// saturation shift together with lightness (dark brown -> amber -> bright
// gold), not lightness alone, so adjacent tiers stay visually distinct
// even in a small legend swatch.
const MAP_COLOR_BUCKETS = [
  { max: 4, color: 'hsl(22, 45%, 24%)', label: '3–4' },
  { max: 6, color: 'hsl(30, 55%, 34%)', label: '5–6' },
  { max: 10, color: 'hsl(36, 65%, 45%)', label: '7–10' },
  { max: 16, color: 'hsl(42, 72%, 56%)', label: '11–16' },
  { max: 31, color: 'hsl(46, 82%, 67%)', label: '17–31' },
  { max: Infinity, color: 'hsl(50, 92%, 80%)', label: '32+' },
];

function bucketForCount(count) {
  return MAP_COLOR_BUCKETS.find((b) => count <= b.max);
}

function initWorldMap(counts) {
  const wrap = document.getElementById('world-map-wrap');
  const legend = document.getElementById('world-map-legend');
  if (!wrap) return;

  const entries = Object.entries(counts).filter(([name]) => COUNTRY_ISO_CODES[name]);
  if (entries.length === 0) return;

  fetch('world-map.svg', { cache: 'force-cache' })
    .then((res) => {
      if (!res.ok) throw new Error('world-map.svg not available');
      return res.text();
    })
    .then((svgText) => {
      wrap.innerHTML = svgText;
      const svg = wrap.querySelector('svg');
      if (!svg) return;
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', 'World map shaded by number of AI companies tracked per country — exact figures are listed as text below this map');

      entries.forEach(([name, count]) => {
        const code = COUNTRY_ISO_CODES[name];
        const el = svg.getElementById(code);
        if (!el) return;
        const bucket = bucketForCount(count);
        // Some countries are a <g> wrapping many separate <path> pieces
        // (mainland, islands, Alaska, etc.), each carrying its own
        // "landxx" class from the base map. That class's fill beats an
        // inline style set only on the parent group, so the fill has to
        // be applied to the element itself AND every descendant path,
        // not just the (possibly non-existent) top-level shape.
        el.style.fill = bucket.color;
        el.style.cursor = 'pointer';
        el.querySelectorAll('path').forEach((child) => {
          child.style.fill = bucket.color;
          child.style.cursor = 'pointer';
        });
        const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        title.textContent = `${name}: ${count} ${count === 1 ? 'company' : 'companies'} tracked`;
        el.appendChild(title);
        el.addEventListener('click', () => {
          window.location.href = 'country/' + countrySlugify(name) + '.html';
        });
      });

      if (legend) {
        legend.innerHTML = '';
        const label = document.createElement('span');
        label.className = 'world-map-legend-label';
        label.textContent = 'AI companies tracked: ';
        legend.appendChild(label);
        MAP_COLOR_BUCKETS.forEach((b) => {
          const item = document.createElement('span');
          item.className = 'world-map-legend-item';
          const swatch = document.createElement('span');
          swatch.className = 'world-map-legend-swatch';
          swatch.style.background = b.color;
          item.appendChild(swatch);
          item.appendChild(document.createTextNode(b.label));
          legend.appendChild(item);
        });
        const noneItem = document.createElement('span');
        noneItem.className = 'world-map-legend-item';
        const noneSwatch = document.createElement('span');
        noneSwatch.className = 'world-map-legend-swatch world-map-legend-swatch-none';
        noneItem.appendChild(noneSwatch);
        noneItem.appendChild(document.createTextNode('No reliable data'));
        legend.appendChild(noneItem);
        legend.hidden = false;
      }
    })
    .catch(() => {
      // leave the container empty -- the chip list below still has the
      // same data, this is a supplementary visualization only
    });
}

function initCountryExplore() {
  const grid = document.getElementById('country-explore-grid');
  if (!grid) return;

  fetch('ai_companies_by_country.json', { cache: 'no-store' })
    .then((res) => {
      if (!res.ok) throw new Error('ai_companies_by_country.json not available');
      return res.json();
    })
    .then((data) => {
      const counts = data.countries || {};
      const entries = Object.entries(counts).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);

      if (entries.length === 0) {
        grid.innerHTML = '<p class="drilldown-empty">Country data unavailable right now.</p>';
        return;
      }

      initWorldMap(counts);

      grid.innerHTML = '';
      entries.forEach(([country, count]) => {
        const link = document.createElement('a');
        link.className = 'company-chip country-chip';
        link.href = 'country/' + countrySlugify(country) + '.html';
        const flag = KNOWN_COUNTRY_FLAGS[country] || countryFlagFallback();
        link.textContent = `${flag} ${country} · ${count}`;
        grid.appendChild(link);
      });
    })
    .catch(() => {
      grid.innerHTML = '<p class="drilldown-empty">Country data unavailable right now.</p>';
    });
}

function initStockTicker() {
  const track = document.getElementById('stock-ticker-track');
  if (!track) return;

  // /api/stocks is refreshed per minute during market hours; stocks.json is
  // the cron's copy, up to 3 hours old. Prefer the live one, fall back to the
  // file so a rate-limited upstream degrades to last-known-good instead of an
  // empty ticker.
  const load = (url) =>
    fetch(url, { cache: 'no-store' }).then((res) => {
      if (!res.ok) throw new Error(url + ' not available');
      return res.json();
    });

  load('/api/stocks')
    .catch(() => load('stocks.json'))
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

function animateNumber(el, from, to, duration) {
  if (from === to) {
    el.textContent = to.toLocaleString('en-US');
    return;
  }

  // prefer anime.js for a nicer easing curve; fall back to a plain
  // requestAnimationFrame tween if it failed to load (CDN down, blocked, offline)
  if (typeof anime === 'function') {
    const counter = { value: from };
    anime({
      targets: counter,
      value: to,
      duration,
      easing: 'easeOutExpo',
      round: 1,
      update: () => { el.textContent = Math.round(counter.value).toLocaleString('en-US'); },
    });
    // safety net: anime's internal loop runs on requestAnimationFrame, which
    // some backgrounded/throttled tabs never tick -- without this, the
    // number would stay stuck at its starting value forever. A plain timer
    // guarantees the real, correct value lands regardless.
    setTimeout(() => { el.textContent = to.toLocaleString('en-US'); }, duration + 150);
    return;
  }

  const start = performance.now();
  function tick(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out
    const value = Math.round(from + (to - from) * eased);
    el.textContent = value.toLocaleString('en-US');
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ticks the displayed number up every second at a rate measured for real
// from the last two cron snapshots -- never a fabricated increment. Only
// starts once the initial count-up animation has settled.
function relativeTimeFrom(isoString) {
  const then = new Date(isoString).getTime();
  if (Number.isNaN(then)) return null;
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return 'moments ago';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.round(mins / 60);
  return `${hours} hour${hours === 1 ? '' : 's'} ago`;
}

function initAiPulse() {
  const starsEl = document.getElementById('ai-pulse-stars');
  const issuesEl = document.getElementById('ai-pulse-issues');
  const deltaEl = document.getElementById('ai-pulse-delta');
  const updatedEl = document.getElementById('ai-pulse-updated');
  const pulse = document.getElementById('ai-pulse');
  if (!starsEl || !issuesEl || !deltaEl || !pulse) return;

  // don't show "0" while still loading -- an em dash reads as "not loaded
  // yet," not "zero stars"
  starsEl.textContent = '—';
  issuesEl.textContent = '—';

  const ANIMATION_MS = 1400;

  fetch('github_pulse.json', { cache: 'no-store' })
    .then((res) => {
      if (!res.ok) throw new Error('github_pulse.json not available');
      return res.json();
    })
    .then((data) => {
      const stars = Number(data.totalStars) || 0;
      const issues = Number(data.totalOpenIssues) || 0;
      const delta = Number(data.starsDeltaSinceLastRun) || 0;
      const reposTracked = Number(data.reposTracked) || 0;

      animateNumber(starsEl, 0, stars, ANIMATION_MS);
      animateNumber(issuesEl, 0, issues, ANIMATION_MS);
      if (delta > 0) {
        deltaEl.textContent = '+' + delta.toLocaleString('en-US') + ' stars since the last refresh';
      }

      // Prefer the last actually-measured value and its timestamp over a
      // continuously ticking extrapolated estimate -- a smooth-looking
      // counter implies a precision this data doesn't have (two snapshots
      // ~3 hours apart, not a real-time feed).
      const when = relativeTimeFrom(data.generatedAt);
      if (updatedEl) {
        const sample = reposTracked > 0 ? ` across ${reposTracked} tracked repositories (a sample of open-source AI activity, not all of it)` : '';
        updatedEl.textContent = when ? `Last updated ${when}${sample}.` : `${sample}`.replace(/^ /, '');
        updatedEl.hidden = !updatedEl.textContent;
      }
    })
    .catch(() => {
      // no data yet (first cron run hasn't happened) or fetch failed: hide
      // the whole widget rather than show stale/zero numbers as current
      pulse.style.display = 'none';
    });
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

function automatedSentimentLabel(score) {
  if (score > 0) return 'Automated sentiment: Positive';
  if (score < 0) return 'Automated sentiment: Negative';
  return 'Automated sentiment: Neutral';
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

const VOTE_DIRECTIONS = ['positive', 'negative', 'uncertain'];
const VOTE_LABELS = { positive: 'Positive', negative: 'Negative', uncertain: 'Not Sure' };
const VOTE_ICONS = {
  positive: 'char-mustache-thumbsup2.png',
  negative: 'char-mustache-thumbsdown2.png',
  uncertain: 'char-mustache-pointing2.png',
};

function initVerdict(newsItems) {
  const stage = document.getElementById('verdict-stage');
  const progress = document.getElementById('verdict-progress');
  if (!stage || !progress) return;

  const queue = (newsItems || [])
    .filter((it) => it.aiAnalysis)
    .slice(0, VERDICT_MAX_ITEMS)
    .map((it) => ({
      id: hashId(it.link),
      item: it,
      aiScore: aiSentimentScore(it.aiAnalysis),
      avatar: it.avatar || 'char-robot-head.png',
      // the source-level avatar is shared by every article from that feed,
      // so prefer the article's own photo when there is one -- that's what
      // actually makes the tile recognizable as *this* story
      image: (it.image && isSafeHttpUrl(it.image)) ? it.image : null,
    }));

  if (queue.length === 0) return; // nothing to show rather than fake data

  const myVotes = loadMyVerdictVotes();
  let index = 0;
  let serverAvailable = true; // flips permanently false on first failed call this session
  let currentCounts = null; // last known tally for the article on stage, so advance() can snapshot it as "previous"
  let previousResult = null; // { avatar, image, leading } captured from the article just left, or null on the first card

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

  function computeLeading(counts) {
    if (!counts) return null;
    const total = VOTE_DIRECTIONS.reduce((sum, d) => sum + (counts[d] || 0), 0);
    if (total === 0) return null;
    let best = VOTE_DIRECTIONS[0];
    VOTE_DIRECTIONS.forEach((d) => { if ((counts[d] || 0) > (counts[best] || 0)) best = d; });
    return { direction: best, pct: Math.round(((counts[best] || 0) / total) * 100) };
  }

  function buildResultTile(labelText, avatar, image, leading, isCurrent) {
    const tile = document.createElement('div');
    tile.className = 'verdict-result-tile' + (isCurrent ? ' verdict-result-tile-current' : ' verdict-result-tile-previous');

    const label = document.createElement('span');
    label.className = 'verdict-result-tile-label';
    label.textContent = labelText;
    tile.appendChild(label);

    const box = document.createElement('div');
    box.className = 'verdict-result-tile-box';
    const img = document.createElement('img');
    // prefer the article's own photo -- the shared per-feed avatar can't
    // tell two stories apart, defeating the point of "this specific story"
    img.src = image || avatar;
    img.onerror = () => { img.onerror = null; img.src = avatar; };
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    box.appendChild(img);

    const badge = document.createElement('span');
    badge.className = 'verdict-result-tile-badge verdict-result-tile-badge-empty';
    badge.textContent = '—';
    box.appendChild(badge);

    tile.appendChild(box);
    applyLeadingToBadge(badge, leading);
    return tile;
  }

  function applyLeadingToBadge(badge, leading) {
    badge.classList.remove(
      'verdict-result-tile-badge-empty',
      'verdict-result-tile-badge-positive',
      'verdict-result-tile-badge-negative',
      'verdict-result-tile-badge-uncertain'
    );
    if (leading) {
      badge.textContent = leading.pct + '%';
      badge.classList.add('verdict-result-tile-badge-' + leading.direction);
    } else {
      badge.textContent = '—';
      badge.classList.add('verdict-result-tile-badge-empty');
    }
  }

  function renderResultsStrip(avatar, image) {
    const strip = document.createElement('div');
    strip.className = 'verdict-results-strip';

    if (previousResult) {
      strip.appendChild(buildResultTile('Previous', previousResult.avatar, previousResult.image, previousResult.leading, false));
      const arrow = document.createElement('span');
      arrow.className = 'verdict-result-arrow';
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = '→';
      strip.appendChild(arrow);
    }

    strip.appendChild(buildResultTile('This story', avatar, image, null, true));
    return strip;
  }

  function updateCurrentTileBadge(leading) {
    const strip = document.getElementById('verdict-results-strip');
    if (!strip) return;
    const badge = strip.querySelector('.verdict-result-tile:last-child .verdict-result-tile-badge');
    if (badge) applyLeadingToBadge(badge, leading);
  }

  function renderSummary(counts, aiScore, myVote) {
    // re-queried each call, not captured once at init -- the element is
    // recreated fresh inside the card on every renderCard()
    const summary = document.getElementById('verdict-summary');
    if (!summary) return;
    summary.innerHTML = '';

    const aiSpan = document.createElement('span');
    aiSpan.className = 'verdict-ai-lean';
    aiSpan.textContent = automatedSentimentLabel(aiScore);
    summary.appendChild(aiSpan);

    const total = counts ? VOTE_DIRECTIONS.reduce((sum, d) => sum + (counts[d] || 0), 0) : 0;

    if (counts && total > 0) {
      // big, odds-board-style numbers instead of a dense text line -- the
      // count is the thing readers actually scan for here
      const caption = document.createElement('span');
      caption.className = 'verdict-community';
      caption.textContent = `Reader responses (${total})`;
      summary.appendChild(caption);

      const mini = document.createElement('div');
      mini.className = 'verdict-results-mini';
      VOTE_DIRECTIONS.forEach((d) => {
        const pct = Math.round(((counts[d] || 0) / total) * 100);
        const item = document.createElement('div');
        item.className = `verdict-results-mini-item verdict-results-mini-item-${d}`;
        const pctEl = document.createElement('span');
        pctEl.className = 'verdict-results-mini-pct';
        pctEl.textContent = pct + '%';
        item.appendChild(pctEl);
        mini.appendChild(item);
      });
      summary.appendChild(mini);
    } else {
      const communitySpan = document.createElement('span');
      communitySpan.className = 'verdict-community';
      if (counts) {
        communitySpan.textContent = 'No reader responses yet — be the first';
      } else if (myVote) {
        // no shared backend available, but we can still honestly reflect the
        // visitor's own choice -- never implying it represents other readers
        communitySpan.textContent = `Your reaction: ${VOTE_LABELS[myVote]}`;
      } else {
        communitySpan.textContent = 'Reader responses unavailable right now';
      }
      summary.appendChild(communitySpan);
    }
  }

  async function renderCard() {
    const { id, item, aiScore, avatar, image } = queue[index];
    progress.textContent = (index + 1) + ' / ' + queue.length;
    currentCounts = null;

    stage.innerHTML = '';
    const card = document.createElement('article');
    card.className = 'verdict-card';

    // three gently-bounded panels -- title, results, voting -- instead of
    // one continuous block, so each part of the card reads as its own group
    const titlePanel = document.createElement('div');
    titlePanel.className = 'verdict-panel verdict-title-panel';
    card.appendChild(titlePanel);

    const tag = document.createElement('span');
    tag.className = 'verdict-tag';
    tag.textContent = item.category || 'News';
    titlePanel.appendChild(tag);

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
    titlePanel.appendChild(h4);

    const myVote = myVotes[id];
    if (myVote) {
      const already = document.createElement('p');
      already.className = 'verdict-already-voted';
      already.textContent = 'You answered: ' + VOTE_LABELS[myVote];
      titlePanel.appendChild(already);
    } else {
      // the human vote is the primary action on this card -- the automated
      // sentiment line below is deliberately smaller/quieter than this
      const question = document.createElement('p');
      question.className = 'verdict-question';
      question.textContent = 'What do you think?';
      titlePanel.appendChild(question);
    }

    const resultsPanel = document.createElement('div');
    resultsPanel.className = 'verdict-panel verdict-results-panel';
    card.appendChild(resultsPanel);

    // Back / Skip flank the results as square arrow buttons, so navigation
    // sits beside the story it moves between instead of adding another row
    // of height at the bottom of the card.
    const makeNavBtn = (glyph, label, onClick) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'verdict-nav-btn';
      b.textContent = glyph;
      b.title = label;
      b.setAttribute('aria-label', label);
      b.addEventListener('click', onClick);
      return b;
    };
    resultsPanel.appendChild(makeNavBtn('\u2190', 'Previous story', goBack));

    const resultsInner = document.createElement('div');
    resultsInner.className = 'verdict-results-inner';
    resultsPanel.appendChild(resultsInner);

    // real vote tally goes above the buttons, not below, so readers see
    // where things stand before (or right after) answering
    const summaryEl = document.createElement('div');
    summaryEl.className = 'verdict-summary';
    summaryEl.id = 'verdict-summary';
    resultsInner.appendChild(summaryEl);

    const resultsStrip = renderResultsStrip(avatar, image);
    resultsStrip.id = 'verdict-results-strip';
    resultsInner.appendChild(resultsStrip);

    resultsPanel.appendChild(makeNavBtn('\u2192', 'Next story', advance));

    const votePanel = document.createElement('div');
    votePanel.className = 'verdict-panel verdict-voting-panel';
    card.appendChild(votePanel);

    const vote = document.createElement('div');
    vote.className = 'verdict-vote';
    VOTE_DIRECTIONS.forEach((direction) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `vote-btn vote-btn-${direction}` + (myVote === direction ? ' chosen' : '');
      const iconWrap = document.createElement('span');
      iconWrap.className = 'vote-btn-icon-wrap';
      const icon = document.createElement('img');
      icon.className = 'vote-btn-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.alt = '';
      icon.src = VOTE_ICONS[direction];
      iconWrap.appendChild(icon);
      btn.appendChild(iconWrap);
      btn.appendChild(document.createTextNode(VOTE_LABELS[direction]));
      btn.setAttribute('aria-label', 'Answer: ' + VOTE_LABELS[direction]);
      if (myVote) btn.disabled = true;
      btn.addEventListener('click', () => handleVote(id, direction));
      vote.appendChild(btn);
    });
    votePanel.appendChild(vote);

    stage.appendChild(card);

    renderSummary(null, aiScore, myVote);
    const counts = await fetchCounts(id);
    // only apply if still showing the same card (user may have skipped ahead already)
    if (queue[index].id === id) {
      renderSummary(counts, aiScore, myVote);
      currentCounts = counts;
      updateCurrentTileBadge(computeLeading(counts));
    }
  }

  async function handleVote(id, direction) {
    myVotes[id] = direction;
    saveMyVerdictVotes(myVotes);

    // lock the buttons and show "you answered" immediately -- don't wait for
    // the network call or the next render, otherwise a second click inside
    // the advance delay would submit a duplicate vote
    stage.querySelectorAll('.vote-btn').forEach((btn) => { btn.disabled = true; });
    stage.querySelector(`.vote-btn-${direction}`).classList.add('chosen');
    if (!stage.querySelector('.verdict-already-voted')) {
      const questionEl = stage.querySelector('.verdict-question');
      if (questionEl) questionEl.remove();
      const already = document.createElement('p');
      already.className = 'verdict-already-voted';
      already.textContent = 'You answered: ' + VOTE_LABELS[direction];
      stage.querySelector('.verdict-title-panel').appendChild(already);
    }

    const aiScore = queue[index].aiScore;
    renderSummary(null, aiScore, direction); // clear stale counts while the vote is in flight
    const counts = await postVote(id, direction);
    if (queue[index].id === id) {
      renderSummary(counts, aiScore, direction);
      currentCounts = counts;
      updateCurrentTileBadge(computeLeading(counts));
    }

    setTimeout(advance, VERDICT_ADVANCE_DELAY_MS);
  }

  function step(delta) {
    previousResult = { avatar: queue[index].avatar, image: queue[index].image, leading: computeLeading(currentCounts) };
    index = (index + delta + queue.length) % queue.length;
    renderCard();
  }

  function advance() { step(1); }
  function goBack() { step(-1); }

  renderCard();
}

const RADIO_STATIONS = [
  { name: 'Lo-Fi', slug: 'lo-fi' },
  { name: 'Ambient', slug: 'ambient' },
  { name: 'Synthwave', slug: 'synthwave' },
  { name: 'Chillout', slug: 'chillout' },
  { name: 'Focus Study', slug: 'focus_study' },
  { name: 'Hip Hop', slug: 'hip_hop' },
  { name: 'Jazz', slug: 'jazz' },
  { name: 'Classical', slug: 'classical' },
  { name: 'Zen', slug: 'zen' },
];

const RADIO_FLOAT_CLOSED_KEY = 'ai_stream_radio_float_closed';

function initRadio() {
  const player = document.getElementById('radio-player');
  const stationsWrap = document.getElementById('radio-stations');
  const audio = document.getElementById('radio-audio');
  const playBtn = document.getElementById('radio-play-btn');
  const playIcon = document.getElementById('radio-play-icon');
  const statusEl = document.getElementById('radio-status');
  const nameEl = document.getElementById('radio-station-name');
  if (!player || !stationsWrap || !audio || !playBtn || !playIcon || !statusEl || !nameEl) return;

  // the floating mini-player mirrors the same <audio> element and state --
  // it's a persistent, always-visible remote for the section player below,
  // not a second independent player
  const floatEl = document.getElementById('radio-float');
  const floatClose = document.getElementById('radio-float-close');
  const floatPlay = document.getElementById('radio-float-play');
  const floatPlayIcon = document.getElementById('radio-float-play-icon');
  const floatStatus = document.getElementById('radio-float-status');
  const floatStation = document.getElementById('radio-float-station');
  const restoreBtn = document.getElementById('radio-float-restore');

  function setStatus(text, isPlaying) {
    statusEl.textContent = text;
    if (floatStatus) floatStatus.textContent = isPlaying ? text : 'AI Radio';
  }

  function setStationName(name) {
    nameEl.textContent = name;
    if (floatStation) floatStation.textContent = name;
  }

  function setPlayingUI(isPlaying) {
    playIcon.textContent = isPlaying ? '❚❚' : '▶';
    playBtn.setAttribute('aria-label', isPlaying ? 'Pause radio' : 'Play radio');
    player.classList.toggle('playing', isPlaying);
    if (floatPlayIcon) floatPlayIcon.textContent = isPlaying ? '❚❚' : '▶';
    if (floatPlay) floatPlay.setAttribute('aria-label', isPlaying ? 'Pause AI Radio' : 'Play AI Radio');
    if (floatEl) floatEl.classList.toggle('playing', isPlaying);
  }

  function play() {
    setStatus('Loading…', true);
    audio.play().then(() => {
      setStatus('Live', true);
      setPlayingUI(true);
    }).catch(() => {
      setStatus("Couldn't connect to the stream", true);
      setPlayingUI(false);
    });
  }

  function pause() {
    audio.pause();
    setStatus('Paused', false);
    setPlayingUI(false);
  }

  function selectStation(station, btn) {
    stationsWrap.querySelectorAll('.radio-station-btn').forEach((b) => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    setStationName(station.name);
    audio.src = `https://radio.musicradio.ai/listen/music_radio_${station.slug}/radio.mp3`;
    playBtn.disabled = false;
    play();
  }

  RADIO_STATIONS.forEach((station) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'radio-station-btn';
    btn.textContent = station.name;
    btn.setAttribute('role', 'listitem');
    btn.addEventListener('click', () => selectStation(station, btn));
    stationsWrap.appendChild(btn);
  });

  playBtn.addEventListener('click', () => {
    if (!audio.src) return;
    if (audio.paused) play(); else pause();
  });

  if (floatPlay) {
    floatPlay.addEventListener('click', () => {
      if (!audio.src) {
        selectStation(RADIO_STATIONS[0], stationsWrap.querySelector('.radio-station-btn'));
        return;
      }
      if (audio.paused) play(); else pause();
    });
  }

  // sync the button/EQ to the audio element's real state, not just to our
  // own play()/pause() calls -- a hardware media key or OS media control
  // can pause/resume it directly, bypassing our buttons entirely
  audio.addEventListener('play', () => setPlayingUI(true));
  audio.addEventListener('pause', () => {
    setPlayingUI(false);
    setStatus('Paused', false);
  });
  audio.addEventListener('waiting', () => setStatus('Buffering…', true));
  audio.addEventListener('playing', () => setStatus('Live', true));
  audio.addEventListener('error', () => {
    setStatus('Stream unavailable right now', false);
    setPlayingUI(false);
  });

  // floating mini-player: visible by default so it's discoverable without
  // scrolling; a closed choice is remembered, but a restore tab always
  // stays reachable so it's never permanently gone
  if (floatEl && restoreBtn) {
    let closed = false;
    try { closed = localStorage.getItem(RADIO_FLOAT_CLOSED_KEY) === '1'; } catch (e) { /* ignore */ }

    if (closed) {
      restoreBtn.classList.add('visible');
    } else {
      floatEl.classList.add('visible');
    }

    if (floatClose) {
      floatClose.addEventListener('click', () => {
        floatEl.classList.remove('visible');
        restoreBtn.classList.add('visible');
        try { localStorage.setItem(RADIO_FLOAT_CLOSED_KEY, '1'); } catch (e) { /* ignore */ }
      });
    }

    restoreBtn.addEventListener('click', () => {
      restoreBtn.classList.remove('visible');
      floatEl.classList.add('visible');
      try { localStorage.removeItem(RADIO_FLOAT_CLOSED_KEY); } catch (e) { /* ignore */ }
    });
  }
}

// Light palate cleanser between the reading list and the newsletter CTA.
// The jokes are a fixed, hand-reviewed list in jokes.json -- nothing is
// generated at runtime, so there's no cost, no API key, and nothing
// unvetted can reach the page. The section stays hidden unless the file
// actually loads, rather than showing an empty card.
function initJokes() {
  const section = document.getElementById('jokes');
  const textEl = document.getElementById('joke-text');
  const btn = document.getElementById('joke-next');
  if (!section || !textEl || !btn) return;

  let jokes = [];
  let lastIndex = -1;

  function pick() {
    if (jokes.length === 0) return;
    let i = Math.floor(Math.random() * jokes.length);
    // avoid showing the same one twice in a row
    while (jokes.length > 1 && i === lastIndex) {
      i = Math.floor(Math.random() * jokes.length);
    }
    lastIndex = i;
    return jokes[i];
  }

  function show(animate) {
    const joke = pick();
    if (!joke) return;
    if (!animate) {
      textEl.textContent = joke;
      return;
    }
    textEl.classList.add('fading');
    setTimeout(() => {
      textEl.textContent = joke;
      textEl.classList.remove('fading');
    }, 180);
  }

  fetch('jokes.json', { cache: 'no-store' })
    .then((res) => {
      if (!res.ok) throw new Error('jokes.json not available');
      return res.json();
    })
    .then((data) => {
      jokes = Array.isArray(data.jokes) ? data.jokes.filter((j) => typeof j === 'string' && j.trim()) : [];
      if (jokes.length === 0) return;
      show(false);
      section.hidden = false;
    })
    .catch(() => {
      // leave the section hidden -- better than an empty card
    });

  btn.addEventListener('click', () => show(true));
}

// Ranked bar chart of the companies named most often across tracked stories.
// Counts are computed live from news.json so the chart tracks the 3-hourly
// refresh instead of going stale.
//
// Form: a pie was the original ask, but the tail here is a run of near-equal
// 1-2 story values -- unreadable as slivers. Ranked bars keep the long names
// legible and make the ranking the point. Color is sequential (one hue,
// brightest = largest), which is the correct job for magnitude and is
// redundant with the printed value, so nothing is encoded by color alone.
const COVERAGE_RAMP = ['#f9db8c', '#dfc57e', '#c7af6f', '#ae9961', '#978554', '#807046'];
// Categorical hues for the pie view, in fixed order. Validated on this site's
// dark surface: every hue sits in the dark lightness band, clears the chroma
// floor, and clears 3:1 contrast. Adjacent pairs pass CVD separation; some
// non-adjacent pairs do NOT (aqua/magenta are near-identical to deuteranopes),
// which is why every slice is directly labeled -- colour is reinforcement
// here, never the only way to tell slices apart.
const COVERAGE_HUES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300'];
const COVERAGE_TOP_N = 6;
const COVERAGE_VIEW_KEY = 'ai_stream_coverage_view';

function initCoverageChart() {
  const section = document.getElementById('coverage');
  const chart = document.getElementById('coverage-chart');
  const note = document.getElementById('coverage-note');
  if (!section || !chart || !note) return;

  fetch('news.json', { cache: 'no-store' })
    .then((res) => {
      if (!res.ok) throw new Error('news.json not available');
      return res.json();
    })
    .then((data) => {
      const items = Array.isArray(data.items) ? data.items : [];
      if (items.length === 0) return;

      const counts = new Map();
      let taggedStories = 0;
      items.forEach((item) => {
        const companies = (item.aiAnalysis && item.aiAnalysis.companies) || [];
        if (companies.length > 0) taggedStories += 1;
        companies.forEach((name) => counts.set(name, (counts.get(name) || 0) + 1));
      });

      const top = [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, COVERAGE_TOP_N);
      if (top.length === 0) return;

      const max = top[0][1];
      const frag = document.createDocumentFragment();

      top.forEach(([name, count]) => {
        const row = document.createElement('div');
        row.className = 'coverage-row';
        row.title = `${name}: ${count} of ${items.length} tracked stories`;

        const label = document.createElement('span');
        label.className = 'coverage-name';
        label.textContent = name;

        const track = document.createElement('div');
        track.className = 'coverage-track';
        const bar = document.createElement('div');
        bar.className = 'coverage-bar';
        // step the ramp by value, not by rank -- two companies on the same
        // count must read as the same shade
        const step = Math.round((1 - count / max) * (COVERAGE_RAMP.length - 1));
        bar.style.background = COVERAGE_RAMP[Math.min(step, COVERAGE_RAMP.length - 1)];
        track.appendChild(bar);

        const value = document.createElement('span');
        value.className = 'coverage-value';
        value.textContent = count;

        row.append(label, track, value);
        frag.appendChild(row);
        // widen after insertion so the transition actually runs
        requestAnimationFrame(() => {
          bar.style.width = Math.round((count / max) * 100) + '%';
        });
      });

      chart.appendChild(frag);
      renderCoveragePie(top, items.length);
      initCoverageToggle();
      note.innerHTML =
        'Counted across ' + items.length + ' tracked stories; ' + taggedStories +
        ' of them name at least one company. Names are extracted by keyword match, ' +
        'so a story can name a company without being about it — see our ' +
        '<a href="methodology.html">methodology</a>.';
      section.hidden = false;
    })
    .catch(() => {
      // leave the section hidden rather than show an empty chart
    });
}

// Donut view of the same data. Every slice is directly labeled with its name
// and value, so identity never depends on telling two hues apart.
function renderCoveragePie(top, storyCount) {
  const host = document.getElementById('coverage-pie');
  if (!host) return;

  const W = 460, H = 320, CX = 230, CY = 156, R = 84, RING = 30;
  const total = top.reduce((sum, [, count]) => sum + count, 0);
  if (total === 0) return;

  const SVG = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Donut chart of the most-mentioned companies in tracked stories');

  const pt = (angle, radius) => [
    CX + radius * Math.cos(angle - Math.PI / 2),
    CY + radius * Math.sin(angle - Math.PI / 2),
  ];

  const GAP = 0.018; // ~2px of surface between segments
  let angle = 0;

  top.forEach(([name, count], i) => {
    const sweep = (count / total) * Math.PI * 2;
    const a0 = angle + GAP / 2;
    const a1 = angle + sweep - GAP / 2;
    const mid = angle + sweep / 2;
    angle += sweep;
    if (a1 <= a0) return;

    const rOut = R + RING / 2, rIn = R - RING / 2;
    const [x0, y0] = pt(a0, rOut), [x1, y1] = pt(a1, rOut);
    const [x2, y2] = pt(a1, rIn), [x3, y3] = pt(a0, rIn);
    const large = a1 - a0 > Math.PI ? 1 : 0;

    const seg = document.createElementNS(SVG, 'path');
    seg.setAttribute('d',
      `M ${x0} ${y0} A ${rOut} ${rOut} 0 ${large} 1 ${x1} ${y1} ` +
      `L ${x2} ${y2} A ${rIn} ${rIn} 0 ${large} 0 ${x3} ${y3} Z`);
    seg.setAttribute('fill', COVERAGE_HUES[i % COVERAGE_HUES.length]);
    const pct = Math.round((count / total) * 100);
    const title = document.createElementNS(SVG, 'title');
    title.textContent = `${name}: ${count} mentions (${pct}% of the top ${top.length})`;
    seg.appendChild(title);
    svg.appendChild(seg);

    // leader line + direct label
    const right = Math.cos(mid - Math.PI / 2) >= 0;
    const [lx0, ly0] = pt(mid, rOut + 3);
    const [lx1, ly1] = pt(mid, rOut + 14);
    const tx = right ? lx1 + 6 : lx1 - 6;
    const leader = document.createElementNS(SVG, 'path');
    leader.setAttribute('class', 'coverage-pie-leader');
    leader.setAttribute('d', `M ${lx0} ${ly0} L ${lx1} ${ly1} L ${tx} ${ly1}`);
    svg.appendChild(leader);

    const label = document.createElementNS(SVG, 'text');
    label.setAttribute('class', 'coverage-pie-label');
    label.setAttribute('x', right ? tx + 3 : tx - 3);
    label.setAttribute('y', ly1 - 1);
    label.setAttribute('text-anchor', right ? 'start' : 'end');
    label.textContent = name;
    svg.appendChild(label);

    const sub = document.createElementNS(SVG, 'text');
    sub.setAttribute('class', 'coverage-pie-sub');
    sub.setAttribute('x', right ? tx + 3 : tx - 3);
    sub.setAttribute('y', ly1 + 15);
    sub.setAttribute('text-anchor', right ? 'start' : 'end');
    sub.textContent = `${count} · ${pct}%`;
    svg.appendChild(sub);
  });

  const cv = document.createElementNS(SVG, 'text');
  cv.setAttribute('class', 'coverage-pie-center-value');
  cv.setAttribute('x', CX); cv.setAttribute('y', CY + 2);
  cv.setAttribute('text-anchor', 'middle');
  cv.textContent = total;
  svg.appendChild(cv);

  const cl = document.createElementNS(SVG, 'text');
  cl.setAttribute('class', 'coverage-pie-center-label');
  cl.setAttribute('x', CX); cl.setAttribute('y', CY + 27);
  cl.setAttribute('text-anchor', 'middle');
  cl.textContent = 'MENTIONS';
  svg.appendChild(cl);

  host.innerHTML = '';
  host.appendChild(svg);
}

function initCoverageToggle() {
  const barsBtn = document.getElementById('coverage-view-bars');
  const pieBtn = document.getElementById('coverage-view-pie');
  const bars = document.getElementById('coverage-chart');
  const pie = document.getElementById('coverage-pie');
  if (!barsBtn || !pieBtn || !bars || !pie) return;

  function setView(view) {
    const isPie = view === 'pie';
    pie.hidden = !isPie;
    bars.hidden = isPie;
    pieBtn.classList.toggle('is-active', isPie);
    barsBtn.classList.toggle('is-active', !isPie);
    pieBtn.setAttribute('aria-pressed', String(isPie));
    barsBtn.setAttribute('aria-pressed', String(!isPie));
    try { localStorage.setItem(COVERAGE_VIEW_KEY, view); } catch (e) { /* ignore */ }
  }

  barsBtn.addEventListener('click', () => setView('bars'));
  pieBtn.addEventListener('click', () => setView('pie'));

  let saved = null;
  try { saved = localStorage.getItem(COVERAGE_VIEW_KEY); } catch (e) { /* ignore */ }
  if (saved === 'pie') setView('pie');
}
