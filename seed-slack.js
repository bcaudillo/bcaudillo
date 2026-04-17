// seed-slack.js
// Populates Supabase with Fivetran Slack connector data.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CONNECTOR_ID = 'slack';

const connector = {
  id: CONNECTOR_ID,
  name: 'Slack',
  category: 'applications',
  description: "Fivetran's Slack connector syncs workspace data including channels, users, messages, reactions, and files. It provides a queryable archive of Slack communication for compliance, analytics, and organizational insights.",
  what_it_does: 'Syncs channels (public and private if authorized), users, messages, threads, reactions, files, and user groups via the Slack Web API. Uses incremental sync based on message timestamps. Requires a Slack app with appropriate OAuth scopes installed in the workspace.',
  useful_for: 'Communication analytics, compliance and audit archiving, employee engagement metrics, support channel monitoring, internal knowledge mining, and organizational network analysis.'
};

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CHANNEL',
    what_it_contains: 'All channels — name, purpose, topic, creator, member count, is_private, is_archived.',
    why_it_matters: 'Channel inventory for filtering and segmentation of message data.',
    key_callouts: 'Private channels only sync if the Slack app is added to them. Archived channels are included.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'USER',
    what_it_contains: 'Workspace users — name, email, title, status, is_admin, is_bot, timezone.',
    why_it_matters: 'User dimension for message attribution and organizational analysis.',
    key_callouts: 'Includes deactivated users and bots. Email may be empty for users who hide it.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'MESSAGE',
    what_it_contains: 'All messages — text, user, channel, timestamp, thread_ts, subtype, attachments.',
    why_it_matters: 'Core communication data. Powers search, compliance, and engagement analytics.',
    key_callouts: 'High-volume table — grows fast in active workspaces. Thread replies share a thread_ts. Message edits update the existing row.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CHANNEL_MEMBER',
    what_it_contains: 'Channel membership — which users belong to which channels.',
    why_it_matters: 'Channel participation analysis and access audit.',
    key_callouts: 'Junction table between CHANNEL and USER.'
  }
];

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Private Channels Require Explicit App Membership',
    issue_preview: 'Private channel messages not syncing',
    root_cause: 'The Slack app must be explicitly added to each private channel to read its messages. Unlike public channels, private channels are not accessible by default even with the correct OAuth scopes.',
    impact: 'Private channel data is completely missing from the warehouse. Users assume all channels are synced.',
    resolution: 'Add the Fivetran Slack app to each private channel that needs to be synced. This must be done by a channel member or workspace admin. New private channels must also be added manually.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'MESSAGE Table Grows Very Large',
    issue_preview: 'High MAR and storage from message volume',
    root_cause: 'Every message in every synced channel creates a row. Active workspaces with hundreds of channels generate millions of messages per month. Edits to existing messages also count as MAR.',
    impact: 'MAR can spike unexpectedly in active workspaces. Storage costs grow continuously. Queries without channel/date filters are slow.',
    resolution: 'Exclude high-traffic channels that are not needed for analytics (e.g. bot channels, social channels). Use the Schema tab to select only the channels you need. Filter downstream queries by date.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'OAuth Token Expiration or Scope Changes',
    issue_preview: 'Sync fails after Slack app permissions are modified',
    root_cause: 'If the Slack app is reinstalled, scopes are changed, or the authorizing user is deactivated, the OAuth token may become invalid. Slack workspace admins can also revoke app access.',
    impact: 'All syncs stop until re-authorized. No notification from Fivetran unless alerts are configured.',
    resolution: 'Re-authorize the connector in Fivetran. Ensure the Slack app has all required scopes: channels:history, channels:read, users:read, users:read.email, groups:read, groups:history.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Deleted Messages Are Not Retroactively Removed',
    issue_preview: 'Messages deleted in Slack remain in the warehouse',
    root_cause: 'The Slack API does not provide a reliable mechanism to detect message deletions retroactively. Fivetran can only capture deletions that occur during an active sync window.',
    impact: 'Deleted messages persist in the warehouse. For compliance use cases, this may be desirable (audit trail) or problematic (right-to-be-forgotten).',
    resolution: 'For compliance deletion requirements, implement a separate process to check and remove deleted messages. For audit purposes, the persistence of deleted messages is a feature.'
  }
];

async function main() {
  console.log('Seeding Slack connector data...\n');

  const { error: ce } = await supabase.from('connectors').upsert({ ...connector, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (ce) { console.error('Error:', ce); process.exit(1); }
  console.log('Upserted connector: Slack');

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

  console.log('\nDone — Slack: 4 tables, 4 issues');
}

main().catch(e => { console.error(e); process.exit(1); });
