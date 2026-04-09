// seed-database.js
// This script populates Supabase with Fivetran connector data

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── PHASE 1: HARDCODED CONNECTOR DATA ──────────────────────────────────────

const hardcodedConnectors = {
  'hubspot': {
    name: 'HubSpot',
    description: 'CRM platform for managing sales, marketing, and customer service',
    what_it_does: 'HubSpot is a cloud-based CRM that centralizes customer relationships, sales pipelines, and marketing campaigns. Fivetran syncs contacts, companies, deals, tickets, and engagement data.',
    useful_for: 'Sales teams managing deals, marketing teams running campaigns, customer success tracking, revenue operations'
  },
  'salesforce': {
    name: 'Salesforce',
    description: 'Leading CRM platform with extensive customization options',
    what_it_does: 'Salesforce is an enterprise CRM for managing sales, service, and customer relationships at scale.',
    useful_for: 'Large enterprises, complex sales processes, custom workflows'
  },
  'stripe': {
    name: 'Stripe',
    description: 'Payment processing platform',
    what_it_does: 'Stripe handles payment processing, subscriptions, and billing.',
    useful_for: 'SaaS billing, subscription management, payment analytics'
  }
};

// ─── PHASE 2: POPULATE CONNECTORS TABLE ──────────────────────────────────────

async function populateConnectors() {
  console.log('Populating connectors table...');

  for (const [id, data] of Object.entries(hardcodedConnectors)) {
    const { error } = await supabase
      .from('connectors')
      .upsert({
        id,
        name: data.name,
        description: data.description,
        category: 'crm',
        what_it_does: data.what_it_does,
        useful_for: data.useful_for,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });

    if (error) {
      console.error(`Error inserting ${id}:`, error);
    } else {
      console.log(`Inserted connector: ${data.name}`);
    }
  }
}

// ─── PHASE 3: KNOWN ISSUES ──────────────────────────────────────

const hubspotIssues = [
  {
    connector_id: 'hubspot',
    issue_title: 'Cannot Select – Not Available in Your HubSpot Subscription',
    issue_preview: 'User lacks Super Admin access required by Fivetran',
    root_cause: "Authenticating user doesn't have Super Admin permissions",
    impact: 'Connector cannot sync Deal table or other restricted tables',
    resolution: 'Ensure the Fivetran authenticating user has Super Admin access to HubSpot account'
  },
  {
    connector_id: 'hubspot',
    issue_title: 'Hub Is Unknown – EU Data Center Migration',
    issue_preview: 'Authorization fails after migrating HubSpot to EU data center',
    root_cause: 'Authorization URL changes when migrating between data centers (US → EU)',
    impact: 'Sync fails with "Hub is unknown to this Hublet" error',
    resolution: 'Re-create OAuth app and re-authenticate the connection after migration completes'
  },
  {
    connector_id: 'hubspot',
    issue_title: 'Missing Columns, Tables, or Values',
    issue_preview: 'Columns, tables, or values are missing in the destination',
    root_cause: "HubSpot connector doesn't create empty tables/columns without applicable data",
    impact: 'Data gaps when no values exist in source system',
    resolution: 'Review schema tab, verify HubSpot subscription level includes the table, check if data exists in source'
  }
];

