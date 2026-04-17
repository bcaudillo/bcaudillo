// verify-connectors.js
// One-off audit: for every connector in Supabase, report:
//   - description length
//   - what_it_does length
//   - useful_for length
//   - # of connector_tables rows
//   - # of connector_known_issues rows
//   - avg length of known-issue fields (root_cause, impact, resolution)
// Then flag "thin" vs "rich" connectors so we know where to invest curation.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function avg(arr) {
  if (arr.length === 0) return 0;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

async function main() {
  const { data: connectors, error: cErr } = await supabase.from('connectors').select('*').order('id');
  if (cErr) { console.error('connectors err:', cErr); process.exit(1); }

  const { data: tables,  error: tErr } = await supabase.from('connector_tables').select('*');
  if (tErr) { console.error('tables err:', tErr); process.exit(1); }

  const { data: issues,  error: iErr } = await supabase.from('connector_known_issues').select('*');
  if (iErr) { console.error('issues err:', iErr); process.exit(1); }

  console.log(`\nFound ${connectors.length} connectors, ${tables.length} tables, ${issues.length} known_issues in Supabase.\n`);

  const headers = [
    pad('id', 22),
    pad('name', 22),
    pad('desc', 6),
    pad('what', 6),
    pad('use', 6),
    pad('tbls', 5),
    pad('iss', 4),
    pad('avgRoot', 8),
    pad('avgImp', 7),
    pad('avgRes', 7),
    'grade'
  ].join(' ');
  console.log(headers);
  console.log('-'.repeat(headers.length));

  const rows = [];

  for (const c of connectors) {
    const cTables = tables.filter(t => t.connector_id === c.id);
    const cIssues = issues.filter(i => i.connector_id === c.id);

    const descLen = (c.description || '').length;
    const whatLen = (c.what_it_does || '').length;
    const useLen  = (c.useful_for || '').length;

    const rootAvg = avg(cIssues.map(i => (i.root_cause || '').length));
    const impAvg  = avg(cIssues.map(i => (i.impact || '').length));
    const resAvg  = avg(cIssues.map(i => (i.resolution || '').length));

    // Grading heuristic — matches HubSpot-tier quality roughly:
    //   RICH  = 3+ issues, each with root_cause + impact + resolution averaging >=150 chars,
    //           plus descriptions >=100 chars and at least 1 table
    //   MED   = 2+ issues with non-trivial bodies (>=80 chars avg), OR thin issues but rich connector copy
    //   THIN  = <2 issues OR any issue field avg <50 chars OR missing description
    let grade;
    const hasDesc = descLen >= 100 && whatLen >= 80;
    const issueBodyRich = rootAvg >= 150 && impAvg >= 100 && resAvg >= 150;
    const issueBodyMed  = rootAvg >= 80  && impAvg >= 60  && resAvg >= 80;

    if (cIssues.length >= 3 && issueBodyRich && hasDesc && cTables.length >= 1) {
      grade = 'RICH';
    } else if (cIssues.length >= 2 && issueBodyMed && hasDesc) {
      grade = 'MED ';
    } else {
      grade = 'THIN';
    }

    rows.push({ c, cTables, cIssues, descLen, whatLen, useLen, rootAvg, impAvg, resAvg, grade });

    console.log([
      pad(c.id, 22),
      pad(c.name, 22),
      pad(descLen, 6),
      pad(whatLen, 6),
      pad(useLen, 6),
      pad(cTables.length, 5),
      pad(cIssues.length, 4),
      pad(rootAvg, 8),
      pad(impAvg, 7),
      pad(resAvg, 7),
      grade
    ].join(' '));
  }

  // Summary
  const rich = rows.filter(r => r.grade === 'RICH');
  const med  = rows.filter(r => r.grade === 'MED ');
  const thin = rows.filter(r => r.grade === 'THIN');

  console.log('');
  console.log(`RICH (HubSpot-tier): ${rich.length}`);
  console.log(`MED  (needs polish): ${med.length}`);
  console.log(`THIN (needs work):   ${thin.length}`);

  if (thin.length) {
    console.log('\nTHIN connectors (need curation):');
    for (const r of thin) {
      const reasons = [];
      if (r.cIssues.length < 2) reasons.push(`only ${r.cIssues.length} issue(s)`);
      if (r.descLen < 100) reasons.push(`desc=${r.descLen}`);
      if (r.whatLen < 80) reasons.push(`what=${r.whatLen}`);
      if (r.rootAvg < 80) reasons.push(`rootCause~${r.rootAvg}`);
      if (r.cTables.length === 0) reasons.push('no tables');
      console.log(`  - ${r.c.id} (${r.c.name}): ${reasons.join(', ') || 'low issue-body quality'}`);
    }
  }
}

main().catch(err => { console.error('fatal:', err); process.exit(1); });
