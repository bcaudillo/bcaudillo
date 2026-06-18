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
  google_analytics_4: { icon: 'G', iconClass: 'icon-google',        docsUrl: 'https://fivetran.com/docs/connectors/applications/google-analytics-4' },
  facebook:         { icon: 'F', iconClass: 'icon-facebook',         docsUrl: 'https://fivetran.com/docs/connectors/applications/facebook-pages' },
  facebook_ads:     { icon: 'F', iconClass: 'icon-facebook',         docsUrl: 'https://fivetran.com/docs/connectors/applications/facebook-ads' },
  s3:               { icon: 'S', iconClass: 'icon-aws',              docsUrl: 'https://fivetran.com/docs/connectors/files/amazon-s3' },
  postgres:         { icon: 'P', iconClass: 'icon-postgres',         docsUrl: 'https://fivetran.com/docs/connectors/databases/postgresql' },
  postgres_rds:     { icon: 'P', iconClass: 'icon-postgres',         docsUrl: 'https://fivetran.com/docs/connectors/databases/postgresql' },
  sql_server:       { icon: 'M', iconClass: 'icon-microsoft',        docsUrl: 'https://fivetran.com/docs/connectors/databases/sql-server' },
  mysql_rds:        { icon: 'M', iconClass: 'icon-mysql',            docsUrl: 'https://fivetran.com/docs/connectors/databases/mysql/rds-setup-guide' },
  mysql:            { icon: 'M', iconClass: 'icon-mysql',            docsUrl: 'https://fivetran.com/docs/connectors/databases/mysql' },
  oracle:           { icon: 'O', iconClass: 'icon-oracle',           docsUrl: 'https://fivetran.com/docs/connectors/databases/oracle' },
  mongo:            { icon: 'M', iconClass: 'icon-mongo',            docsUrl: 'https://fivetran.com/docs/connectors/databases/mongodb' },
  mongodb:          { icon: 'M', iconClass: 'icon-mongo',            docsUrl: 'https://fivetran.com/docs/connectors/databases/mongodb' },
  dynamodb:         { icon: 'D', iconClass: 'icon-aws',              docsUrl: 'https://fivetran.com/docs/connectors/databases/dynamodb' },
  azure_sql_db:     { icon: 'A', iconClass: 'icon-azure',            docsUrl: 'https://fivetran.com/docs/connectors/databases/sql-server/azure-setup-guide' },
  mariadb:          { icon: 'M', iconClass: 'icon-mysql',            docsUrl: 'https://fivetran.com/docs/connectors/databases/mariadb' },
  aurora:           { icon: 'A', iconClass: 'icon-aws',              docsUrl: 'https://fivetran.com/docs/connectors/databases/mysql/aurora-setup-guide' },
  aurora_postgres:  { icon: 'A', iconClass: 'icon-aws',              docsUrl: 'https://fivetran.com/docs/connectors/databases/postgresql/aurora-configuration' },
  heroku_postgres:  { icon: 'H', iconClass: 'icon-postgres',         docsUrl: 'https://fivetran.com/docs/connectors/databases/postgresql/heroku-setup-guide' },
  sftp:             { icon: 'S', iconClass: 'icon-default',           docsUrl: 'https://fivetran.com/docs/connectors/files/sftp' },
  fivetran_log:     { icon: 'F', iconClass: 'icon-default',           docsUrl: 'https://fivetran.com/docs/connectors/applications/fivetran-log' },
  email:            { icon: 'E', iconClass: 'icon-default',           docsUrl: 'https://fivetran.com/docs/connectors/applications/email' },
  webhooks:         { icon: 'W', iconClass: 'icon-default',           docsUrl: 'https://fivetran.com/docs/connectors/applications/webhooks' },
  google_cloud_storage: { icon: 'G', iconClass: 'icon-google',       docsUrl: 'https://fivetran.com/docs/connectors/files/google-cloud-storage' },
  aws_lambda:       { icon: 'L', iconClass: 'icon-aws',              docsUrl: 'https://fivetran.com/docs/connectors/applications/aws-lambda' },
  azure_blob_storage: { icon: 'A', iconClass: 'icon-azure',          docsUrl: 'https://fivetran.com/docs/connectors/files/azure-blob-storage' },
  mailchimp:        { icon: 'M', iconClass: 'icon-default',           docsUrl: 'https://fivetran.com/docs/connectors/applications/mailchimp' },
  slack:            { icon: 'S', iconClass: 'icon-default',           docsUrl: 'https://fivetran.com/docs/connectors/applications/slack' },
  zendesk:          { icon: 'Z', iconClass: 'icon-default',           docsUrl: 'https://fivetran.com/docs/connectors/applications/zendesk' },
  jira:             { icon: 'J', iconClass: 'icon-default',           docsUrl: 'https://fivetran.com/docs/connectors/applications/jira' },
  snowflake_db:     { icon: 'S', iconClass: 'icon-default',           docsUrl: 'https://fivetran.com/docs/connectors/databases/snowflake' },
  bigquery_db:      { icon: 'B', iconClass: 'icon-google',            docsUrl: 'https://fivetran.com/docs/connectors/databases/bigquery' },
  redshift_db:      { icon: 'R', iconClass: 'icon-aws',               docsUrl: 'https://fivetran.com/docs/connectors/databases/redshift' },
  marketo:          { icon: 'M', iconClass: 'icon-default',           docsUrl: 'https://fivetran.com/docs/connectors/applications/marketo' },
  amplitude:        { icon: 'A', iconClass: 'icon-default',           docsUrl: 'https://fivetran.com/docs/connectors/applications/amplitude' },
  mixpanel:         { icon: 'M', iconClass: 'icon-default',           docsUrl: 'https://fivetran.com/docs/connectors/applications/mixpanel' },
  linkedin_ads:     { icon: 'L', iconClass: 'icon-linkedin',          docsUrl: 'https://fivetran.com/docs/connectors/applications/linkedin-ads' },
  tiktok_ads:       { icon: 'T', iconClass: 'icon-default',           docsUrl: 'https://fivetran.com/docs/connectors/applications/tiktok-ads' },
  klaviyo:          { icon: 'K', iconClass: 'icon-default',           docsUrl: 'https://fivetran.com/docs/connectors/applications/klaviyo' },
  braze:            { icon: 'B', iconClass: 'icon-default',           docsUrl: 'https://fivetran.com/docs/connectors/applications/braze' },
  intercom:         { icon: 'I', iconClass: 'icon-default',           docsUrl: 'https://fivetran.com/docs/connectors/applications/intercom' },
  outreach:         { icon: 'O', iconClass: 'icon-default',           docsUrl: 'https://fivetran.com/docs/connectors/applications/outreach' },
  salesloft:        { icon: 'S', iconClass: 'icon-default',           docsUrl: 'https://fivetran.com/docs/connectors/applications/salesloft' },
  pipedrive:        { icon: 'P', iconClass: 'icon-default',           docsUrl: 'https://fivetran.com/docs/connectors/applications/pipedrive' },
  chargebee:        { icon: 'C', iconClass: 'icon-default',           docsUrl: 'https://fivetran.com/docs/connectors/applications/chargebee' },
  github:           { icon: 'G', iconClass: 'icon-default',           docsUrl: 'https://fivetran.com/docs/connectors/applications/github' },
  quickbooks:       { icon: 'Q', iconClass: 'icon-default',           docsUrl: 'https://fivetran.com/docs/connectors/applications/quickbooks' },
  netsuite:         { icon: 'N', iconClass: 'icon-oracle',            docsUrl: 'https://fivetran.com/docs/connectors/applications/netsuite-suiteanalytics' },
  xero:             { icon: 'X', iconClass: 'icon-default',           docsUrl: 'https://fivetran.com/docs/connectors/applications/xero' },
  freshdesk:        { icon: 'F', iconClass: 'icon-default',           docsUrl: 'https://fivetran.com/docs/connectors/applications/freshdesk' },
  sendgrid:         { icon: 'S', iconClass: 'icon-default',           docsUrl: 'https://fivetran.com/docs/connectors/applications/sendgrid' },
  bing_ads:         { icon: 'B', iconClass: 'icon-microsoft',         docsUrl: 'https://fivetran.com/docs/connectors/applications/bing-ads' },
  snapchat_ads:     { icon: 'S', iconClass: 'icon-default',           docsUrl: 'https://fivetran.com/docs/connectors/applications/snapchat-ads' },
  asana:            { icon: 'A', iconClass: 'icon-default',           docsUrl: 'https://fivetran.com/docs/connectors/applications/asana' },
  servicenow:       { icon: 'S', iconClass: 'icon-default',           docsUrl: 'https://fivetran.com/docs/connectors/applications/servicenow' },
  segment:          { icon: 'S', iconClass: 'icon-default',           docsUrl: 'https://fivetran.com/docs/connectors/applications/segment' },
  iterable:         { icon: 'I', iconClass: 'icon-default',           docsUrl: 'https://fivetran.com/docs/connectors/applications/iterable' },
  recurly:          { icon: 'R', iconClass: 'icon-default',           docsUrl: 'https://fivetran.com/docs/connectors/applications/recurly' },
  zuora:            { icon: 'Z', iconClass: 'icon-default',           docsUrl: 'https://fivetran.com/docs/connectors/applications/zuora' },
  recharge:         { icon: 'R', iconClass: 'icon-default',           docsUrl: 'https://fivetran.com/docs/connectors/applications/recharge' },
  freshsales:       { icon: 'F', iconClass: 'icon-default',           docsUrl: 'https://fivetran.com/docs/connectors/applications/freshsales' },
  copper:           { icon: 'C', iconClass: 'icon-default',           docsUrl: 'https://fivetran.com/docs/connectors/applications/copper' },
  gainsight:        { icon: 'G', iconClass: 'icon-default',           docsUrl: 'https://fivetran.com/docs/connectors/applications/gainsight' },
  pinterest_ads:    { icon: 'P', iconClass: 'icon-default',           docsUrl: 'https://fivetran.com/docs/connectors/applications/pinterest-ads' },
  criteo:           { icon: 'C', iconClass: 'icon-default',           docsUrl: 'https://fivetran.com/docs/connectors/applications/criteo' },
  appsflyer:        { icon: 'A', iconClass: 'icon-default',           docsUrl: 'https://fivetran.com/docs/connectors/applications/appsflyer' },
  workday:          { icon: 'W', iconClass: 'icon-default',           docsUrl: 'https://fivetran.com/docs/connectors/applications/workday' },
  bamboohr:         { icon: 'B', iconClass: 'icon-default',           docsUrl: 'https://fivetran.com/docs/connectors/applications/bamboohr' },
  monday:           { icon: 'M', iconClass: 'icon-default',           docsUrl: 'https://fivetran.com/docs/connectors/applications/monday' },
  gitlab:           { icon: 'G', iconClass: 'icon-default',           docsUrl: 'https://fivetran.com/docs/connectors/applications/gitlab' },
  twilio:           { icon: 'T', iconClass: 'icon-default',           docsUrl: 'https://fivetran.com/docs/connectors/applications/twilio' },
  airtable:         { icon: 'A', iconClass: 'icon-default',           docsUrl: 'https://fivetran.com/docs/connectors/applications/airtable' }
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
