const request = require('supertest');
const app = require('./src/server');
const pool = require('./src/db/pool');

async function runTest() {
  console.log("🚀 Testing The Hunter (Auto-Lead Generation)...\n");
  try {
    console.log("1️⃣ Saving new ICP Profile (Cybersecurity in UK)...");
    const icpRes = await request(app).post('/api/icp').send({
      name: "Cybersec UK Hunt",
      target_industries: ["Cybersecurity"],
      employee_min: 50,
      employee_max: 500,
      revenue_min: 5000000,
      revenue_max: 100000000,
      countries: ["United Kingdom"],
      technologies: ["AWS"]
    });
    
    console.log("✅ API Response:", icpRes.body.message);
    console.log("⏳ Waiting 8 seconds for The Hunter to search DuckDuckGo and score leads...\n");
    
    // Give the background scraper time to fetch, parse, and insert
    await new Promise(r => setTimeout(r, 8000)); 
    
    console.log("3️⃣ Checking the Pipeline...");
    const leadsRes = await request(app).get('/api/leads?limit=10');
    const leads = leadsRes.body.data;
    
    const cyberLeads = leads.filter(l => l.industry === 'Cybersecurity');
    
    if (cyberLeads.length > 0) {
      console.log(`✅ SUCCESS! The Hunter found ${cyberLeads.length} new companies from the open web:`);
      cyberLeads.forEach(l => {
         console.log(`   🎯 ${l.company_name} (${l.domain}) -> Score: ${l.total_score}`);
      });
    } else {
      console.log("⚠️ No new leads found. The search engine might have blocked the request or found zero results.");
    }
    
  } catch (err) {
    console.error("❌ Test failed:", err);
  } finally {
    await pool.end();
  }
}
runTest();
