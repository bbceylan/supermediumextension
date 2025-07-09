console.log('[SuperStats] Content script loaded');

// Attempt to parse article stats from any embedded Apollo state script.
function extractFromApolloState() {
  const script = Array.from(document.querySelectorAll('script')).find(s =>
    s.textContent.includes('__APOLLO_STATE__')
  );
  if (!script) return [];
  const match = script.textContent.match(/__APOLLO_STATE__\s*=\s*(\{.*\})/);
  if (!match) return [];
  try {
    const state = JSON.parse(match[1]);
    const articles = [];
    const postTitles = {};
    for (const [key, value] of Object.entries(state)) {
      if (key.startsWith('Post:') && value && value.title) {
        const id = key.split(':')[1];
        postTitles[id] = value.title;
      }
    }
    for (const [key, value] of Object.entries(state)) {
      if (
        value &&
        typeof value === 'object' &&
        'views' in value &&
        'reads' in value &&
        key.includes('PostStats:')
      ) {
        const id = value.postId || key.split(':')[1];
        const title = postTitles[id] || '';
        let earnings = '';
        if (typeof value.earnings === 'string') {
          earnings = value.earnings;
        } else if (value.earnings && typeof value.earnings.amount !== 'undefined') {
          earnings = '$' + value.earnings.amount;
        }
        articles.push({
          id,
          title,
          views: String(value.views),
          reads: String(value.reads),
          earnings,
        });
      }
    }
    return articles;
  } catch (err) {
    console.warn('[SuperStats] Failed to parse Apollo state', err);
    return [];
  }
}

function extractTableText(table) {
  const rows = Array.from(table.querySelectorAll('tr'));
  return rows.map(row => {
    const cells = Array.from(row.querySelectorAll('td,th'));
    return cells.map(cell => cell.innerText.trim() || cell.textContent.trim());
  });
}

function logCandidates() {
  // Log all tables
  const tables = document.querySelectorAll('table');
  console.log('[SuperStats] Tables found:', tables.length);
  tables.forEach((table, i) => {
    console.log(`[SuperStats] Table #${i} outerHTML:`, table.outerHTML.slice(0, 1000));
    const tableText = extractTableText(table);
    console.log(`[SuperStats] Table #${i} extracted text:`, tableText);
  });
  // Log large divs
  const divs = Array.from(document.querySelectorAll('div')).filter(d => d.children.length > 5);
  console.log('[SuperStats] Large divs:', divs.length);
  divs.slice(0, 3).forEach((div, i) => {
    // Only log structure/text for first 3
    const text = div.textContent.slice(0, 1000);
    console.log(`[SuperStats] Div #${i} textContent:`, text);
    function summarize(node, depth = 0) {
      if (depth > 3) return '...';
      const tag = node.tagName ? node.tagName.toLowerCase() : '';
      const children = Array.from(node.children || []);
      return tag + (children.length ? '(' + children.map(child => summarize(child, depth + 1)).join(',') + ')' : '');
    }
    console.log(`[SuperStats] Div #${i} structure:`, summarize(div));
  });
  // Log elements with role='table'
  const roleTables = document.querySelectorAll('[role="table"]');
  console.log('[SuperStats] Elements with role="table":', roleTables.length);
  roleTables.forEach((el, i) => {
    console.log(`[SuperStats] Role table #${i} outerHTML:`, el.outerHTML.slice(0, 1000));
  });
}

function extractArticlesFromTable() {
  // Find the stats table with the new obfuscated class
  const statsTable = document.querySelector('table.ji');
  if (!statsTable) {
    console.warn('[SuperStats] Stats table not found');
    return [];
  }
  const rows = statsTable.querySelectorAll('tbody tr');
  const articles = [];
  rows.forEach(row => {
    const tds = row.querySelectorAll('td');
    if (tds.length >= 2) {
      // Date (e.g., "Jul 2025")
      const dateDiv = tds[0].querySelector('div');
      const date = dateDiv ? dateDiv.textContent.trim() : '';

      // Title
      const titleH2 = tds[1].querySelector('h2');
      const title = titleH2 ? titleH2.textContent.trim() : '';

      // Prepare for future stat extraction from other tds
      // Example: const views = tds[2]?.textContent.trim() || '';

      articles.push({ date, title });
    }
  });
  console.log('[SuperStats] Extracted articles from table:', articles);
  return articles;
}

function logAllStatsDivs() {
  const divs = Array.from(document.querySelectorAll('div'));
  let found = 0;
  divs.forEach((div, idx) => {
    const txt = div.textContent;
    if (/View story|Reads|Views/.test(txt)) {
      found++;
      console.log(`[SuperStats] Stats div #${idx} textContent:`, txt.slice(0, 2000));
    }
  });
  if (found === 0) {
    console.warn('[SuperStats] No divs with stats keywords found.');
  } else {
    console.log(`[SuperStats] Found ${found} divs with stats keywords.`);
  }
}

