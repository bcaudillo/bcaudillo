// seed-intercom.js
// Populates Supabase with Fivetran Intercom connector data.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CONNECTOR_ID = 'intercom';

const connector = {
  id: CONNECTOR_ID,
  name: 'Intercom',
  category: 'support',
  description: "Fivetran's Intercom connector syncs customer messaging and support data via the Intercom API. It provides contact, conversation, and event data for support analytics, product engagement, and customer success reporting.",
  what_it_does: 'Syncs contacts (users and leads), companies, conversations, conversation parts (messages), tags, segments, and custom events. Incremental sync using Intercom\'s updated_at timestamps.',
  useful_for: 'Support team analytics, conversation volume reporting, first response time tracking, customer health scoring, NPS analysis, and combining support data with product usage and revenue.'
};

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CONVERSATION',
    what_it_contains: 'All conversations — created_at, updated_at, state (open/closed/snoozed), assignee, tags, first response time, time to close.',
    why_it_matters: 'Core support metrics table — SLA tracking, volume trends, and team performance.',
    key_callouts: 'state field: open, closed, snoozed. first_contact_reply_at and first_admin_reply_at drive response time metrics.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CONVERSATION_PART',
    what_it_contains: 'Individual messages within conversations — author type (user/admin/bot), body, created_at.',
    why_it_matters: 'Message-level detail for conversation analysis and quality review.',
    key_callouts: 'author_type distinguishes customer messages from agent/bot responses. body may contain HTML.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CONTACT',
    what_it_contains: 'User and lead profiles — email, name, custom attributes, last seen, signed up date, location.',
    why_it_matters: 'Customer dimension for segmentation and lifecycle analysis.',
    key_callouts: 'custom_attributes is JSON — parse for account-specific data. role field: user vs lead.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'COMPANY',
    what_it_contains: 'Company records — name, industry, size, custom attributes, monthly spend, plan.',
    why_it_matters: 'Account-level view for B2B support analytics and health scoring.',
    key_callouts: 'monthly_spend and plan come from what\'s passed via the Intercom API — accuracy depends on customer\'s implementation.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CONTACT_TAG',
    what_it_contains: 'Tag associations for contacts — tag_id, contact_id.',
    why_it_matters: 'Enables segment-based filtering (e.g., "enterprise" or "churned" tagged contacts).',
    key_callouts: 'Join to TAG table for tag names.'
  }
];

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'API Rate Limits Cause Slow Syncs for Large Workspaces',
    issue_preview: 'High conversation volume leads to throttled syncs',
    root_cause: 'Intercom enforces API rate limits (typically 1,000 requests per minute). Workspaces with large conversation history require many paginated API calls, all subject to throttling.',
    impact: 'Initial historical sync can take days for high-volume support teams. Ongoing syncs also slow during high-traffic periods.',
    resolution: 'Set expectations for long initial syncs with large workspaces. Schedule initial sync during off-peak hours. Once caught up, incremental syncs are much faster.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Conversation Parts Not Included in Initial Sync',
    issue_preview: 'CONVERSATION_PART table empty after setup',
    root_cause: 'Intercom\'s API does not support bulk export of conversation parts. Fivetran syncs parts incrementally as conversations are updated — parts from historical conversations may not be captured on initial load.',
    impact: 'Historical message content unavailable. Only new conversation parts are captured going forward.',
    resolution: 'This is a known API limitation. Historical parts are not backfillable. Plan analytics around conversations (not parts) for historical reporting. Parts will accumulate as conversations are updated.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Custom Attributes Vary by Workspace',
    issue_preview: 'CONTACT and COMPANY schemas differ between accounts',
    root_cause: 'Intercom allows arbitrary custom attributes on contacts and companies. The schema reflects whatever custom attributes exist in the specific workspace.',
    impact: 'dbt models built for one workspace may not apply to another. Custom attributes stored as separate columns or JSON depending on data type.',
    resolution: 'Document key custom attributes per workspace. Build workspace-specific transformation models. Use the custom_attributes JSON column for more portable queries across workspaces.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Deleted Contacts Not Captured',
    issue_preview: 'Contacts deleted in Intercom stay in warehouse',
    root_cause: 'Intercom\'s API does not provide a reliable way to enumerate deleted contacts. Fivetran cannot detect deletions that occurred before the connector was set up.',
    impact: 'Deleted/merged contacts remain in warehouse with stale data. Contact counts may be inflated.',
    resolution: 'Filter on updated_at recency for active contact analysis. Use Intercom\'s merge event data if available. Periodic re-syncs can help but won\'t capture hard deletes.'
  }
];

async function main() {
  console.log('Seeding Intercom connector data...\n');

  const { error: ce } = await supabase.from('connectors').upsert({ ...connector, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (ce) { console.error('Error:', ce); process.exit(1); }
  console.log('Upserted connector: Intercom');

  await supabase.from('connector_tables').delete().eq('connector_id', CONNECTOR_ID);
  await supabase.from('connector_known_issues').delete().eq('connector_id', CONNECTOR_ID);

  for (const t of connectorTables) {
    const { error } = await supabase.from('connector_tables').insert({ ...t, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    if (error) console.error(`Error: ${t.table_name}`, error);
    else console.log(`  Table: ${t.table_name}`);
  }

  for (const i of knownIssues) {
    const { error } = await supabase.from('connector_known_issues').insert({ ...i, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    if (error) console.error(`Error: ${i.issue_title}`, error);
    else console.log(`  Issue: ${i.issue_title}`);
  }

  console.log('\nDone — Intercom: 5 tables, 4 issues');
}

main().catch(e => { console.error(e); process.exit(1); });
