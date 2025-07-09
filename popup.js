document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  // Simplified: Directly fetch stats when the popup opens.
  fetchAndDisplayPersonalStats();

  document.getElementById('search-tag-btn').addEventListener('click', fetchAndDisplayTagTrends);
  document.getElementById('tag-input').addEventListener('keyup', (event) => {
    if (event.key === 'Enter') fetchAndDisplayTagTrends();
  });
  
  document.getElementById('search-author-btn').addEventListener('click', fetchAndDisplayAuthorStats);
  document.getElementById('author-input').addEventListener('keyup', (event) => {
    if (event.key === 'Enter') fetchAndDisplayAuthorStats();
  });
  document.getElementById('export-csv-btn').addEventListener('click', exportArticlesToCSV);
  document.getElementById('export-image-btn').addEventListener('click', exportArticlesToImage);
  document.getElementById('sort-metric').addEventListener('change', () => renderPersonalStats(window._lastPersonalStatsData));
  document.getElementById('search-publication-btn').addEventListener('click', fetchAndDisplayPublicationStats);
  document.getElementById('viz-tab-views').addEventListener('click', () => setVizTab('views'));
  document.getElementById('viz-tab-reads').addEventListener('click', () => setVizTab('reads'));
  document.getElementById('viz-tab-claps').addEventListener('click', () => setVizTab('claps'));
});

// Store cached data with a timestamp so authors can track trends over time
function cacheData(key, value) {
  const entry = { timestamp: new Date().toISOString(), data: value };
  chrome.storage.local.get([key], result => {
    const history = result[key] || [];
    history.push(entry);
    chrome.storage.local.set({ [key]: history });
  });
}

function initTabs() {
  const tabLinks = document.querySelectorAll('.tab-link');
  const tabContents = document.querySelectorAll('.tab-content');
  tabLinks.forEach(tab => {
    tab.addEventListener('click', () => {
      tabLinks.forEach(item => item.classList.remove('active'));
      tabContents.forEach(item => item.classList.remove('active'));
      tab.classList.add('active');
      const contentId = tab.id.replace('tab-', 'content-');
      document.getElementById(contentId).classList.add('active');
    });
  });
}

// --- PERSONAL STATS LOGIC ---
async function fetchAndDisplayPersonalStats() {
  const loader = document.getElementById('loader');
  const errorEl = document.getElementById('error-message-personal');
  const contentEl = document.getElementById('stats-content-personal');
  // Hide content and show loader
  contentEl.style.display = 'none';
  loader.style.display = 'block';
  errorEl.style.display = 'none';

  console.log('[SuperStats] Popup: Requesting stats from content script...');

  function handleStats(articles, error) {
    console.log('[SuperStats] Popup: Received stats:', articles, 'Error:', error);
    if (error) {
      errorEl.textContent = 'Error: ' + error;
      errorEl.style.display = 'block';
      loader.style.display = 'none';
      return;
    }
    if (!articles || articles.length === 0) {
      errorEl.textContent = 'No stats data found.';
      errorEl.style.display = 'block';
      loader.style.display = 'none';
      return;
    }
    const parsed = articles.map(a => ({
      title: a.title,
      totalStats: { views: a.views, reads: a.reads },
      fans: a.fans
    }));
    renderPersonalStats({ user: { postsConnection: { edges: parsed.map(a => ({ node: a })) } } });
    cacheData('personalStatsHistory', { user: { postsConnection: { edges: parsed.map(a => ({ node: a })) } } });
    errorEl.style.display = 'none';
    loader.style.display = 'none';
    contentEl.style.display = 'block';
  }

  // Listen for stats from content script
  chrome.runtime.onMessage.addListener(function listener(msg, sender, sendResponse) {
    if (msg && msg.type === 'SUPERSTATS_STATS') {
      chrome.runtime.onMessage.removeListener(listener);
      handleStats(msg.articles, msg.error);
    }
  });

  // Robustly find any open Medium tab
  chrome.tabs.query({}, tabs => {
    // Find all open Medium tabs
    const mediumTabs = tabs.filter(tab => tab.url && tab.url.includes('medium.com'));
    const statsTab = mediumTabs.find(tab => tab.url.includes('/stats')) || mediumTabs[0];
    if (!mediumTabs.length) {
      errorEl.innerHTML = 'Please open <a href="https://medium.com/me/stats" target="_blank">your Medium stats page</a> in a new tab, then click the button below.' +
        '<br><button id="superstats-request-btn">Open Stats Page</button>';
      errorEl.style.display = 'block';
      loader.style.display = 'none';
      contentEl.style.display = 'block';
      document.getElementById('superstats-request-btn').onclick = () => {
        chrome.tabs.create({ url: 'https://medium.com/me/stats' });
      };
      return;
    }
    // Try to send a message to the stats tab (or any Medium tab)
    chrome.tabs.sendMessage(statsTab.id, { type: 'SUPERSTATS_REQUEST_STATS' }, response => {
      if (chrome.runtime.lastError) {
        errorEl.innerHTML = 'Could not connect to the stats page. Please make sure your stats page is open and fully loaded, then click retry.' +
          '<br><button id="superstats-retry-btn">Retry</button>';
        errorEl.style.display = 'block';
        loader.style.display = 'none';
        contentEl.style.display = 'block';
        document.getElementById('superstats-retry-btn').onclick = () => {
          fetchAndDisplayPersonalStats();
        };
        return;
      }
      if (response && response.articles) {
        handleStats(response.articles, response.error);
      } else {
        errorEl.innerHTML = 'If your stats do not appear, please refresh <a href="https://medium.com/me/stats" target="_blank">your Medium stats page</a> and click the button below.' +
          '<br><button id="superstats-retry-btn">Retry</button>';
        errorEl.style.display = 'block';
        loader.style.display = 'none';
        contentEl.style.display = 'block';
        document.getElementById('superstats-retry-btn').onclick = () => {
          fetchAndDisplayPersonalStats();
        };
      }
    });
  });
}

