// seed-aws-lambda.js
// Populates Supabase with Fivetran AWS Lambda connector data.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CONNECTOR_ID = 'aws_lambda';

const connector = {
  id: CONNECTOR_ID,
  name: 'AWS Lambda',
  category: 'applications',
  description: "Fivetran's AWS Lambda connector allows customers to build custom data pipelines using AWS Lambda functions. Fivetran invokes the customer's Lambda function on a schedule, and the function returns data in a Fivetran-defined JSON format. This is Fivetran's custom connector framework for AWS environments.",
  what_it_does: 'Fivetran invokes a customer-deployed AWS Lambda function on the configured sync schedule. The Lambda function fetches data from any source (internal APIs, databases, SaaS tools) and returns it in Fivetran-standard JSON format (insert, update, delete, schema, state). Fivetran handles loading, schema management, and incremental state tracking.',
  useful_for: 'Building custom connectors for internal APIs, proprietary data sources, or any system without a pre-built Fivetran connector. Common for internal microservices, custom CRM systems, and niche SaaS tools.'
};

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: '<custom_tables>',
    what_it_contains: 'Tables defined by the Lambda function response — schema and data are fully controlled by the function code.',
    why_it_matters: 'The Lambda function defines what tables and columns exist. Fivetran manages the destination schema based on the function output.',
    key_callouts: 'Schema is declared in the function response. Primary keys must be specified. State management (cursors, pagination tokens) is handled via the state object passed between invocations.'
  }
];

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Lambda Function Timeout (5-Minute Limit)',
    issue_preview: 'Function execution exceeds AWS Lambda timeout',
    root_cause: 'AWS Lambda has a maximum execution time of 15 minutes, but Fivetran recommends keeping invocations under 5 minutes. If the function takes too long (large data pull, slow upstream API), it times out and the sync fails.',
    impact: 'Sync fails with a timeout error. No data is loaded for that cycle. If the function does not properly save state, progress is lost and the next invocation starts over.',
    resolution: 'Implement pagination in the Lambda function — return partial results with a cursor in the state object. Fivetran will re-invoke the function with the saved state to continue. Keep each invocation focused on a small batch of data.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'IAM Role Permissions Insufficient',
    issue_preview: 'Fivetran cannot invoke the Lambda function',
    root_cause: 'The IAM role or external ID configured during setup does not grant Fivetran permission to invoke the Lambda function. The trust policy may be missing the Fivetran AWS account ID, or the execution role may lack lambda:InvokeFunction permission.',
    impact: 'Connector setup fails. No syncs can occur until IAM is correctly configured.',
    resolution: 'Follow the Fivetran Lambda setup guide exactly. The IAM role needs a trust policy allowing the Fivetran AWS account to assume it, and the role must have lambda:InvokeFunction permission on the target function ARN.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Invalid Response Format From Lambda Function',
    issue_preview: 'Function returns data but Fivetran cannot parse it',
    root_cause: 'The Lambda function must return data in a specific Fivetran JSON format with insert, update, delete, schema, state, and hasMore fields. Any deviation from this format causes the sync to fail.',
    impact: 'Sync fails with a parse error. Data is not loaded even though the function executed successfully.',
    resolution: 'Use the Fivetran Lambda SDK or follow the response format documentation exactly. Test the function output against the expected schema before deploying. Common mistakes: missing hasMore flag, wrong schema declaration, state not being a JSON object.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Cold Start Latency on Infrequent Syncs',
    issue_preview: 'First sync after idle period is slower than expected',
    root_cause: 'AWS Lambda cold starts occur when the function has not been invoked recently. The container must be initialized, dependencies loaded, and connections established — adding seconds to minutes of latency.',
    impact: 'Occasional slow syncs, especially for connectors with low sync frequency. Not a data integrity issue but can cause sync duration variance.',
    resolution: 'Use provisioned concurrency for critical Lambda functions. Keep the function package small to reduce cold start time. This is an AWS Lambda platform behavior, not a Fivetran issue.'
  }
];

async function main() {
  console.log('Seeding AWS Lambda connector data...\n');

  const { error: ce } = await supabase.from('connectors').upsert({ ...connector, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (ce) { console.error('Error:', ce); process.exit(1); }
  console.log('Upserted connector: AWS Lambda');

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

  console.log('\nDone — AWS Lambda: 1 table, 4 issues');
}

main().catch(e => { console.error(e); process.exit(1); });
