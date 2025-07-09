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
      body: JSON.stringify(viewerQuery)
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
      body: JSON.stringify(statsQuery)
    });
    const statsData = await statsResponse.json();
    if (statsData.errors) throw new Error(statsData.errors[0].message);

    renderPersonalStats(statsData.data);
    cacheData('personalStatsHistory', statsData.data);
    
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

function renderPersonalStats(data) {
  if (!data || !data.user) return;
  
  document.getElementById('follower-count').textContent = data.user.socialStats.followerCount.toLocaleString() || '0';
  const articles = data.user.postsConnection.edges.map(edge => edge.node);
  
  articles.sort((a, b) => b.totalStats.views - a.totalStats.views);
  const tableBody = document.querySelector('#articles-table tbody');
  tableBody.innerHTML = '';
  
  articles.forEach(post => {
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
    `;
    tableBody.appendChild(row);
  });
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
    }}