// --- EXPORT LOGIC ---
function exportArticlesToCSV() {
  const table = document.getElementById('articles-table');
  let csv = '';
  for (let row of table.rows) {
    let rowData = [];
    for (let cell of row.cells) {
      rowData.push('"' + cell.innerText.replace(/"/g, '""') + '"');
    }
    csv += rowData.join(',') + '\n';
  }
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'medium-articles.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function exportArticlesToImage() {
  const table = document.getElementById('articles-table');
  html2canvas(table).then(canvas => {
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'medium-articles.png';
    a.click();
  });
}

// --- ADVANCED METRICS & SORTING ---
async function fetchFansForArticles(articles) {
  // Fetch fans for each article by scraping its Medium page
  const delay = ms => new Promise(res => setTimeout(res, ms));
  const results = [];
  for (const post of articles) {
    try {
      const response = await fetch(`https://medium.com/p/${post.id}`);
      if (!response.ok) throw new Error('Failed to fetch article');
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      let fans = 0;
      let fansEl = doc.querySelector('[data-test-id="fansCount"]');
      if (fansEl && fansEl.textContent.match(/\d/)) {
        fans = parseInt(fansEl.textContent.replace(/,/g, '').match(/\d+/)[0], 10);
      } else {
        const allEls = Array.from(doc.querySelectorAll('*'));
        for (const el of allEls) {
          if (el.textContent && el.textContent.toLowerCase().includes('fan')) {
            const match = el.textContent.replace(/,/g, '').match(/\d+/);
            if (match) { fans = parseInt(match[0], 10); break; }
          }
        }
        if (!fans) {
          const match = html.replace(/,/g, '').match(/([0-9]{1,3}(?:,[0-9]{3})*|\d+)\s*fan/);
          if (match) fans = parseInt(match[1].replace(/,/g, ''), 10);
        }
      }
      results.push({ ...post, fans });
    } catch {
      results.push({ ...post, fans: 0 });
    }
    await delay(300); // avoid rate-limiting
  }
  return results;
}

// Remove Chart.js CDN loader
// function loadChartJs(callback) { ... }
// All code can now use Chart directly.

// --- MILESTONE LOGIC ---
const MILESTONES = [1000, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000];
function getNextMilestone(totalViews) {
  for (let i = 0; i < MILESTONES.length; i++) {
    if (totalViews < MILESTONES[i]) return MILESTONES[i];
  }
  return MILESTONES[MILESTONES.length - 1];
}
function getPrevMilestone(totalViews) {
  let prev = 0;
  for (let i = 0; i < MILESTONES.length; i++) {
    if (totalViews < MILESTONES[i]) return prev;
    prev = MILESTONES[i];
  }
  return prev;
}
// Remove progress bar, only show milestone dots and concise label
function updateMilestoneProgress(totalViews) {
  // No progress bar update
  document.getElementById('milestone-label').textContent = `${totalViews.toLocaleString()} views`; // concise label
}
// --- END MILESTONE LOGIC ---

// --- DUOLINGO-STYLE MILESTONE LOGIC ---
function renderMilestoneBadges(totalViews) {
  const container = document.getElementById('milestone-badges');
  if (!container) return;
  container.innerHTML = '';
  const MILESTONES = [1000, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000];
  const next = getNextMilestone(totalViews);
  MILESTONES.forEach(milestone => {
    const badge = document.createElement('span');
    badge.className = 'milestone-dot' + (totalViews >= milestone ? ' achieved' : '') + (milestone === next ? ' current' : '');
    badge.title = milestone.toLocaleString() + ' views';
    badge.innerHTML = totalViews >= milestone ? '●' : '○';
    container.appendChild(badge);
  });
}
// --- END DUOLINGO-STYLE MILESTONE LOGIC ---

// --- CHART LOGIC ---
function renderStatsChart(articles) {
  const ctx = document.getElementById('stats-chart').getContext('2d');
  if (window._statsChart) window._statsChart.destroy();
  const colors = {
    views: '#00ab6c',
    reads: '#ffc700',
    claps: '#1a8917'
  };
  let chartData;
  if (articles && articles.length > 0) {
    let label, data, color;
    if (currentVizTab === 'views') {
      label = 'Views';
      data = articles.map(a => a.totalStats.views);
      color = colors.views;
    } else if (currentVizTab === 'reads') {
      label = 'Reads';
      data = articles.map(a => a.totalStats.reads);
      color = colors.reads;
    } else {
      label = 'Claps';
      data = articles.map(a => typeof a.claps === 'number' ? a.claps : 0);
      color = colors.claps;
    }
    chartData = {
      labels: articles.map(a => a.title.slice(0, 20) + (a.title.length > 20 ? '…' : '')),
      datasets: [
        { label, data, backgroundColor: color, borderColor: '#fff', borderWidth: 2 }
      ]
    };
  } else {
    chartData = {
      labels: ['No Data'],
      datasets: [
        { label: 'No Data', data: [0], backgroundColor: '#e0e0e0', borderColor: '#fff', borderWidth: 2 }
      ]
    };
  }
  window._statsChart = new Chart(ctx, {
    type: 'bar',
    data: chartData,
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { x: { stacked: false }, y: { beginAtZero: true } },
      animation: { duration: 900, easing: 'easeOutBounce' },
      layout: { padding: 8 },
      elements: { bar: { borderRadius: 4 } },
      plugins: {
        legend: { display: false },
        title: { display: false },
        tooltip: { enabled: true }
      }
    }
  });
  // Make chart label smaller (if shown)
  const chartLegend = document.querySelector('.chartjs-legend');
  if (chartLegend) chartLegend.style.fontSize = '0.9em';
}
// --- END CHART LOGIC ---

function saveStatsHistory(data) {
  chrome.storage.local.get(['statsHistory'], result => {
    const history = result.statsHistory || [];
    history.push({ timestamp: new Date().toISOString(), data });
    chrome.storage.local.set({ statsHistory: history });
  });
}

function showStatsHistory() {
  chrome.storage.local.get(['statsHistory'], result => {
    const history = result.statsHistory || [];
    const list = document.getElementById('history-list');
    list.innerHTML = '';
    if (history.length === 0) {
      list.innerHTML = '<p>No history available.</p>';
      return;
    }
    history.slice().reverse().forEach(entry => {
      const div = document.createElement('div');
      div.className = 'history-entry';
      const date = new Date(entry.timestamp).toLocaleString();
      div.innerHTML = `<strong>${date}</strong><pre>${JSON.stringify(entry.data, null, 2)}</pre>`;
      list.appendChild(div);
    });
  });
}

document.getElementById('view-history-btn').addEventListener('click', () => {
  document.getElementById('history-modal').style.display = 'block';
  showStatsHistory();
});
document.getElementById('close-history-modal').addEventListener('click', () => {
  document.getElementById('history-modal').style.display = 'none';
});
window.onclick = function(event) {
  const modal = document.getElementById('history-modal');
  if (event.target === modal) modal.style.display = 'none';
};

// Update renderPersonalStats to update milestone, chart, and save history
async function renderPersonalStats(data) {
  if (!data || !data.user) return;
  window._lastPersonalStatsData = data;
  let articles = data.user.postsConnection.edges.map(edge => edge.node);
  window._lastPersonalStatsArticles = articles;
  const tableBody = document.querySelector('#articles-table tbody');
  tableBody.innerHTML = '<tr><td colspan="6">Loading fans and earnings...</td></tr>';
  articles = await fetchFansForArticles(articles);
  articles = await fetchPerArticleEarnings(articles);
  window._lastPersonalStatsArticles = articles;
  const sortMetric = document.getElementById('sort-metric').value;
  articles.sort((a, b) => {
    if (sortMetric === 'views') return b.totalStats.views - a.totalStats.views;
    if (sortMetric === 'reads') return b.totalStats.reads - a.totalStats.reads;
    if (sortMetric === 'readPercent') {
      const aPct = a.totalStats.views ? a.totalStats.reads / a.totalStats.views : 0;
      const bPct = b.totalStats.views ? b.totalStats.reads / b.totalStats.views : 0;
      return bPct - aPct;
    }
    if (sortMetric === 'fans') return (b.fans || 0) - (a.fans || 0);
    return 0;
  });
  tableBody.innerHTML = '';
  let totalReads = 0, totalViews = 0;
  articles.forEach(post => {
    totalReads += post.totalStats.reads;
    totalViews += post.totalStats.views;
    const readPercent = post.totalStats.views ? ((post.totalStats.reads / post.totalStats.views) * 100).toFixed(1) : '0';
    const fans = typeof post.fans === 'number' ? post.fans : '--';
    const earnings = post.earnings !== '--' ? post.earnings : `<span title='Per-article earnings not found. See summary above.'>--</span>`;
    const row = document.createElement('tr');
    row.id = `post-row-${post.id}`;
    row.className = 'clickable-row';
    row.title = `Click to open article`;
    row.addEventListener('click', () => {
      chrome.tabs.create({ url: `https://medium.com/p/${post.id}` });
    });
    row.innerHTML = `
      <td>${post.title}</td>
      <td>${post.totalStats.views.toLocaleString()}</td>
      <td>${post.totalStats.reads.toLocaleString()}</td>
      <td>${readPercent}%</td>
      <td>${fans}</td>
      <td>${earnings}</td>
    `;
    tableBody.appendChild(row);
  });
  const avgReadPercent = totalViews > 0 ? ((totalReads / totalViews) * 100).toFixed(1) : '0';
  document.getElementById('avg-read-percent').textContent = avgReadPercent + '%';
  updateMilestoneProgress(totalViews);
  renderMilestoneBadges(totalViews);
  renderStatsChart(articles);
  saveStatsHistory({
    totalViews,
    totalReads,
    avgReadPercent,
    articles: articles.map(a => ({
      title: a.title,
      views: a.totalStats.views,
      reads: a.totalStats.reads,
      fans: a.fans,
      earnings: a.earnings
    }))
  });
}

// --- EARNINGS SCRAPING LOGIC ---
async function fetchAndDisplayEarnings() {
  try {
    const response = await fetch('https://medium.com/me/partner-program/earnings', { credentials: 'include' });
    if (!response.ok) throw new Error('Could not fetch earnings page.');
    const htmlString = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    let earnings = '--';
    // Try multiple selectors and parse all visible text for $ amounts
    const selectors = [
      '[data-testid*="earnings"]',
      '[class*="earnings"]',
      'h2',
      'h3',
      'h4',
      'span',
      'div',
      '*'
    ];
    let found = false;
    for (const sel of selectors) {
      const els = doc.querySelectorAll(sel);
      for (const el of els) {
        if (el && el.offsetParent !== null) {
          const matches = el.textContent.match(/\$[\d,.]+/g);
          if (matches && matches.length > 0) {
            earnings = matches[0];
            found = true;
            break;
          }
        }
      }
      if (found) break;
    }
    if (!found) {
      // Try to find any number that looks like earnings
      const allText = doc.body.textContent;
      const matches = allText.match(/\$[\d,.]+/g);
      if (matches && matches.length > 0) {
        earnings = matches[0];
        found = true;
      }
    }
    if (!found) {
      document.getElementById('earnings').textContent = 'No earnings data found (not eligible or not available)';
    } else {
      document.getElementById('earnings').textContent = earnings;
    }
  } catch (e) {
    document.getElementById('earnings').textContent = 'No earnings data found (not eligible or not available)';
  }
}

// --- TAG SEARCH LOGIC ---
async function fetchAndDisplayTagTrends() {
  const loader = document.getElementById('loader');
  const errorEl = document.getElementById('error-message-trends');
  const resultsEl = document.getElementById('trends-results');
  const trendsSummaryEl = document.getElementById('trends-summary');
  const tag = document.getElementById('tag-input').value.trim().toLowerCase().replace(/\s+/g, '-');
  if (!tag) return;
  
  loader.style.display = 'block';
  errorEl.style.display = 'none';
  resultsEl.innerHTML = '';
  trendsSummaryEl.style.display = 'none';

  try {
    const response = await fetch(`https://medium.com/tag/${tag}`);
    if (!response.ok) throw new Error(`Could not fetch data for tag '${tag}'.`);
    const htmlString = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, "text/html");

    const totalStoriesEl = doc.querySelector('h2 + p, [data-testid="tag-page-header"] p');
    if (totalStoriesEl && totalStoriesEl.textContent.includes('Stories')) {
        document.getElementById('total-stories-count').textContent = totalStoriesEl.textContent.split(' ')[0];
        trendsSummaryEl.style.display = 'block';
    }

    const articles = doc.querySelectorAll('article');
    if (articles.length === 0) throw new Error(`No articles found. Medium's page structure may have changed.`);
    
    resultsEl.innerHTML = `<h3>Top stories in '${tag}'</h3>`;
    const cacheItems = [];
    articles.forEach(article => {
      const titleEl = article.querySelector('h2');
      const authorEl = article.querySelector('p a[href*="/@"]');
      const title = titleEl ? titleEl.textContent : 'No Title Found';
      const author = authorEl ? authorEl.textContent : 'Unknown Author';
      
      let articleLink = '#';
      const linkEl = titleEl ? titleEl.closest('a') : article.querySelector('a');
      if (linkEl) {
        articleLink = new URL(linkEl.getAttribute('href'), 'https://medium.com').href.split('?source=')[0];
      }

      const articleDiv = document.createElement('div');
      articleDiv.className = 'trend-article';
      articleDiv.innerHTML = `
        <h4 class="trend-title"><a href="${articleLink}" target="_blank" rel="noopener noreferrer">${title}</a></h4>
        <p class="trend-author">by ${author}</p>
      `;
      resultsEl.appendChild(articleDiv);
      cacheItems.push({ title, author, link: articleLink });
    });
    cacheData('tagTrendsHistory', { tag, articles: cacheItems });
  } catch (error) {
    console.error("Tag Trends Error:", error);
    errorEl.textContent = `Error: ${error.message}`;
    errorEl.style.display = 'block';
  } finally {
    loader.style.display = 'none';
  }
}

