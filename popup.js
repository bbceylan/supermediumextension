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

  try {
    const viewerQuery = { query: `query { viewer { id } }` };
    const viewerResponse = await fetch('https://medium.com/_/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(viewerQuery),
      credentials: 'include'
    });
    const viewerData = await viewerResponse.json();
    const userId = viewerData?.data?.viewer?.id;
    if (!userId) throw new Error("Could not find your User ID. Please ensure you are logged into Medium.com.");

    const statsQuery = {
      query: `
        query UserDashStats($userId: ID!, $after: String!) {
          user(id: $userId) {
            id
            socialStats {
              followerCount
            }
            postsConnection(first: 100, after: $after) {
              edges {
                node {
                  id
                  title
                  totalStats {
                    views
                    reads
                  }
                }
              }
            }
          }
        }
      `,
      variables: { userId: userId, after: "" }
    };

    const statsResponse = await fetch('https://medium.com/_/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(statsQuery),
      credentials: 'include'
    });
    const statsData = await statsResponse.json();
    if (statsData.errors) throw new Error(statsData.errors[0].message);

    renderPersonalStats(statsData.data);
    cacheData('personalStatsHistory', statsData.data);
    await fetchAndDisplayEarnings();
    
  } catch (error) {
    console.error("Personal Stats Error:", error);
    errorEl.textContent = `Error: ${error.message}`;
    errorEl.style.display = 'block';
  } finally {
    loader.style.display = 'none';
    // Show content area regardless of success or failure (to show either the data or the error)
    contentEl.style.display = 'block';
  }
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
async function fetchClapsAndFansForArticles(articles) {
  // Fetch claps and fans for each article by scraping its Medium page
  const results = await Promise.all(articles.map(async (post) => {
    try {
      const response = await fetch(`https://medium.com/p/${post.id}`);
      if (!response.ok) throw new Error('Failed to fetch article');
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      // Claps: look for button or span with aria-label or data-test-id
      let claps = 0;
      const clapsEl = doc.querySelector('[data-test-id="clapCount"]') || doc.querySelector('button[aria-label*="clap"] span');
      if (clapsEl) {
        const match = clapsEl.textContent.replace(/,/g, '').match(/\d+/);
        if (match) claps = parseInt(match[0], 10);
      }
      // Fans: look for a span or element with "fans" or "followers" (not always available)
      let fans = 0;
      const fansEl = doc.querySelector('[data-test-id="fansCount"]') || doc.querySelector('span:contains("fans")');
      if (fansEl) {
        const match = fansEl.textContent.replace(/,/g, '').match(/\d+/);
        if (match) fans = parseInt(match[0], 10);
      }
      return { ...post, claps, fans };
    } catch {
      return { ...post, claps: 0, fans: 0 };
    }
  }));
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
function updateMilestoneProgress(totalViews) {
  const next = getNextMilestone(totalViews);
  const prev = getPrevMilestone(totalViews);
  const percent = Math.min(100, ((totalViews - prev) / (next - prev)) * 100);
  document.getElementById('milestone-progress').style.width = percent + '%';
  document.getElementById('milestone-label').textContent = `${totalViews.toLocaleString()} / ${next.toLocaleString()} views (Next milestone)`;
}
function renderMilestoneBadges(totalViews) {
  const container = document.getElementById('milestone-badges');
  if (!container) return;
  container.innerHTML = '';
  MILESTONES.forEach(milestone => {
    const badge = document.createElement('span');
    badge.className = 'milestone-badge' + (totalViews >= milestone ? ' achieved' : '');
    badge.textContent = milestone >= 1000 ? (milestone/1000)+'K' : milestone;
    container.appendChild(badge);
  });
}
// --- END MILESTONE LOGIC ---

// --- CHART LOGIC ---
function renderStatsChart(articles) {
  const ctx = document.getElementById('stats-chart').getContext('2d');
  if (window._statsChart) window._statsChart.destroy();
  let chartData = articles && articles.length > 0 ? {
    labels: articles.map(a => a.title.slice(0, 20) + (a.title.length > 20 ? '…' : '')),
    datasets: [
      { label: 'Views', data: articles.map(a => a.totalStats.views), backgroundColor: '#e9b97a' },
      { label: 'Reads', data: articles.map(a => a.totalStats.reads), backgroundColor: '#b86b1b' },
      { label: 'Claps', data: articles.map(a => a.claps), backgroundColor: '#f7e7ce' }
    ]
  } : {
    labels: ['No Data'],
    datasets: [
      { label: 'Views', data: [0], backgroundColor: '#e9b97a' },
      { label: 'Reads', data: [0], backgroundColor: '#b86b1b' },
      { label: 'Claps', data: [0], backgroundColor: '#f7e7ce' }
    ]
  };
  window._statsChart = new Chart(ctx, {
    type: 'bar',
    data: chartData,
    options: {
      responsive: true,
      plugins: { legend: { display: true } },
      scales: { x: { stacked: true }, y: { beginAtZero: true } },
      animation: { duration: 900, easing: 'easeOutBounce' }
    }
  });
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
  document.getElementById('follower-count').textContent = data.user.socialStats.followerCount.toLocaleString() || '0';
  let articles = data.user.postsConnection.edges.map(edge => edge.node);
  const tableBody = document.querySelector('#articles-table tbody');
  tableBody.innerHTML = '<tr><td colspan="7">Loading claps and fans...</td></tr>';
  articles = await fetchClapsAndFansForArticles(articles);
  const sortMetric = document.getElementById('sort-metric').value;
  articles.sort((a, b) => {
    if (sortMetric === 'views') return b.totalStats.views - a.totalStats.views;
    if (sortMetric === 'reads') return b.totalStats.reads - a.totalStats.reads;
    if (sortMetric === 'readPercent') {
      const aPct = a.totalStats.views ? a.totalStats.reads / a.totalStats.views : 0;
      const bPct = b.totalStats.views ? b.totalStats.reads / b.totalStats.views : 0;
      return bPct - aPct;
    }
    if (sortMetric === 'claps') return b.claps - a.claps;
    if (sortMetric === 'fans') return b.fans - a.fans;
    return 0;
  });
  tableBody.innerHTML = '';
  let totalReads = 0, totalViews = 0;
  articles.forEach(post => {
    totalReads += post.totalStats.reads;
    totalViews += post.totalStats.views;
    const readPercent = post.totalStats.views ? ((post.totalStats.reads / post.totalStats.views) * 100).toFixed(1) : '0';
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
      <td>${post.claps}</td>
      <td>${post.fans}</td>
      <td>--</td>
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
      claps: a.claps,
      fans: a.fans
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
    // Try multiple selectors for robustness
    const selectors = [
      '[data-testid="earnings-summary"]',
      '[data-testid*="earnings"]',
      'h2',
      '.earnings',
      '.summary',
      'span',
      'div'
    ];
    for (const sel of selectors) {
      const el = doc.querySelector(sel);
      if (el && /\$[\d,.]+/.test(el.textContent)) {
        const match = el.textContent.match(/\$[\d,.]+/);
        if (match) { earnings = match[0]; break; }
      }
    }
    if (earnings === '--') {
      document.getElementById('earnings').textContent = 'No earnings data (not eligible or not available)';
    } else {
      document.getElementById('earnings').textContent = earnings;
    }
  } catch (e) {
    document.getElementById('earnings').textContent = 'No earnings data (not eligible or not available)';
  }
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
            body: JSON.stringify(authorQuery),
            credentials: 'include'
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
