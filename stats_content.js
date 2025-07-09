console.log('[SuperStats] Content script loaded');

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

function detectColumns(table) {
  const headers = Array.from(table.querySelectorAll('thead th,[role="columnheader"]'));
  const map = {};
  headers.forEach((th, i) => {
    const txt = th.textContent.trim().toLowerCase();
    if (txt.includes('date') || txt.includes('published')) map.date = i;
    if (txt.includes('title')) map.title = i;
    if (txt.includes('view')) map.views = i;
    if (txt.includes('read') && !map.reads) map.reads = i;
    if (txt.includes('earning')) map.earnings = i;
  });
  return map;
}

function getArticleRows() {
  // Try known class first
  let table = document.querySelector('table.ji');
  if (table) {
    const rows = table.querySelectorAll('tbody tr');
    if (rows.length) return { rows, map: detectColumns(table) };
  }

  // Any visible table containing stats keywords
  const tables = Array.from(document.querySelectorAll('table')).filter(t =>
    /views?/i.test(t.textContent) && /reads?/i.test(t.textContent)
  );
  for (const tbl of tables) {
    const rows = tbl.querySelectorAll('tbody tr');
    if (rows.length) return { rows, map: detectColumns(tbl) };
  }

  // ARIA tables
  const roleTables = Array.from(document.querySelectorAll('[role="table"]')).filter(t =>
    /views?/i.test(t.textContent) && /reads?/i.test(t.textContent)
  );
  for (const tbl of roleTables) {
    const rows = tbl.querySelectorAll('[role="row"]');
    if (rows.length) return { rows, map: detectColumns(tbl) };
  }

  return { rows: [], map: {} };
}

function waitForStatsTable(callback, timeout = 10000) {
  let found = false;
  const check = () => {
    const result = getArticleRows();
    if (result.rows.length) {
      found = true;
      callback(result.rows, result.map);
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

function extractStatsFromRow(row, map) {
  const cells = row.querySelectorAll('td,[role="cell"]');
  const getText = idx => (typeof idx === 'number' && cells[idx]) ? cells[idx].textContent.trim() : '';
  const date = getText(map.date);
  const titleCell = cells[map.title];
  let title = getText(map.title);
  const h2 = titleCell ? titleCell.querySelector('h2') : null;
  if (h2) title = h2.textContent.trim();
  return {
    date,
    title,
    views: getText(map.views),
    reads: getText(map.reads),
    earnings: getText(map.earnings)
  };
}

function robustExtractArticles(callback) {
  waitForStatsTable((rows, map) => {
    const articles = [];
    rows.forEach(row => {
      try {
        articles.push(extractStatsFromRow(row, map));
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
  }
}); 