function logStatsTextNodes() {
  let found = false;
  function searchNodes(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    let node;
    while ((node = walker.nextNode())) {
      if (/View story|Reads|Views/.test(node.textContent)) {
        found = true;
        console.log('[SuperStats] Stats text node:', node.textContent.slice(0, 2000));
      }
    }
  }
  searchNodes(document.body);
  if (!found) {
    console.warn('[SuperStats] No text nodes with stats keywords found. Will observe mutations for 10s...');
    // Observe for up to 10 seconds
    const observer = new MutationObserver(() => {
      searchNodes(document.body);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => {
      observer.disconnect();
      if (!found) {
        console.warn('[SuperStats] Still no text nodes with stats keywords after 10s.');
      }
    }, 10000);
  }
}

logStatsTextNodes();

// [SuperStats] Try to extract numbers near post links
(function logStatsNearPostLinks() {
  const postLinks = Array.from(document.querySelectorAll('a[href*="/me/stats/post/"]'));
  console.log(`[SuperStats] Found ${postLinks.length} post links.`);
  postLinks.forEach((a, i) => {
    console.log(`\n[SuperStats] Post link #${i}:`, a.outerHTML);
    const parent = a.parentElement;
    if (parent) {
      console.log(`[SuperStats] Parent text:`, parent.textContent);
      // Log all siblings' text
      const siblings = Array.from(parent.children);
      siblings.forEach((sib, j) => {
        if (sib !== a) {
          console.log(`[SuperStats] Sibling #${j} text:`, sib.textContent);
        }
      });
    }
    // Log next and previous siblings (sometimes numbers are there)
    if (a.nextElementSibling) {
      console.log(`[SuperStats] Next sibling text:`, a.nextElementSibling.textContent);
    }
    if (a.previousElementSibling) {
      console.log(`[SuperStats] Previous sibling text:`, a.previousElementSibling.textContent);
    }
  });
})();

// --- Robust Medium Stats Extraction ---

function getArticleRows() {
  // Try a couple of known table class patterns first
  let rows = document.querySelectorAll('table.ji tbody tr, table.stats-table tbody tr');
  if (rows.length) return rows;

  // Generic fallback: choose table with many numeric cells
  const tables = Array.from(document.querySelectorAll('table'));
  let best = null;
  let bestScore = 0;
  for (const table of tables) {
    const r = table.querySelectorAll('tbody tr');
    let score = 0;
    r.forEach(row => {
      const nums = Array.from(row.querySelectorAll('td')).filter(td => /[\d$]/.test(td.textContent)).length;
      if (nums >= 3) score++;
    });
    if (score > bestScore) { bestScore = score; best = r; }
  }
  if (best && best.length) return best;

  // Last resort: tables marked with role="table"
  rows = document.querySelectorAll('[role="table"] tbody tr');
  if (rows.length) return rows;
  return [];
}

function waitForStatsTable(callback, timeout = 10000) {
  let found = false;
  const check = () => {
    const rows = getArticleRows();
    if (rows.length) {
      found = true;
      callback(rows);
    }
  };
  check();
  if (found) return;

  const observer = new MutationObserver(() => {
    check();
    if (found) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  setTimeout(() => {
    if (!found) observer.disconnect();
  }, timeout);
}

function extractStatsFromRow(row) {
  const tds = row.querySelectorAll('td');
  let date = '', title = '', views = '', reads = '', earnings = '';
  if (tds.length >= 2) {
    date = tds[0].textContent.trim();
    const titleEl = tds[1].querySelector('h2, a');
    title = titleEl ? titleEl.textContent.trim() : tds[1].textContent.trim();

    const numericCells = Array.from(tds).slice(2).map(td => td.textContent.trim());
    numericCells.forEach(text => {
      if (!views && /^\d+[\d,\.Kk]*$/.test(text)) {
        views = text;
      } else if (!reads && /^\d+[\d,\.Kk]*$/.test(text)) {
        reads = text;
      } else if (!earnings && /^\$/.test(text)) {
        earnings = text;
      }
    });
  }
  return { date, title, views, reads, earnings };
}

function robustExtractArticles(callback) {
  // First try parsing embedded Apollo state (if available)
  let articles = extractFromApolloState();
  if (articles.length) {
    callback(articles);
    return;
  }

  // Fallback to DOM table scraping
  waitForStatsTable((rows) => {
    articles = [];
    rows.forEach(row => {
      try {
        articles.push(extractStatsFromRow(row));
      } catch (e) {
        console.error('[SuperStats] Error extracting row:', e, row);
      }
    });
    if (!articles.length) {
      console.warn('[SuperStats] No articles extracted. Medium may have changed their layout.');
    }
    callback(articles);
  });
}

// --- End Robust Extraction ---

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log('[SuperStats] Received message:', msg);
  if (msg && msg.type === 'SUPERSTATS_REQUEST_STATS') {
    robustExtractArticles((articles) => {
      // Try to extract follower count from the best div
      let followerCount = null;
      const divs = Array.from(document.querySelectorAll('div'));
      let bestDiv = null;
      let maxMatches = 0;
      for (const div of divs) {
        const txt = div.textContent;
        const matches = (txt.match(/Followers/g) || []).length;
        if (matches > maxMatches) {
          maxMatches = matches;
          bestDiv = div;
        }
      }
      if (bestDiv) {
        const match = bestDiv.textContent.match(/(\d+[,.]?\d*[Kk]?)\s*Followers/);
        if (match) {
          let v = match[1].replace(/,/g, '');
          if (v.endsWith('K')) v = parseFloat(v) * 1000;
          followerCount = parseInt(v, 10);
        }
      }
      sendResponse({ articles, followerCount });
    });
  }}); 
