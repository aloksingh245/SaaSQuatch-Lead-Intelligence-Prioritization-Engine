const request = require('supertest');
const app = require('./src/server'); // We exported the Express app here!
const path = require('path');
const pool = require('./src/db/pool');

async function runTest() {
  console.log("🚀 Starting End-to-End API Test...\n");

  try {
    // 1. Get ICP (Simulates Settings Page Load)
    console.log("1️⃣ Fetching ICP Profile...");
    const icpRes = await request(app).get('/api/icp');
    if (icpRes.status !== 200) throw new Error("ICP not found. Did you run db:seed?");
    const icpId = icpRes.body.id;
    console.log(`✅ Loaded ICP: "${icpRes.body.name}" (ID: ${icpId})\n`);

    // 2. Upload CSV (Simulates Import Page)
    console.log("2️⃣ Uploading sample CSV...");
    const csvPath = path.join(__dirname, 'benchmark', 'sample_labeled.csv');
    const importRes = await request(app)
      .post('/api/leads/import')
      .field('icpId', icpId)
      .attach('file', csvPath);
    
    if (importRes.status !== 202) throw new Error("Import failed to start: " + importRes.text);
    const jobId = importRes.body.jobId;
    console.log(`✅ Job started. Job ID: ${jobId}\n`);

    // 3. Poll Job (Simulates Import Page Progress Bar)
    console.log("3️⃣ Polling job status...");
    let jobData;
    while (true) {
      const jobRes = await request(app).get(`/api/jobs/${jobId}`);
      jobData = jobRes.body;
      if (jobData.status === 'done' || jobData.status === 'error') break;
      await new Promise(r => setTimeout(r, 500)); // wait 0.5s
    }
    console.log(`✅ Job finished! Imported: ${jobData.imported}, Duplicates skipped: ${jobData.duplicates}\n`);

    // 4. Fetch Leads (Simulates Dashboard)
    console.log("4️⃣ Fetching Pipeline (Dashboard)...");
    const leadsRes = await request(app).get('/api/leads?limit=3');
    const leads = leadsRes.body.data;
    console.log(`✅ Fetched top leads. Total in DB: ${leadsRes.body.pagination.total}`);
    leads.forEach(l => console.log(`   - ${l.company_name} | Score: ${l.total_score} | Priority: ${l.priority}`));
    console.log("");

    // 5. Fetch Single Lead (Simulates X-Ray Modal)
    console.log("5️⃣ Fetching Lead X-Ray Details...");
    const firstLeadId = leads[0].id;
    const detailRes = await request(app).get(`/api/leads/${firstLeadId}`);
    const details = detailRes.body;
    console.log(`✅ X-Ray for ${details.company_name}:`);
    details.explanation.reasons.forEach(r => {
      console.log(`   [+${r.points}] ${r.factor}: ${r.reason}`);
    });
    console.log("\n🎉 ALL TESTS PASSED!");

  } catch (err) {
    console.error("❌ Test Failed:", err);
  } finally {
    await pool.end(); // Close DB connection so script can exit
  }
}

runTest();
