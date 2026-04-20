// seed-freshdesk.js
// Populates Supabase with Fivetran Freshdesk connector data.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CONNECTOR_ID = 'freshdesk';

const connector = {
  id: CONNECTOR_ID,
  name: 'Freshdesk',
  category: 'support',
  description: "Fivetran's Freshdesk connector syncs helpdesk and support data via the Freshdesk API. It provides ticket, contact, agent, and conversation data for support analytics and SLA tracking.",
  what_it_does: 'Syncs tickets, contacts, companies, agents, groups, conversations (ticket messages), satisfaction ratings, and time entries. Incremental sync using updated_at timestamps.',
  useful_for: 'Support team performance analytics, SLA compliance reporting, ticket volume and resolution trends, customer satisfaction tracking, and blending support data with CRM and product usage.'
};

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'TICKET',
    what_it_contains: 'Ticket records — subject, status, priority, type, agent, group, created_at, resolved_at, due_by, custom fields.',
    why_it_matters: 'Core support metrics table — volume, resolution time, SLA compliance.',
    key_callouts: 'status: 2=Open, 3=Pending, 4=Resolved, 5=Closed. due_by and fr_due_by for SLA tracking. Custom fields appear as separate columns.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CONVERSATION',
    what_it_contains: 'Ticket messages — body, incoming/outgoing, user_id, created_at.',
    why_it_matters: 'Message-level detail for first response time and conversation analysis.',
    key_callouts: 'incoming = true for customer messages, false for agent replies. First outgoing reply timestamp = first response time.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CONTACT',
    what_it_contains: 'Contact records — name, email, phone, company, active status.',
    why_it_matters: 'Customer dimension for support analytics.',
    key_callouts: 'Join to TICKET via requester_id. company_id links to COMPANY table.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'AGENT',
    what_it_contains: 'Agent records — name, email, group memberships, active status, ticket scope.',
    why_it_matters: 'Agent dimension for team performance reporting.',
    key_callouts: 'group_ids is an array — agent can belong to multiple groups.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'SATISFACTION_RATING',
    what_it_contains: 'CSAT survey responses — ticket, rating (happy/unhappy/neutral), feedback, created_at.',
    why_it_matters: 'Customer satisfaction scoring and trend analysis.',
    key_callouts: 'Only populated if CSAT surveys are enabled in Freshdesk. Response rate is typically low — sample size matters.'
  }
];

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Ticket Status Uses Numeric Codes',
    issue_preview: 'Status field contains numbers (2, 3, 4, 5) not labels',
    root_cause: 'Freshdesk API returns ticket status as integer codes rather than human-readable labels. Custom statuses have custom codes.',
    impact: 'Reports show meaningless numbers instead of "Open", "Pending", "Resolved", "Closed".',
    resolution: 'Build a status mapping table: 2=Open, 3=Pending, 4=Resolved, 5=Closed. For custom statuses, check Freshdesk Admin → Ticket Statuses for the code-to-label mapping.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Custom Fields Vary by Freshdesk Plan and Account',
    issue_preview: 'Custom ticket fields not present or differently named across accounts',
    root_cause: 'Freshdesk supports custom fields on tickets that are account-specific. Higher-tier plans allow more custom field types.',
    impact: 'dbt models with hardcoded custom field names break across accounts.',
    resolution: 'Document custom fields per account. Use dynamic column detection in dbt or build account-specific models for custom fields.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Conversation Body Contains HTML',
    issue_preview: 'Message text includes HTML tags making analysis difficult',
    root_cause: 'Freshdesk stores conversation bodies as HTML. Rich text formatting, images, and signatures are all embedded in the HTML.',
    impact: 'Text analysis, word counts, or search on conversation body requires HTML stripping first.',
    resolution: 'Build a UDF or dbt macro to strip HTML tags from conversation bodies. Most warehouses support REGEXP_REPLACE for basic HTML stripping.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Deleted Tickets Not Captured After Purge',
    issue_preview: 'Tickets deleted from Freshdesk trash may persist in warehouse',
    root_cause: 'Freshdesk soft-deletes tickets to trash (recoverable for 30 days), then permanently purges them. Fivetran may not capture the permanent purge event.',
    impact: 'Permanently deleted tickets remain in warehouse. Ticket counts may be slightly inflated.',
    resolution: 'Filter on _fivetran_deleted = FALSE for active tickets. For strict accuracy, periodically reconcile warehouse counts with Freshdesk dashboard totals.'
  }
];

async function main() {
  console.log('Seeding Freshdesk connector data...\n');

  const { error: ce } = await supabase.from('connectors').upsert({ ...connector, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (ce) { console.error('Error:', ce); process.exit(1); }
  console.log('Upserted connector: Freshdesk');

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

  console.log('\nDone — Freshdesk: 5 tables, 4 issues');
}

main().catch(e => { console.error(e); process.exit(1); });
