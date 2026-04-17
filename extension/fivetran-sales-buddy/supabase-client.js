// supabase-client.js
// Loads connector data from the Fivetran Sales Buddy Supabase instance.
// Uses the REST API directly (no @supabase/supabase-js bundle needed).

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

// Per-connector display metadata (icon initial, color class, docs URL).
// Schema doesn't store these, so we map by connector id here.
// Unknown ids fall back to icon-default with the first letter of the name.
const connectorMeta = {
  hubspot:          { icon: 'H', iconClass: 'icon-hubspot',          docsUrl: 'https://fivetran.com/docs/connectors/applications/hubspot' },
  salesforce:       { icon: 'S', iconClass: 'icon-salesforce',       docsUrl: 'https://fivetran.com/docs/connectors/applications/salesforce' },
  stripe:           { icon: 'S', iconClass: 'icon-stripe',           docsUrl: 'https://fivetran.com/docs/connectors/applications/stripe' },
  shopify:          { icon: 'S', iconClass: 'icon-shopify',          docsUrl: 'https://fivetran.com/docs/connectors/applications/shopify' },
  google_sheets:    { icon: 'G', iconClass: 'icon-google',           docsUrl: 'https://fivetran.com/docs/connectors/files/google-sheets' },
  google_ads:       { icon: 'G', iconClass: 'icon-google',           docsUrl: 'https://fivetran.com/docs/connectors/applications/google-ads' },
  google_analytics: { icon: 'G', iconClass: 'icon-google',           docsUrl: 'https://fivetran.com/docs/connectors/applications/google-analytics-4' },
  facebook:         { icon: 'F', iconClass: 'icon-facebook',         docsUrl: 'https://fivetran.com/docs/connectors/applications/facebook-pages' },
  facebook_ads:     { icon: 'F', iconClass: 'icon-facebook',         docsUrl: 'https://fivetran.com/docs/connectors/applications/facebook-ads' },
  s3:               { icon: 'S', iconClass: 'icon-aws',              docsUrl: 'https://fivetran.com/docs/connectors/files/amazon-s3' },
  postgres_rds:     { icon: 'P', iconClass: 'icon-postgres',         docsUrl: 'https://fivetran.com/docs/connectors/databases/postgresql' },
  sql_server:       { icon: 'M', iconClass: 'icon-microsoft',        docsUrl: 'https://fivetran.com/docs/connectors/databases/sql-server' },
  mysql_rds:        { icon: 'M', iconClass: 'icon-mysql',            docsUrl: 'https://fivetran.com/docs/connectors/databases/mysql/rds-setup-guide' },
  mysql:            { icon: 'M', iconClass: 'icon-mysql',            docsUrl: 'https://fivetran.com/docs/connectors/databases/mysql' },
  oracle:           { icon: 'O', iconClass: 'icon-oracle',           docsUrl: 'https://fivetran.com/docs/connectors/databases/oracle' },
  mongo:            { icon: 'M', iconClass: 'icon-mongo',            docsUrl: 'https://fivetran.com/docs/connectors/databases/mongodb' },
  dynamodb:         { icon: 'D', iconClass: 'icon-aws',              docsUrl: 'https://fivetran.com/docs/connectors/databases/dynamodb' },
  azure_sql_db:     { icon: 'A', iconClass: 'icon-azure',            docsUrl: 'https://fivetran.com/docs/connectors/databases/sql-server/azure-setup-guide' },
  mariadb:          { icon: 'M', iconClass: 'icon-mysql',            docsUrl: 'https://fivetran.com/docs/connectors/databases/mariadb' },
  aurora:           { icon: 'A', iconClass: 'icon-aws',              docsUrl: 'https://fivetran.com/docs/connectors/databases/mysql/aurora-setup-guide' },
  aurora_postgres:  { icon: 'A', iconClass: 'icon-aws',              docsUrl: 'https://fivetran.com/docs/connectors/databases/postgresql/aurora-configuration' },
  heroku_postgres:  { icon: 'H', iconClass: 'icon-postgres',         docsUrl: 'https://fivetran.com/docs/connectors/databases/postgresql/heroku-setup-guide' },
  sftp:             { icon: 'S', iconClass: 'icon-default',           docsUrl: 'https://fivetran.com/docs/connectors/files/sftp' },
  fivetran_log:     { icon: 'F', iconClass: 'icon-default',           docsUrl: 'https://fivetran.com/docs/connectors/applications/fivetran-log' }
};

async function supabaseGet(table, params = 'select=*') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    }
  });
  if (!res.ok) throw new Error(`Supabase ${table} ${res.status}`);
  return res.json();
}

// Loads connectors + tables + known_issues, joins them, and shapes the result
// into the structure popup.js expects (connectorData[id] = { name, icon, ... }).
async function loadConnectorDataFromSupabase() {
  const [connectors, tables, issues] = await Promise.all([
    supabaseGet('connectors'),
    supabaseGet('connector_tables'),
    supabaseGet('connector_known_issues')
  ]);

  const data = {};
  for (const c of connectors) {
    const meta = connectorMeta[c.id] || {
      icon: (c.name || c.id).charAt(0).toUpperCase(),
      iconClass: 'icon-default',
      docsUrl: ''
    };

    data[c.id] = {
      name: c.name,
      icon: meta.icon,
      iconClass: meta.iconClass,
      description: c.description || '',
      whatItDoes: c.what_it_does || '',
      usefulFor: c.useful_for || '',
      docsUrl: meta.docsUrl,
      tables: tables
        .filter(t => t.connector_id === c.id)
        .map(t => ({
          name: t.table_name,
          whatContains: t.what_it_contains || '',
          whyMatters: t.why_it_matters || '',
          keyCallouts: t.key_callouts || ''
        })),
      knownIssues: issues
        .filter(i => i.connector_id === c.id)
        .map(i => ({
          // Schema doesn't have a category column yet — default to Data Integrity
          // so the existing UI grouping still renders.
          category: i.category || 'Data Integrity',
          title: i.issue_title,
          preview: i.issue_preview || '',
          rootCause: i.root_cause || '',
          impact: i.impact || '',
          resolution: i.resolution || ''
        }))
    };
  }

  return data;
}
