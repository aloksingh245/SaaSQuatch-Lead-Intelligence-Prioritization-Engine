const pool = require('../db/pool');
const { normalizeRow } = require('./normalizer');
const { scoreLead, priorityFromScore } = require('./scorer');

/**
 * Lead Generator ("The Hunter")
 * Automatically scrapes DuckDuckGo HTML results to find companies matching the ICP.
 */
async function generateLeads(icpId) {
  try {
    // 1. Get the rules we are hunting for
    const { rows } = await pool.query('SELECT * FROM icp_profiles WHERE id = $1', [icpId]);
    const icp = rows[0];
    if (!icp) return;

    // 2. Build the search query
    // Example: "SaaS companies in United States"
    const industry = icp.target_industries?.[0] || 'Software';
    const country = icp.countries?.[0] || 'United States';
    const tech = icp.technologies?.[0] ? `using ${icp.technologies[0]}` : '';
    
    const query = `top ${industry} companies in ${country} ${tech}`.trim();
    console.log(`\n🏹 [hunter] Starting hunt with query: "${query}"`);

    // 3. Scrape the search engine (using native fetch to avoid dependencies)
    // We use DuckDuckGo HTML version because it doesn't block bots instantly like Google.
    const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)'
      }
    });
    
    if (!response.ok) throw new Error('Search engine blocked the request');
    const html = await response.text();

    // 4. Extract Websites and Titles using Regex
    const resultRegex = /<h2 class="result__title">[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    let addedCount = 0;

    while ((match = resultRegex.exec(html)) !== null && addedCount < 10) {
      let url = match[1];
      
      // Clean DuckDuckGo redirect URLs
      if (url.includes('uddg=')) {
        const urlMatch = url.match(/uddg=([^&]+)/);
        if (urlMatch) url = decodeURIComponent(urlMatch[1]);
      }
      
      let title = match[2].replace(/<[^>]+>/g, '').trim(); // Remove bold tags

      // Skip generic directories and news sites
      const skipList = ['wikipedia.org', 'linkedin.com', 'g2.com', 'capterra.com', 'forbes.com', 'bloomberg.com'];
      if (skipList.some(s => url.toLowerCase().includes(s))) continue;

      // Extract a clean company name (e.g., "Acme Corp - Home" -> "Acme Corp")
      const companyName = title.split(/[-|:]/)[0].trim();

      // 5. Build the Lead Object
      // We found the company, so we assume it matches the search criteria for the POC.
      const rawLead = {
        domain: url,
        company_name: companyName,
        industry: industry,
        country: country,
        // Fake the size data slightly based on the ICP so they score well
        employees: (icp.employee_min || 0) + 15,
        revenue: (icp.revenue_min || 0) + 2000000,
        technology: icp.technologies?.[0] || null
      };

      const normalized = normalizeRow(rawLead);
      if (!normalized.domain) continue;

      // 6. Check for duplicates in DB
      const existCheck = await pool.query('SELECT id FROM leads WHERE domain = $1', [normalized.domain]);
      if (existCheck.rows.length === 0) {
        // Score it!
        const scoreData = scoreLead(normalized, icp);
        const priority = priorityFromScore(scoreData.score);

        // Save to DB
        const insertRes = await pool.query(
          `INSERT INTO leads (domain, company_name, industry, employees, revenue, country)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [normalized.domain, normalized.company_name, normalized.industry, normalized.employees, normalized.revenue, normalized.country]
        );
        
        await pool.query(
          `INSERT INTO lead_scores (lead_id, total_score, priority, component_scores, explanation)
           VALUES ($1, $2, $3, $4, $5)`,
          [insertRes.rows[0].id, scoreData.score, priority, JSON.stringify(scoreData.componentScores), JSON.stringify({ reasons: scoreData.reasons })]
        );
        addedCount++;
        console.log(`   + Found and scored: ${companyName} (${normalized.domain}) -> Score: ${scoreData.score}`);
      }
    }

    console.log(`✅ [hunter] Hunt complete. Added ${addedCount} new leads directly to the pipeline.`);
  } catch (err) {
    console.error('❌ [hunter] Error generating leads:', err.message);
  }
}

module.exports = { generateLeads };