// --- AUTHOR SEARCH LOGIC ---
async function fetchAndDisplayAuthorStats() {
    const loader = document.getElementById('loader');
    const errorEl = document.getElementById('error-message-author');
    const resultsEl = document.getElementById('author-results');
    let username = document.getElementById('author-input').value.trim();
    if (username.startsWith('@')) {
        username = username.substring(1);
    }
    if (!username) return;

    loader.style.display = 'block';
    errorEl.style.display = 'none';
    resultsEl.innerHTML = '';

    try {
        const authorQuery = {
            query: `
                query UserProfile($username: ID!) {
                    user(username: $username) {
                        id
                        name
                        bio
                        postsConnection(first: 20) {
                            edges {
                                node {
                                    id
                                    title
                                }
                            }
                        }
                    }
                }
            `,
            variables: { username: username }
        };

        const response = await fetch('https://medium.com/_/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(authorQuery)
        });

        const authorData = await response.json();
        if (authorData.errors) throw new Error(authorData.errors[0].message);
        if (!authorData.data.user) throw new Error(`User "${username}" not found.`);

        const user = authorData.data.user;
        resultsEl.innerHTML = `<h3>Recent Articles by ${user.name}</h3>`;
        const posts = user.postsConnection.edges.map(edge => edge.node);
        const cacheItems = [];

        posts.forEach(post => {
            const articleDiv = document.createElement('div');
            articleDiv.className = 'trend-article';
            articleDiv.innerHTML = `
                <h4 class="trend-title"><a href="https://medium.com/p/${post.id}" target="_blank" rel="noopener noreferrer">${post.title}</a></h4>
            `;
            resultsEl.appendChild(articleDiv);
            cacheItems.push({ id: post.id, title: post.title });
        });

        cacheData('authorStatsHistory', { username, posts: cacheItems });

    } catch (error) {
        console.error("Author Search Error:", error);
        errorEl.textContent = `Error: ${error.message}`;
        errorEl.style.display = 'block';
    } finally {
        loader.style.display = 'none';
    }
}