async function populateKnownIssues() {
  console.log('Populating known issues table...');

  for (const issue of hubspotIssues) {
    const { error } = await supabase
      .from('connector_known_issues')
      .insert({
        ...issue,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (error) {
      console.error('Error inserting issue:', error);
    } else {
      console.log(`Inserted issue: ${issue.issue_title}`);
    }
  }
}

// ─── PHASE 4: CONNECTOR TABLES ──────────────────────────────────────

const connectorTables = [
  {
    connector_id: 'hubspot',
    table_name: 'CONTACT',
    what_it_contains: 'All contacts/leads — email, name, lifecycle stage, custom properties',
    why_it_matters: 'Core table for customer base and lead pipeline',
    key_callouts: 'CONTACT_PROPERTY_HISTORY tracks every field change — #1 MAR driver'
  },
  {
    connector_id: 'hubspot',
    table_name: 'COMPANY',
    what_it_contains: 'Company/account records — industry, size, revenue, owner',
    why_it_matters: 'Account-level analytics and org mapping',
    key_callouts: 'Linked to contacts via COMPANY_CONTACT association table'
  },
  {
    connector_id: 'hubspot',
    table_name: 'DEAL',
    what_it_contains: 'Sales opportunities — stage, amount, close date, pipeline',
    why_it_matters: 'Pipeline reporting and revenue forecasting',
    key_callouts: 'Stage history in DEAL_STAGE table. Merged deals tracked in MERGED_DEAL.'
  },
  {
    connector_id: 'salesforce',
    table_name: 'Account',
    what_it_contains: 'Account/company records with industry, size, revenue',
    why_it_matters: 'Core account data for B2B analytics',
    key_callouts: 'Custom fields available depending on org configuration'
  },
  {
    connector_id: 'salesforce',
    table_name: 'Opportunity',
    what_it_contains: 'Sales opportunities with stage, amount, close date',
    why_it_matters: 'Revenue pipeline tracking',
    key_callouts: 'Stage history in OpportunityHistory table'
  }
];

async function populateConnectorTables() {
  console.log('Populating connector tables...');

  for (const table of connectorTables) {
    const { error } = await supabase
      .from('connector_tables')
      .insert({
        ...table,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (error) {
      console.error('Error inserting table:', error);
    } else {
      console.log(`Inserted table: ${table.connector_id}.${table.table_name}`);
    }
  }
}

// ─── PHASE 5: GLOSSARY ──────────────────────────────────────

const glossaryTerms = [
  {
    term: 'MAR',
    simple_definition: 'Monthly Active Rows - how Fivetran charges for usage',
    detailed_explanation: "Monthly Active Rows (MAR) is any row that Fivetran touches during a sync in a calendar month. This includes rows that are created, updated, or deleted. Fivetran's pricing is based on total MAR across all your connectors.",
    why_it_matters: 'Understanding MAR helps you predict costs and identify which connectors are driving the most usage.',
    example: "A customer syncs 500k HubSpot contacts in January. That's 500k MAR.",
    category: 'Pricing'
  },
  {
    term: 'Schema Drift',
    simple_definition: 'When the structure of your data changes unexpectedly',
    detailed_explanation: 'Schema drift occurs when new columns are added, columns are removed, or data types change in your source system.',
    why_it_matters: 'Schema drift can cause sync failures, unexpected new tables, or data quality issues.',
    example: 'Your customer adds a new custom field "Account_Tier" to their HubSpot Contacts table. Fivetran detects this and automatically creates a new column.',
    category: 'Technical'
  },
  {
    term: 'CDC',
    simple_definition: 'Change Data Capture - syncs only what changed, not everything',
    detailed_explanation: 'CDC identifies what changed and syncs only those changes. Instead of re-syncing entire tables, only modified rows are synced.',
    why_it_matters: 'CDC dramatically reduces MAR usage (by 10-100x in many cases) and makes syncs faster.',
    example: 'Instead of syncing 10M rows every day, only the 50k that changed are synced.',
    category: 'Technical'
  },
  {
    term: 'Incremental Sync',
    simple_definition: 'Syncing only new or changed data, not the entire dataset',
    detailed_explanation: 'Incremental sync means Fivetran only pulls data that has been added or modified since the last sync.',
    why_it_matters: 'Incremental syncs are faster, cheaper (lower MAR), and put less strain on source systems.',
    example: 'Salesforce Opportunities table synced incrementally: only new/updated deals are pulled daily.',
    category: 'Technical'
  }
];

async function populateGlossary() {
  console.log('Populating glossary table...');

  for (const term of glossaryTerms) {
    const { error } = await supabase
      .from('glossary')
      .insert({
        ...term,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (error) {
      console.error('Error inserting term:', error);
    } else {
      console.log(`Inserted term: ${term.term}`);
    }
  }
}

// ─── PHASE 6: TROUBLESHOOTING ──────────────────────────────────────

const troubleshootingIssues = [
  {
    error_code: '400',
    title: 'Bad Request - Invalid Input',
    preview: 'Request has invalid parameters or syntax',
    diagnosis: 'Usually a typo in API call or malformed data',
    steps: [
      { title: 'Step 1: Check request syntax', text: 'Verify API call parameters match documentation' },
      { title: 'Step 2: Validate input data', text: 'Ensure all required fields are present and valid' },
      { title: 'Step 3: Check data types', text: 'Verify data types match what API expects' }
    ],
    escalate: false
  },
  {
    error_code: '401',
    title: 'Unauthorized - Invalid Credentials',
    preview: 'Authentication failed or credentials are invalid',
    diagnosis: 'API key, token, or credentials are wrong or expired',
    steps: [
      { title: 'Step 1: Verify API key', text: "Check that API key is correct and hasn't been rotated" },
      { title: 'Step 2: Check token expiration', text: "Verify authentication token hasn't expired" },
      { title: 'Step 3: Re-authenticate', text: 'Generate new credentials and update in Fivetran' }
    ],
    escalate: false
  },
  {
    error_code: '403',
    title: 'Forbidden - Permission Denied',
    preview: 'User lacks required permissions to access data',
    diagnosis: 'Not a login issue. User exists but lacks read access to specific data/tables.',
    steps: [
      { title: 'Step 1: Verify account permissions', text: 'Check if Fivetran user has read access to all needed tables' },
      { title: 'Step 2: Grant table-level access', text: 'Some systems require per-table permissions. Admin needs to grant access.' },
      { title: 'Step 3: Test with different role', text: 'Try testing with a user account that has higher permissions.' }
    ],
    escalate: false
  },
  {
    error_code: '429',
    title: 'Rate Limited - Too Many Requests',
    preview: 'API rate limit exceeded',
    diagnosis: 'Too many requests hitting the API within time window',
    steps: [
      { title: 'Step 1: Wait and retry', text: 'Rate limits typically reset within minutes. Wait and try again.' },
      { title: 'Step 2: Reduce sync frequency', text: 'Decrease how often Fivetran syncs from this source' },
      { title: 'Step 3: Contact source vendor', text: 'Ask for rate limit increase or dedicated API quota' }
    ],
    escalate: true
  }
];

async function populateTroubleshooting() {
  console.log('Populating troubleshooting table...');

  for (const issue of troubleshootingIssues) {
    const { error } = await supabase
      .from('troubleshooting')
      .insert({
        ...issue,
        steps: issue.steps,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (error) {
      console.error('Error inserting troubleshooting issue:', error);
    } else {
      console.log(`Inserted error code: ${issue.error_code}`);
    }
  }
}

// ─── MAIN ──────────────────────────────────────────────────────────

async function main() {
  console.log('Starting Supabase population...\n');

  try {
    await populateConnectors();
    console.log('');

    await populateKnownIssues();
    console.log('');

    await populateConnectorTables();
    console.log('');

    await populateGlossary();
    console.log('');

    await populateTroubleshooting();
    console.log('');

    console.log('Database population complete!');
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main();
