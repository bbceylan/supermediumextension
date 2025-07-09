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

function extractArticlesFromDiv() {
  // Find the div with the most 'View story' or 'Reads'/'Views' occurrences
  const divs = Array.from(document.querySelectorAll('div'));
  let bestDiv = null;
  let maxMatches = 0;
  for (const div of divs) {
    const txt = div.textContent;
    const matches = (txt.match(/View story|Reads|Views/g) || []).length;
    if (matches > maxMatches) {
      maxMatches = matches;
      bestDiv = div;
    }
  }
  if (!bestDiv) return [];
  const text = bestDiv.textContent;
  console.log('[SuperStats] Using div for extraction:', text.slice(0, 1000));
  // Split by 'Earnings' (each article ends with 'Earnings')
  const articleBlocks = text.split('Earnings').filter(block => block.includes('View story'));
  const articles = articleBlocks.map((block, idx) => {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    let viewStoryIdx = lines.findIndex(l => l.includes('View story'));
    let title = '--';
    if (viewStoryIdx > 0) {
      for (let i = viewStoryIdx - 1; i >= 0; i--) {
        if (lines[i] && !/^\d+[.,]?\d*[Kk]?$/.test(lines[i]) && !lines[i].match(/Views|Reads|Earnings|\$/i)) {
          title = lines[i];
          break;
        }
      }
    }
    if (title === '--') {
      title = lines.reduce((a, b) => {
        if (b.length > a.length && !/^\d+[.,]?\d*[Kk]?$/.test(b) && !b.match(/Views|Reads|Earnings|\$/i)) return b; else return a;
      }, '--');
    }
    let views = 0;
    const viewsMatch = block.match(/(\d+[.,]?\d*[Kk]?)\s*Views/);
    if (viewsMatch) {
      let v = viewsMatch[1].replace(/,/g, '');
      if (v.endsWith('K')) v = parseFloat(v) * 1000;
      views = parseInt(v, 10);
    }
    let reads = 0;
    const readsMatch = block.match(/(\d+[.,]?\d*[Kk]?)\s*Reads/);
    if (readsMatch) {
      let r = readsMatch[1].replace(/,/g, '');
      if (r.endsWith('K')) r = parseFloat(r) * 1000;
      reads = parseInt(r, 10);
    }
    let earnings = '--';
    const earningsMatch = block.match(/\$([\d,.]+)/);
    if (earningsMatch) earnings = `$${earningsMatch[1]}`;
    console.log(`[SuperStats] Block #${idx}: title='${title}', views=${views}, reads=${reads}, earnings=${earnings}`);
    if (title !== '--' && (views > 0 || reads > 0 || earnings !== '--')) {
      return { title, views, reads, earnings };
    }
    return null;
  }).filter(Boolean);
  if (articles.length === 0) {
    console.warn('[SuperStats] No articles found. Raw blocks:', articleBlocks);
  }
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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log('[SuperStats] Received message:', msg);
  // No extraction, just logging for now
  sendResponse({ articles: [] });
}); 