// --- PUBLICATION ANALYTICS ---
async function fetchAndDisplayPublicationStats() {
  const loader = document.getElementById('loader');
  const errorEl = document.getElementById('error-message-publication');
  const resultsEl = document.getElementById('publication-results');
  const pubInput = document.getElementById('publication-input').value.trim();
  if (!pubInput) return;
  loader.style.display = 'block';
  errorEl.style.display = 'none';
  resultsEl.innerHTML = '';
  try {
    // Try to fetch publication page and parse stats (scraping, as API is limited)
    const pubUrl = pubInput.startsWith('http') ? pubInput : `https://medium.com/${pubInput}`;
    const response = await fetch(pubUrl);
    if (!response.ok) throw new Error('Could not fetch publication page.');
    const htmlString = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    // Try to extract publication stats (followers, articles, etc.)
    let followers = '--', articles = '--';
    const followersEl = doc.querySelector('[data-testid="followersCount"]') || doc.querySelector('a[href$="/followers"]');
    if (followersEl) followers = followersEl.textContent.match(/\d+[,.]?\d*/g)?.[0] || '--';
    const articlesEl = doc.querySelectorAll('article');
    articles = articlesEl.length;
    resultsEl.innerHTML = `<div class="summary-card"><h3>Publication Stats</h3><p>Followers: ${followers}</p><p>Articles: ${articles}</p></div>`;
  } catch (error) {
    errorEl.textContent = `Error: ${error.message}`;
    errorEl.style.display = 'block';
  } finally {
    loader.style.display = 'none';
  }
}

// --- EARNINGS SCRAPING LOGIC ---
async function fetchPerArticleEarnings(articles) {
  // Try to scrape per-article earnings from the Partner Program earnings page
  try {
    const response = await fetch('https://medium.com/me/partner-program/earnings', { credentials: 'include' });
    if (!response.ok) throw new Error('Could not fetch earnings page.');
    const htmlString = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    // Try to find all article earnings rows
    const earningsMap = {};
    const rows = doc.querySelectorAll('tr, .earningsTable-row, .tableRow');
    rows.forEach(row => {
      const cells = row.querySelectorAll('td, .earningsTable-cell, .tableCell');
      if (cells.length >= 2) {
        const title = cells[0].textContent.trim();
        const amountMatch = cells[1].textContent.match(/\$[\d,.]+/);
        if (title && amountMatch) {
          earningsMap[title] = amountMatch[0];
        }
      }
    });
    // Map earnings to articles by fuzzy title match
    return articles.map(post => {
      let earning = '--';
      for (const [title, amount] of Object.entries(earningsMap)) {
        if (post.title && title && post.title.slice(0, 20) === title.slice(0, 20)) {
          earning = amount;
          break;
        }
      }
      return { ...post, earnings: earning };
    });
  } catch {
    return articles.map(post => ({ ...post, earnings: '--' }));
  }
}

// --- PERSONAL STATS TABLE RENDER ---
async function renderPersonalStats(data) {
  if (!data || !data.user) return;
  window._lastPersonalStatsData = data;
  let articles = data.user.postsConnection.edges.map(edge => edge.node);
  window._lastPersonalStatsArticles = articles;
  const tableBody = document.querySelector('#articles-table tbody');
  tableBody.innerHTML = '<tr><td colspan="6">Loading fans and earnings...</td></tr>';
  articles = await fetchFansForArticles(articles);
  articles = await fetchPerArticleEarnings(articles);
  window._lastPersonalStatsArticles = articles;
  const sortMetric = document.getElementById('sort-metric').value;
  articles.sort((a, b) => {
    if (sortMetric === 'views') return b.totalStats.views - a.totalStats.views;
    if (sortMetric === 'reads') return b.totalStats.reads - a.totalStats.reads;
    if (sortMetric === 'readPercent') {
      const aPct = a.totalStats.views ? a.totalStats.reads / a.totalStats.views : 0;
      const bPct = b.totalStats.views ? b.totalStats.reads / b.totalStats.views : 0;
      return bPct - aPct;
    }
    if (sortMetric === 'fans') return (b.fans || 0) - (a.fans || 0);
    return 0;
  });
  tableBody.innerHTML = '';
  let totalReads = 0, totalViews = 0;
  articles.forEach(post => {
    totalReads += post.totalStats.reads;
    totalViews += post.totalStats.views;
    const readPercent = post.totalStats.views ? ((post.totalStats.reads / post.totalStats.views) * 100).toFixed(1) : '0';
    const fans = typeof post.fans === 'number' ? post.fans : '--';
    const earnings = post.earnings !== '--' ? post.earnings : `<span title='Per-article earnings not found. See summary above.'>--</span>`;
    const row = document.createElement('tr');
    row.id = `post-row-${post.id}`;
    row.className = 'clickable-row';
    row.title = `Click to open article`;
    row.addEventListener('click', () => {
      chrome.tabs.create({ url: `https://medium.com/p/${post.id}` });
    });
    row.innerHTML = `
      <td>${post.title}</td>
      <td>${post.totalStats.views.toLocaleString()}</td>
      <td>${post.totalStats.reads.toLocaleString()}</td>
      <td>${readPercent}%</td>
      <td>${fans}</td>
      <td>${earnings}</td>
    `;
    tableBody.appendChild(row);
  });
  const avgReadPercent = totalViews > 0 ? ((totalReads / totalViews) * 100).toFixed(1) : '0';
  document.getElementById('avg-read-percent').textContent = avgReadPercent + '%';
  updateMilestoneProgress(totalViews);
  renderMilestoneBadges(totalViews);
  renderStatsChart(articles);
  saveStatsHistory({
    totalViews,
    totalReads,
    avgReadPercent,
    articles: articles.map(a => ({
      title: a.title,
      views: a.totalStats.views,
      reads: a.totalStats.reads,
      fans: a.fans,
      earnings: a.earnings
    }))
  });
}
// --- END EARNINGS LOGIC ---

// --- TAG SEARCH LOGIC ---
async function fetchAndDisplayTagTrends() {
  const loader = document.getElementById('loader');
  const errorEl = document.getElementById('error-message-trends');
  const resultsEl = document.getElementById('trends-results');
  const trendsSummaryEl = document.getElementById('trends-summary');
  const tag = document.getElementById('tag-input').value.trim().toLowerCase().replace(/\s+/g, '-');
  if (!tag) return;
  
  loader.style.display = 'block';
  errorEl.style.display = 'none';
  resultsEl.innerHTML = '';
  trendsSummaryEl.style.display = 'none';

  try {
    const response = await fetch(`https://medium.com/tag/${tag}`);
    if (!response.ok) throw new Error(`Could not fetch data for tag '${tag}'.`);
    const htmlString = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, "text/html");

    const totalStoriesEl = doc.querySelector('h2 + p, [data-testid="tag-page-header"] p');
    if (totalStoriesEl && totalStoriesEl.textContent.includes('Stories')) {
        document.getElementById('total-stories-count').textContent = totalStoriesEl.textContent.split(' ')[0];
        trendsSummaryEl.style.display = 'block';
    }

    const articles = doc.querySelectorAll('article');
    if (articles.length === 0) throw new Error(`No articles found. Medium's page structure may have changed.`);
    
    resultsEl.innerHTML = `<h3>Top stories in '${tag}'</h3>`;
    const cacheItems = [];
    articles.forEach(article => {
      const titleEl = article.querySelector('h2');
      const authorEl = article.querySelector('p a[href*="/@"]');
      const title = titleEl ? titleEl.textContent : 'No Title Found';
      const author = authorEl ? authorEl.textContent : 'Unknown Author';
      
      let articleLink = '#';
      const linkEl = titleEl ? titleEl.closest('a') : article.querySelector('a');
      if (linkEl) {
        articleLink = new URL(linkEl.getAttribute('href'), 'https://medium.com').href.split('?source=')[0];
      }

      const articleDiv = document.createElement('div');
      articleDiv.className = 'trend-article';
      articleDiv.innerHTML = `
        <h4 class="trend-title"><a href="${articleLink}" target="_blank" rel="noopener noreferrer">${title}</a></h4>
        <p class="trend-author">by ${author}</p>
      `;
      resultsEl.appendChild(articleDiv);
      cacheItems.push({ title, author, link: articleLink });
    });
    cacheData('tagTrendsHistory', { tag, articles: cacheItems });
  } catch (error) {
    console.error("Tag Trends Error:", error);
    errorEl.textContent = `Error: ${error.message}`;
    errorEl.style.display = 'block';
  } finally {
    loader.style.display = 'none';
  }
}

// --- AUTHOR SEARCH LOGIC ---
async function fetchAndDisplayAuthorStats() {
    const loader = document.getElementById('loader');
    const errorEl = document.getElementById('error-message-author');
    const resultsEl = document.getElementById('author-results');
    let username = document.getElementById('author-input').value.trim();
    if (username.startsWith('@')) {
        username = username.substring(1);
    }
    if (!username) return;

    loader.style.display = 'block';
    errorEl.style.display = 'none';
    resultsEl.innerHTML = '';

    try {
        const authorQuery = {
            query: `
                query UserProfile($username: ID!) {
                    user(username: $username) {
                        id
                        name
                        bio
                        postsConnection(first: 20) {
                            edges {
                                node {
                                    id
                                    title
                                }
                            }
                        }
                    }
                }
            `,
            variables: { username: username }
        };

        const response = await fetch('https://medium.com/_/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(authorQuery)
        });

        const authorData = await response.json();
        if (authorData.errors) throw new Error(authorData.errors[0].message);
        if (!authorData.data.user) throw new Error(`User "${username}" not found.`);

        const user = authorData.data.user;
        resultsEl.innerHTML = `<h3>Recent Articles by ${user.name}</h3>`;
        const posts = user.postsConnection.edges.map(edge => edge.node);
        const cacheItems = [];

        posts.forEach(post => {
            const articleDiv = document.createElement('div');
            articleDiv.className = 'trend-article';
            articleDiv.innerHTML = `
                <h4 class="trend-title"><a href="https://medium.com/p/${post.id}" target="_blank" rel="noopener noreferrer">${post.title}</a></h4>
            `;
            resultsEl.appendChild(articleDiv);
            cacheItems.push({ id: post.id, title: post.title });
        });

        cacheData('authorStatsHistory', { username, posts: cacheItems });

    } catch (error) {
        console.error("Author Search Error:", error);
        errorEl.textContent = `Error: ${error.message}`;
        errorEl.style.display = 'block';
    } finally {
        loader.style.display = 'none';
    }
}

// --- PUBLICATION ANALYTICS ---
async function fetchAndDisplayPublicationStats() {
  const loader = document.getElementById('loader');
  const errorEl = document.getElementById('error-message-publication');
  const resultsEl = document.getElementById('publication-results');
  const pubInput = document.getElementById('publication-input').value.trim();
  if (!pubInput) return;
  loader.style.display = 'block';
  errorEl.style.display = 'none';
  resultsEl.innerHTML = '';
  try {
    // Try to fetch publication page and parse stats (scraping, as API is limited)
    const pubUrl = pubInput.startsWith('http') ? pubInput : `https://medium.com/${pubInput}`;
    const response = await fetch(pubUrl);
    if (!response.ok) throw new Error('Could not fetch publication page.');
    const htmlString = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    // Try to extract publication stats (followers, articles, etc.)
    let followers = '--', articles = '--';
    const followersEl = doc.querySelector('[data-testid="followersCount"]') || doc.querySelector('a[href$="/followers"]');
    if (followersEl) followers = followersEl.textContent.match(/\d+[,.]?\d*/g)?.[0] || '--';
    const articlesEl = doc.querySelectorAll('article');
    articles = articlesEl.length;
    resultsEl.innerHTML = `<div class="summary-card"><h3>Publication Stats</h3><p>Followers: ${followers}</p><p>Articles: ${articles}</p></div>`;
  } catch (error) {
    errorEl.textContent = `Error: ${error.message}`;
    errorEl.style.display = 'block';
  } finally {
    loader.style.display = 'none';
  }
}

// --- VISUALIZATION TABS LOGIC ---
let currentVizTab = 'views';
function setVizTab(tab) {
  currentVizTab = tab;
  document.querySelectorAll('.viz-tab').forEach(btn => btn.classList.remove('active'));
  document.getElementById('viz-tab-' + tab).classList.add('active');
  renderStatsChart(window._lastPersonalStatsArticles || []);
}
