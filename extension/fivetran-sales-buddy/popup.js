let scannedConnectors = [];

// ─── CONNECTOR DATA ──────────────────────────────────────
// Hardcoded fallback. On popup open, supabase-client.js fetches the real data
// and replaces the contents of this object via Object.assign. If the fetch
// fails (network blocked, Supabase down), the hardcoded data still works.
const connectorData = {
  hubspot: {
    name: 'HubSpot',
    icon: 'H',
    iconClass: 'icon-hubspot',
    description: 'CRM platform for managing sales, marketing, and customer service',
    whatItDoes: 'HubSpot is a cloud-based CRM that centralizes customer relationships, sales pipelines, and marketing campaigns. Fivetran syncs contacts, companies, deals, tickets, and engagement data.',
    usefulFor: 'Sales teams managing deals, marketing teams running campaigns, customer success tracking, revenue operations',
    docsUrl: 'https://fivetran.com/docs/connectors/applications/hubspot',
    tables: [
      { name: 'CONTACT', whatContains: 'All contacts/leads — email, name, lifecycle stage, custom properties', whyMatters: 'Core table for customer base and lead pipeline', keyCallouts: 'CONTACT_PROPERTY_HISTORY tracks every field change — #1 MAR driver' },
      { name: 'COMPANY', whatContains: 'Company/account records — industry, size, revenue, owner', whyMatters: 'Account-level analytics and org mapping', keyCallouts: 'Linked to contacts via COMPANY_CONTACT association table' },
      { name: 'DEAL', whatContains: 'Sales opportunities — stage, amount, close date, pipeline', whyMatters: 'Pipeline reporting and revenue forecasting', keyCallouts: 'Stage history in DEAL_STAGE table. Merged deals tracked in MERGED_DEAL.' },
      { name: 'TICKET', whatContains: 'Support tickets — status, priority, category, resolution', whyMatters: 'Customer success and support analytics', keyCallouts: 'Requires Service Hub. Won\'t appear if inactive or no tickets exist.' },
      { name: 'ENGAGEMENT', whatContains: 'Emails, calls, meetings, notes, tasks linked to contacts/deals', whyMatters: 'Tracks all sales and service touchpoints', keyCallouts: 'Child tables: ENGAGEMENT_EMAIL, _CALL, _MEETING, _NOTE, _TASK' }
    ],
    knownIssues: [
      { category: 'Data Integrity', title: 'Missing Columns, Tables, or Values', preview: 'Columns, tables, or values missing in destination', rootCause: 'HubSpot connector doesn\'t create empty tables or columns if no data exists in the source. Engagement columns sync to child tables with the naming convention property_hs_<field>.', impact: 'Data gaps in warehouse — analysts may think data is broken when it simply hasn\'t been populated yet. Discontinued columns may also return null values.', resolution: 'Go to the Schema tab in your HubSpot connector dashboard and click Schema settings. Review Fivetran\'s HubSpot release notes for discontinued tables and columns. Check HubSpot subscription level for feature access.', subIssues: [
        { title: 'Missing columns or tables', explanation: 'Fivetran will not sync columns or tables if there is no applicable data in the source. If no contacts have a value for a custom property, that column won\'t appear. Check the Schema tab to confirm the table/column is enabled.' },
        { title: 'Missing engagement columns and tables', explanation: 'Engagement columns sync to relevant child tables with the naming convention property_hs_<field>. If you can\'t find an engagement column, go to the Schema tab and click Schema settings. Check the ERD to confirm your HubSpot subscription supports the engagement type.' },
        { title: 'Missing association columns', explanation: 'Association tables require both objects to have data. If no deals are linked to contacts, the association table will be empty. To re-sync an association table (format: FROM_TABLE_TO_TABLE), you must re-sync the FROM_TABLE.' },
        { title: 'Missing deletes', explanation: 'Fivetran uses webhooks to capture deletes for supported tables. Due to potential timeouts at the source or within the Webhook Processing System (WPS), it may take up to 30 minutes for deletes to be reflected in the destination.' }
      ]},
      { category: 'Data Integrity', title: 'Property Columns in DEAL Table Return null', preview: 'Custom deal properties appear as null values in destination', rootCause: 'Custom properties with no values in any record won\'t generate columns. Properties with values in some records will show null for records without values.', impact: 'Reports may show incomplete deal data.', resolution: 'Verify in HubSpot that deals actually have values set for the expected properties. Ensure property is not a calculated field.' },
      { category: 'Data Integrity', title: 'Source Fields With Similar Names Appear Merged', preview: 'Two distinct HubSpot fields mapping to the same destination column', rootCause: 'Fivetran normalizes column names — fields like "Company Name" and "company_name" may resolve to the same column.', impact: 'Data from two source fields can overwrite each other in the destination.', resolution: 'Rename one of the conflicting fields in HubSpot to create a distinct normalized name.' },
      { category: 'Data Integrity', title: 'Merged Deals Not Marked as _fivetran_deleted = TRUE', preview: 'Merged deals remain active in destination tables', rootCause: 'HubSpot\'s merge behavior doesn\'t always trigger a delete event — the "losing" deal may not be flagged.', impact: 'Duplicate deal records in warehouse can inflate pipeline numbers.', resolution: 'Use HubSpot\'s merge audit log or DEAL_MERGE table to identify and filter merged records in your queries.' },
      { category: 'Data Integrity', title: 'Property Labels Not Updating in Destination', preview: 'Renamed properties in HubSpot still show old names', rootCause: 'Fivetran syncs internal property names, not display labels. Renaming a label in HubSpot doesn\'t change the API name.', impact: 'Column names in warehouse won\'t match what users see in HubSpot UI.', resolution: 'Check the internal API name in HubSpot Settings → Properties. Create aliases/views in your warehouse if needed.' },
      { category: 'Data Integrity', title: 'Records With Status "Not opted" Missing from EMAIL_SUBSCRIPTION_CHANGE', preview: 'Contacts with "Not opted" subscription status not appearing', rootCause: '"Not opted" is a default state — no change event exists, so there\'s no record to sync.', impact: 'Incomplete view of email subscription landscape.', resolution: 'LEFT JOIN contacts with EMAIL_SUBSCRIPTION_CHANGE; null results indicate "Not opted" status.' },
      { category: 'Data Integrity', title: 'Data Discrepancies in Association Tables', preview: 'Associations in Fivetran don\'t match HubSpot UI', rootCause: 'HubSpot has multiple association types (primary, secondary, custom labels). Fivetran may not capture all custom label associations.', impact: 'Relationship data may be incomplete for complex association setups.', resolution: 'Review which association types are supported by the connector version. Check HubSpot API v3 vs v4 association differences.' },
      { category: 'Data Integrity', title: 'Phantom Records in COMPANY, CONTACT, and DEAL Tables', preview: 'Records in destination that can\'t be found in HubSpot', rootCause: 'Records may have been merged or deleted in HubSpot after syncing. Soft-deleted records persist with _fivetran_deleted flag.', impact: 'Inflated record counts if not filtering on _fivetran_deleted.', resolution: 'Always filter WHERE _fivetran_deleted = FALSE in queries. Check merge audit logs for consolidated records.' },
      { category: 'Data Integrity', title: 'MARKETING_EMAIL_CONTACT Table Missing', preview: 'MARKETING_EMAIL_CONTACT or MARKETING_EMAIL_CONTACT_LIST not available', rootCause: 'Fivetran populates the MARKETING_EMAIL table from HubSpot\'s Marketing Email API. The MARKETING_EMAIL_CONTACT table is only created if the vidsIncluded field has a value in the API response. Similarly, MARKETING_EMAIL_CONTACT_LIST requires the mailingListsIncluded field to have a value. Fivetran doesn\'t create empty tables for HubSpot.', impact: 'Email marketing engagement data unavailable in warehouse — cannot analyze which contacts received which emails.', resolution: 'Verify that marketing emails in HubSpot actually have contacts (vidsIncluded) or lists (mailingListsIncluded) associated with them. If the fields are empty in HubSpot, the tables won\'t be created.' },
      { category: 'Data Integrity', title: 'TICKETS Table Not Syncing', preview: 'Ticket data not appearing in destination', rootCause: 'Tickets require Service Hub subscription. Table won\'t appear if Service Hub is not active or no tickets exist.', impact: 'Support analytics unavailable.', resolution: 'Confirm Service Hub is active and at least one ticket exists in HubSpot. Re-check connector schema.' },
      { category: 'Errors', title: 'Couldn\'t Complete the Connection Error', preview: 'Initial setup fails with connection error', rootCause: 'OAuth token is invalid, expired, or the authenticating user lacks required scopes.', impact: 'Connector cannot be set up — no data syncs.', resolution: 'Re-authenticate with a Super Admin user. Ensure all required OAuth scopes are granted. If using private app, regenerate the access token.' },
      { category: 'Errors', title: 'Cannot Select – Not Available in Your HubSpot Subscription', preview: 'Tables/objects greyed out in connector schema', rootCause: 'The connection\'s authenticating user doesn\'t have Super Admin access to the HubSpot account. Fivetran receives an error querying the table endpoint and logs: "Do not have enough permissions to sync deal table."', impact: 'Affected tables are automatically unchecked in the schema. Connector cannot sync restricted tables like Deal properties or Marketing objects.', resolution: 'Ensure the authenticating user has Super Admin access to HubSpot. Re-authorize the connection: In Fivetran, go to your HubSpot connection page → Connection Details → Re-authorize as a Super Admin user. See HubSpot\'s User permissions guide for details.' },
      { category: 'Errors', title: 'Hub Is Unknown to This Hublet (EU Migration)', preview: 'Authorization fails after migrating HubSpot to EU data center', rootCause: 'When migrating between data centers (US → EU), the authorization URL and Hub ID change.', impact: 'Sync fails completely — all data stops flowing.', resolution: 'After migration completes: 1) Create a new OAuth app in the EU portal, 2) Re-create the Fivetran connector with the new credentials, 3) Historical data will need re-sync.' },
      { category: 'Errors', title: 'HTTP Status: 500 Internal Server Error', preview: 'Intermittent 500 errors from HubSpot API', rootCause: 'Server-side issue on HubSpot\'s end — usually transient.', impact: 'Sync may fail or be delayed. Usually resolves on next sync attempt.', resolution: 'Wait for next scheduled sync. If persistent, check HubSpot status page. Contact Fivetran support if errors persist beyond 24 hours.' },
      { category: 'Errors', title: 'Sync Failure Due to Schema Changes During Ongoing Sync', preview: 'Sync breaks mid-run when schema is modified', rootCause: 'Adding/removing properties or objects in HubSpot while a sync is in progress can cause conflicts.', impact: 'Current sync fails — data may be partially synced.', resolution: 'Avoid schema changes during active syncs. Allow failed sync to complete, then trigger a re-sync. Fivetran will reconcile schema differences.' },
      { category: 'Errors', title: 'Warning: Increase the Connector Update Frequency', preview: 'Fivetran recommends more frequent syncs', rootCause: 'Data volume is high and sync window is too long — changes may be missed between syncs.', impact: 'Data freshness degrades; potential for missed incremental changes.', resolution: 'Increase sync frequency in connector settings. Consider which tables truly need frequent updates vs. which can sync less often.' },
      { category: 'FAQ', title: 'Can I Sync HubSpot Calculation and Rollup Properties?', preview: 'Calculated/rollup property support', rootCause: 'Calculation and rollup properties are supported but may have sync delays.', impact: 'Values may lag behind HubSpot UI by one sync cycle.', resolution: 'These properties sync normally. If values appear stale, check sync frequency and ensure the property type is supported in your HubSpot tier.' },
      { category: 'FAQ', title: 'Impact of Uninstalling the Fivetran App', preview: 'What happens when the Fivetran app is removed from HubSpot', rootCause: 'Uninstalling revokes OAuth access — all syncs stop immediately.', impact: 'Data stops flowing. Existing warehouse data remains but becomes stale.', resolution: 'Reinstall and re-authenticate to resume syncing. Historical data will need a re-sync depending on connector configuration.' },
      { category: 'FAQ', title: 'How Does Fivetran Handle Custom Field Name Changes?', preview: 'Behavior when renaming custom properties', rootCause: 'Fivetran uses internal API names, not display labels.', impact: 'Renaming a label in HubSpot has no effect on the destination column name.', resolution: 'To change the destination column name, you need to change the internal API name in HubSpot (which creates a new property). Create SQL aliases for display purposes.' },
      { category: 'FAQ', title: 'Difference Between is_deleted and _fivetran_deleted', preview: 'Two deletion flags with different meanings', rootCause: 'is_deleted is a HubSpot-native field. _fivetran_deleted is added by Fivetran when a record is removed from the API response.', impact: 'Using the wrong flag can include or exclude wrong records.', resolution: 'Use _fivetran_deleted for Fivetran sync state. Use is_deleted for HubSpot\'s own soft-delete status. Best practice: filter on both.' },
      { category: 'How To', title: 'Delete a HubSpot Connector', preview: 'Steps to safely remove a HubSpot connector', rootCause: '', impact: 'Deleting a connector removes the sync but preserves warehouse data.', resolution: 'Go to Fivetran Dashboard → Connectors → Select HubSpot → Settings → Delete Connector. Warehouse tables will remain but stop updating.' },
      { category: 'How To', title: 'Get Call Outcome Data Using Engagement API', preview: 'Extracting call disposition and outcome data', rootCause: '', impact: 'Call outcome data is in the ENGAGEMENT_CALL table.', resolution: 'Query the ENGAGEMENT_CALL table and join with ENGAGEMENT for metadata. Call dispositions are stored in the DISPOSITION field.' },
      { category: 'How To', title: 'Get HubSpot Call Outcome Data via Properties', preview: 'Alternative method using call properties', rootCause: '', impact: 'Call outcomes can also be accessed through property columns on the ENGAGEMENT_CALL table.', resolution: 'Look for property_hs_call_disposition and property_hs_call_status columns in the ENGAGEMENT_CALL table. These contain the call outcome and status respectively.' },
      { category: 'How To', title: 'Uninstall Fivetran App from HubSpot', preview: 'Steps to remove the Fivetran integration', rootCause: '', impact: 'Uninstalling revokes OAuth access and stops all syncs immediately. Existing warehouse data remains intact but becomes stale.', resolution: 'In HubSpot: Settings → Integrations → Connected Apps → Find Fivetran → Uninstall. Note: You will need to re-authenticate if you reinstall later, and a historical re-sync may be required.' },
      { category: 'Setup', title: 'HubSpot Permissions for Fivetran', preview: 'Required permissions and access levels', rootCause: '', impact: 'Insufficient permissions cause partial or failed syncs.', resolution: 'The authenticating user needs Super Admin role in HubSpot. For private apps, ensure all required scopes are selected: crm.objects.contacts.read, crm.objects.companies.read, crm.objects.deals.read, etc.' },
      { category: 'Setup', title: 'Can I Use Client ID and Client Secret to Authenticate?', preview: 'Alternative authentication methods', rootCause: '', impact: 'Standard OAuth flow is recommended.', resolution: 'Yes — use a HubSpot Private App to generate an access token. This is useful for automated setups. Go to HubSpot Settings → Integrations → Private Apps → Create.' },
      { category: 'Syncs', title: 'Long-Running Syncs', preview: 'Syncs taking longer than expected', rootCause: 'Large data volumes, especially from CONTACT_PROPERTY_HISTORY, ENGAGEMENT tables, or initial historical syncs.', impact: 'Data freshness is reduced. High MAR consumption during long syncs.', resolution: 'Review which tables are enabled — disable CONTACT_PROPERTY_HISTORY if not needed. Consider filtering historical data. Check if schema changes triggered a re-sync.' },
      { category: 'Syncs', title: 'High MAR from CONTACT_PROPERTY_HISTORY', preview: 'Unexpectedly high MAR consumption', rootCause: 'CONTACT_PROPERTY_HISTORY records every property change for every contact. A single field update across 100k contacts = 100k MAR.', impact: 'Monthly costs can spike dramatically — this is the #1 MAR driver for HubSpot connectors.', resolution: 'Review if CONTACT_PROPERTY_HISTORY is needed. If only tracking a few properties, consider excluding this table and building change tracking in your warehouse instead.' }
    ]
  },
  salesforce: {
    name: 'Salesforce',
    icon: 'S',
    iconClass: 'icon-salesforce',
    description: 'Enterprise CRM and customer success platform',
    whatItDoes: 'Salesforce manages sales, service, and customer success across the entire customer lifecycle. Fivetran syncs standard and custom objects.',
    usefulFor: 'Large enterprises, complex sales cycles, customer support operations, revenue operations',
    docsUrl: 'https://fivetran.com/docs/connectors/applications/salesforce',
    tables: [
      { name: 'Account', whatContains: 'Customer accounts with name, industry, annual revenue, and custom fields', whyMatters: 'Central object for all B2B relationships and revenue attribution', keyCallouts: 'Person Accounts behave differently from Business Accounts' },
      { name: 'Contact', whatContains: 'Contact records linked to accounts with email, phone, title', whyMatters: 'Key for outreach, marketing, and relationship mapping', keyCallouts: 'Linked to Account via AccountId' },
      { name: 'Opportunity', whatContains: 'Sales opportunities with amount, stage, close date, probability', whyMatters: 'Primary pipeline and revenue forecasting table', keyCallouts: 'Stage history tracked in separate OpportunityFieldHistory table' },
      { name: 'Lead', whatContains: 'Leads with status, source, conversion info', whyMatters: 'Top-of-funnel tracking before conversion to Contact/Opportunity', keyCallouts: 'Converted leads reference Contact and Opportunity IDs' },
      { name: 'Task', whatContains: 'Activities, to-dos, and logged interactions', whyMatters: 'Sales activity tracking and rep productivity analytics', keyCallouts: 'Polymorphic WhoId/WhatId fields link to multiple object types' }
    ],
    knownIssues: [
      // Data Integrity
      { category: 'Data Integrity', title: 'Tables or Fields Missing From Destination', preview: 'Salesforce tables/fields excluded during sync', rootCause: 'Fivetran intentionally excludes tables or fields due to permission issues, unsupported data types, or limitations. The authorizing user may lack read access.', impact: 'Missing data in warehouse — alert appears in Fivetran dashboard.', resolution: 'Ensure the authorizing user has permission to read data from Salesforce\'s API. Check Salesforce\'s Configure Permissions and Access docs. Review unsupported data types documentation.' },
      { category: 'Data Integrity', title: 'Field History Tables Are Separate', preview: 'Historical field changes not in main object tables', rootCause: 'Salesforce stores field change history in dedicated *FieldHistory tables, not on the main object. History tables track changes using field history tracking.', impact: 'Historical change data requires joining separate tables for trend analysis.', resolution: 'Enable and sync the corresponding *FieldHistory tables (e.g., OpportunityFieldHistory). Join via ParentId. Note: Fivetran has disabled history mode for SF history tables since they track history by default.' },
      { category: 'Data Integrity', title: 'Deletes Not Captured After Pausing 15+ Days', preview: 'Soft-deleted records missed if connector paused too long', rootCause: 'Salesforce only holds soft-deleted records in the recycle bin for 15 days. If connector is paused longer, deletes are lost.', impact: 'Records deleted in Salesforce will not be marked as deleted in warehouse — data integrity issues.', resolution: 'Re-sync each affected table before unpausing. Fivetran shows a warning icon next to affected tables on the Schema tab. Hover over the table row → click Re-sync. Note: re-sync contributes to MAR.' },
      { category: 'Data Integrity', title: 'Formula Field Value Discrepancies', preview: 'Formula field values don\'t match Salesforce UI', rootCause: 'Formula and lookup fields are not directly synced — they must be recreated in the destination. Older dbt package versions may produce incorrect values.', impact: 'Calculated fields in warehouse don\'t match what users see in Salesforce.', resolution: 'Use FIVETRAN_FORMULA and FIVETRAN_FORMULA_MODEL tables to recreate formulas. Ensure latest version of Salesforce Formula Utils dbt package. Contact support if values still incorrect.' },
      { category: 'Data Integrity', title: 'Field Name Changes Don\'t Backfill', preview: 'Renaming a Salesforce field creates a new column, old data stays', rootCause: 'If you change a field name in Salesforce, Fivetran keeps the old field and adds a new one. Old data is not backfilled into the new column.', impact: 'Two columns for the same field — old data in one, new data in the other.', resolution: 'Trigger a table re-sync to backfill. Same applies when removing then re-granting column permissions — only new records sync until re-sync.' },
      { category: 'Data Integrity', title: 'Currency Values Depend on ISO Code', preview: 'Multi-currency orgs show values in record currency, not corporate currency', rootCause: 'Currency field values are retrieved according to each record\'s ISO Code, not necessarily in corporate currency.', impact: 'Revenue reports can be misleading if not accounting for multiple currencies.', resolution: 'Check the ISO Code field on each record. Refer to Salesforce multi-currency documentation for conversion logic.' },
      { category: 'Data Integrity', title: '_fivetran_deleted Missing From System Tables', preview: 'System tables like FIVETRAN_PICKLIST_FIELD_VALUE lack deletion tracking', rootCause: 'Salesforce system tables are snapshot tables, not changelog tables. They are re-created every sync to reflect current source data.', impact: 'Cannot track deletions on system tables — they only show current state.', resolution: 'This is expected behavior. System tables reflect current state at sync time. Use the main object tables for deletion tracking.' },
      { category: 'Data Integrity', title: 'Large Opportunity Syncs Are Slow', preview: 'Sync takes excessively long with 100k+ opportunities', rootCause: 'Salesforce API has rate limits and query timeouts for large datasets.', impact: 'Sync duration increases significantly, potential timeouts.', resolution: 'Increase sync window, consider filtering historical data. Check API usage in Salesforce Setup → Company Information.' },
      // Errors
      { category: 'Errors', title: 'Authentication Failed — Unable to Request Access Information', preview: 'Connection fails during setup or re-auth', rootCause: 'Fivetran connects through login.salesforce.com. If using a custom domain, the standard Salesforce connector won\'t work.', impact: 'Connector cannot authenticate — no data syncs.', resolution: 'Use the Salesforce Sandbox connector instead of the standard connector if using a custom domain. See Fivetran\'s Salesforce setup guide.' },
      { category: 'Errors', title: 'Reconnect the Connection With the Latest Credentials', preview: 'Re-authorization fails when already logged into Salesforce', rootCause: 'When re-authorizing while logged into Salesforce, SF skips the login screen and confirms sign-in but doesn\'t return the credentials Fivetran needs.', impact: 'Re-authorization fails — sync stays broken.', resolution: 'Log out of Salesforce. Open a private/incognito window. In Fivetran → Salesforce connection → Setup tab → Edit connection → Re-Authorize Connection.' },
      { category: 'Errors', title: 'The REST API Is Not Enabled for This Organization', preview: 'Salesforce org doesn\'t have API access', rootCause: 'Salesforce org doesn\'t have API access (requires Enterprise+ plan) or the authorizing user doesn\'t have the "API Enabled" permission.', impact: 'Connector cannot make any API calls — complete sync failure.', resolution: 'Ensure Salesforce account is Enterprise-level or higher, or has purchased API calls. Grant the authorizing user\'s profile the "API Enabled" permission.' },
      { category: 'Errors', title: 'API Request Limit Exceeded', preview: 'Salesforce API daily limit reached', rootCause: 'Salesforce enforces daily API call limits based on edition and user licenses.', impact: 'Sync stops until the limit resets (usually midnight PT).', resolution: 'Check API usage in Salesforce Setup → Company Information. Consider upgrading API limits or reducing sync frequency.' },
      // FAQ
      { category: 'FAQ', title: 'How Does Fivetran Handle Custom Objects?', preview: 'Syncing custom Salesforce objects', rootCause: '', impact: 'Custom objects sync alongside standard objects.', resolution: 'Custom objects appear with __c suffix. Enable them in Fivetran\'s schema configuration. Ensure the Fivetran user has read access. Note: some installed packages need a license to view custom objects.' },
      { category: 'FAQ', title: 'Why Can\'t I Find a Salesforce Object?', preview: 'Expected table not appearing in destination', rootCause: 'Common reasons: insufficient permissions, installed package needs a license, column is a formula/compound field (not synced directly), or table name differs from display name.', impact: 'Missing expected data in warehouse.', resolution: 'Check permissions. Assign package licenses if needed. Formula fields use FIVETRAN_FORMULA tables. Fivetran uses the Salesforce "name" field, not the UI label — check the API name.' },
      { category: 'FAQ', title: 'What Happens When I Change a Field Label?', preview: 'Renaming field labels vs field names', rootCause: 'Changing a field label (display name) has no effect on the connection. Changing the field name creates a new column.', impact: 'Label changes: no impact. Name changes: old column stays, new column added, no backfill.', resolution: 'For label changes — no action needed. For name changes — trigger a table re-sync to backfill the new column.' },
      // Setup
      { category: 'Setup', title: 'Sandbox vs Production Credentials', preview: 'Using wrong environment credentials', rootCause: 'Fivetran connects via login.salesforce.com for production. Sandbox uses test.salesforce.com and requires the Salesforce Sandbox connector.', impact: 'No data syncing or syncing test/dev data instead of real data.', resolution: 'Production: use standard Salesforce connector + login.salesforce.com. Sandbox: use Salesforce Sandbox connector + test.salesforce.com. Custom domain: use Sandbox connector.' },
      // Syncs
      { category: 'Syncs', title: 'Schema Changes Automatically Detected', preview: 'How Fivetran handles new columns, custom fields, or data type changes', rootCause: '', impact: 'New columns and fields appear automatically in destination. Structure mirrors native Salesforce schema.', resolution: 'Fivetran automatically detects and pushes schema changes to your destination. Each connected account creates a separate schema. No manual intervention needed.' }
    ]
  },
  stripe: {
    name: 'Stripe',
    icon: '$',
    iconClass: 'icon-stripe',
    description: 'Payment processing and billing platform',
    whatItDoes: 'Stripe handles online payments, subscription billing, and financial transactions. Fivetran syncs customers, subscriptions, invoices, charges, and refund data.',
    usefulFor: 'E-commerce, SaaS billing, recurring revenue tracking, financial reconciliation',
    docsUrl: 'https://fivetran.com/docs/connectors/applications/stripe',
    tables: [
      { name: 'Customer', whatContains: 'All customers with name, email, metadata, and default payment method', whyMatters: 'Core table linking subscriptions, charges, and invoices to payers', keyCallouts: 'Metadata field contains JSON — parse for custom attributes' },
      { name: 'Subscription', whatContains: 'Active/inactive subscriptions with plan, status, amount, billing interval', whyMatters: 'Essential for MRR/ARR calculations and churn analysis', keyCallouts: 'Status field: active, past_due, canceled, trialing, etc.' },
      { name: 'Invoice', whatContains: 'Payment invoices with amount, status, date, line items', whyMatters: 'Revenue recognition and billing reconciliation', keyCallouts: 'amount_paid vs amount_due for partial payments' },
      { name: 'Charge', whatContains: 'Individual payment attempts with amount, status, card details', whyMatters: 'Transaction-level payment tracking and failure analysis', keyCallouts: 'Refunds are separate records — join via charge_id. invoice_id column links to INVOICE.' },
      { name: 'Balance Transaction', whatContains: 'All money movements including fees, payouts, refunds', whyMatters: 'True financial reconciliation including Stripe fees', keyCallouts: 'Net amount = gross - Stripe fees. reporting_category column for classification.' }
    ],
    knownIssues: [
      // Data Integrity
      { category: 'Data Integrity', title: 'Refunds Need Reconciliation', preview: 'Refunds appear as separate records from original charges', rootCause: 'Stripe records refunds as distinct objects linked to the original charge via charge_id.', impact: 'Revenue calculations can be double-counted without proper reconciliation.', resolution: 'JOIN refunds to charges using charge_id. Calculate net revenue as charge amount minus refund amounts.' },
      { category: 'Data Integrity', title: 'Test Mode Data Syncs Separately', preview: 'Test transactions may appear in analytics', rootCause: 'Stripe maintains separate test and live mode data. Fivetran offers two connectors: Stripe (live) and Stripe Test Mode.', impact: 'Non-production test data can corrupt analytics if mixed with live data.', resolution: 'Ensure you\'re using the correct connector. Filter records WHERE livemode = TRUE as a safety measure.' },
      { category: 'Data Integrity', title: 'Timestamps Use Stripe Account Timezone', preview: 'Timestamps may not be in UTC', rootCause: 'Fivetran doesn\'t convert source timestamps to UTC — it uses the Stripe account\'s configured timezone.', impact: 'Time-based analytics can be off if analysts assume UTC. Joining with other sources on timestamp may produce mismatches.', resolution: 'Check the Stripe account\'s timezone setting. Convert timestamps in your warehouse if UTC is needed for cross-source joins.' },
      { category: 'Data Integrity', title: 'UPCOMING_INVOICE Not Syncing', preview: 'Upcoming invoice table empty for certain subscriptions', rootCause: 'Fivetran does not sync records to UPCOMING_INVOICE for subscriptions with automatic tax enabled and discountable negative line items — Stripe API returns an error for this configuration.', impact: 'Missing upcoming invoice data for affected subscriptions.', resolution: 'This is a known Stripe API limitation. Check if affected subscriptions have automatic tax + discountable negative line items.' },
      { category: 'Data Integrity', title: 'Hard Deletes on Certain Tables', preview: 'Some records are permanently removed, not soft-deleted', rootCause: 'Fivetran uses hard deletes (permanent removal) for specific Stripe tables instead of soft deletes with _fivetran_deleted.', impact: 'Deleted records disappear from warehouse entirely — no audit trail.', resolution: 'Check Fivetran docs for the list of hard-delete tables. If you need deletion history, capture snapshots in your warehouse before syncs.' },
      { category: 'Data Integrity', title: 'PLAN Table Re-Imported Every Sync', preview: 'PLAN table fully re-synced on every sync cycle', rootCause: 'Fivetran re-imports the entire PLAN table every sync to capture changes and deletions.', impact: 'Can increase MAR for accounts with many plans. All plan rows are touched each sync.', resolution: 'This is expected behavior. Factor PLAN table row count into MAR estimates.' },
      { category: 'Data Integrity', title: 'Subscription Complex Relationships', preview: 'Subscriptions link to many related tables', rootCause: 'A single subscription connects to customers, invoices, charges, plans, and products.', impact: 'Queries require multiple joins — SQL complexity increases significantly.', resolution: 'Review Stripe ER diagram. Build a materialized view that pre-joins the most common relationships.' },
      // Errors
      { category: 'Errors', title: 'API Key Permissions Insufficient', preview: 'Restricted API key missing required read permissions', rootCause: 'Restricted API keys limit permissions per resource. If a resource isn\'t enabled on the key, its table won\'t sync.', impact: 'Some tables won\'t sync — missing data in warehouse.', resolution: 'Use a Standard (secret) key (starts with sk_live_) for full access. Or ensure restricted key has read permissions for all required resources.' },
      { category: 'Errors', title: 'Connected Account Data Not Syncing', preview: 'Data from Stripe Connect accounts not appearing', rootCause: 'Connected account syncing requires two settings: the ACCOUNT table must be checked in Schema tab, AND the Sync Connected Accounts toggle must be ON in Setup.', impact: 'Connected account data missing from warehouse entirely.', resolution: 'In Fivetran: Schema tab → check ACCOUNT table → Save. Then Setup tab → Edit connection → Sync Connected Accounts toggle ON → Save & Test.' },
      // FAQ
      { category: 'FAQ', title: 'How to Handle Multi-Currency', preview: 'Dealing with multiple currencies in Stripe data', rootCause: '', impact: 'Summing amounts across currencies produces meaningless totals.', resolution: 'Always group by currency when aggregating. Use balance_transaction.exchange_rate for conversions to settlement currency.' },
      { category: 'FAQ', title: 'PAYMENT_METHOD Requires Parent Tables', preview: 'Payment method data not syncing despite being selected', rootCause: 'PAYMENT_METHOD is a child table of SETUP_INTENT, SETUP_ATTEMPT, PAYMENT_INTENT, CUSTOMER, and CHARGE. It won\'t sync unless parent tables are also selected.', impact: 'PAYMENT_METHOD and its child tables (PAYMENT_METHOD_CARD, AU_BECS_DEBIT, FPX, IDEAL, SEPA_DEBIT) will be empty.', resolution: 'Select all parent tables: SETUP_INTENT, SETUP_ATTEMPT, PAYMENT_INTENT, CUSTOMER, and CHARGE in the Schema tab.' },
      { category: 'FAQ', title: 'CARD Table Columns Require Stripe Enablement', preview: 'Certain CARD columns not populating', rootCause: 'Some CARD table columns are not available in standard Stripe API requests and must be enabled by Stripe support.', impact: 'Missing card detail columns in warehouse.', resolution: 'Contact Stripe support to enable the required columns. Also ensure CHARGE, SOURCE, BANK_ACCOUNT, PAYMENT_METHOD, CARD, and ACCOUNT tables are selected in Schema tab.' },
      // Setup
      { category: 'Setup', title: 'Restricted vs Standard API Key', preview: 'Which API key type to use', rootCause: '', impact: 'Restricted keys may block certain resources from syncing.', resolution: 'Restricted API key: use when you want to limit permissions per resource. Standard (secret) key: use when you need full access to all resources. Standard key required for certain specific resources — check setup guide.' },
      { category: 'Setup', title: 'Stripe API Version Matters', preview: 'Account must use API version after Feb 2019', rootCause: 'The shape of resources from the Events endpoint depends on the default API version used by the Stripe account.', impact: 'Outdated API versions may cause unexpected data shapes or missing fields.', resolution: 'Ensure your Stripe account uses an API version released after February 19, 2019. Check in Stripe Dashboard → Developers → API version.' },
      // Syncs
      { category: 'Syncs', title: 'SUBSCRIPTION_HISTORY Cannot Be Re-Synced', preview: 'Re-sync button has no effect on subscription history', rootCause: 'Fivetran does not initiate any action when you click Re-sync for SUBSCRIPTION_HISTORY because re-syncing could result in loss of historical data.', impact: 'Cannot force a refresh of subscription history data.', resolution: 'This is by design to protect historical data. If data appears incorrect, contact Fivetran support.' },
      { category: 'Syncs', title: 'Weekly Re-Sync of Pending Balance Transactions', preview: 'Pending transactions re-synced weekly', rootCause: 'On a weekly basis, Fivetran re-syncs pending balance transactions back to the earliest pending transaction in the Stripe account.', impact: 'Increased MAR during weekly re-sync if many pending transactions exist.', resolution: 'This is expected behavior to ensure pending transactions eventually settle. Factor into MAR estimates.' }
    ]
  },
  shopify: {
    name: 'Shopify',
    icon: 'S',
    iconClass: 'icon-shopify',
    description: 'E-commerce platform for online stores, retail POS, and multi-channel selling',
    whatItDoes: 'Shopify powers online and in-person commerce for millions of merchants. Fivetran syncs orders, products, customers, inventory, and transaction data to give a complete picture of e-commerce performance.',
    usefulFor: 'E-commerce analytics, customer lifetime value, inventory management, revenue reporting, marketing attribution',
    docsUrl: 'https://fivetran.com/docs/connectors/applications/shopify',
    tables: [
      { name: 'ORDER', whatContains: 'All orders including status, total price, discounts, shipping, customer reference, and line items', whyMatters: 'The core revenue table — every e-commerce analysis starts here', keyCallouts: 'Includes both completed and cancelled orders. financial_status distinguishes paid, refunded, partially_refunded. Check cancel_reason for cancelled orders.' },
      { name: 'PRODUCT', whatContains: 'Product catalog with title, vendor, product type, tags, published status, and variant details', whyMatters: 'Essential for product performance analysis, catalog management, and merchandising insights', keyCallouts: 'Products with multiple variants (size, color) generate rows in PRODUCT_VARIANT. Use product_type and tags for segmentation.' },
      { name: 'CUSTOMER', whatContains: 'Customer profiles with email, name, order count, total spend, tags, and marketing consent status', whyMatters: 'Powers customer lifetime value (CLV) analysis, segmentation, and retention tracking', keyCallouts: 'orders_count and total_spent are Shopify-calculated fields — useful for quick segmentation. verified_email indicates confirmed addresses.' },
      { name: 'INVENTORY_ITEM', whatContains: 'Inventory records with SKU, cost, country of origin, tracked status, and quantity across locations', whyMatters: 'Critical for inventory management, COGS calculation, and stock-out prevention', keyCallouts: 'Pair with INVENTORY_LEVEL for per-location quantities. cost field enables margin analysis when joined with ORDER_LINE.' },
      { name: 'TRANSACTION', whatContains: 'Payment transactions with amount, kind (sale, refund, void), gateway, status, and currency', whyMatters: 'True financial reconciliation — tracks every money movement including partial refunds and voids', keyCallouts: 'Multiple transactions per order are common (authorization, capture, refund). Filter on kind and status for accurate revenue calculations.' }
    ],
    knownIssues: [
      { category: 'Data Integrity', title: 'Missing Historical Orders Before Connector Setup', preview: 'Orders placed before initial sync may be incomplete', rootCause: 'Fivetran\'s initial sync pulls historical orders, but Shopify\'s API may not return orders older than 60 days for some endpoints or apps with limited scopes. Archived orders may also be excluded depending on API version.', impact: 'Historical revenue analysis may show gaps. Year-over-year comparisons can be unreliable if the connector was set up mid-year.', resolution: 'Check the initial sync date and verify historical order coverage. If orders are missing, confirm the Shopify app has read_all_orders scope (requires Shopify approval). For very old orders, a CSV backfill into the warehouse may be needed.' },
      { category: 'Data Integrity', title: 'Refund Data Requires Multi-Table Joins', preview: 'Refunds are not simple negative amounts on the ORDER table', rootCause: 'Shopify stores refunds across multiple tables: REFUND (header), ORDER_ADJUSTMENT (financial adjustments), and TRANSACTION (actual money movement). Partial refunds, restocking fees, and shipping refunds each appear differently.', impact: 'Revenue calculations that only look at ORDER.total_price will overstate revenue. Net revenue requires subtracting refunds properly.', resolution: 'Join ORDER → REFUND → ORDER_ADJUSTMENT for financial impact. Use TRANSACTION with kind = "refund" for actual money returned. Build a materialized view for net revenue: gross_sales - refunds - discounts + shipping.' },
      { category: 'Data Integrity', title: 'Metafield Syncing Limitations', preview: 'Custom metafields may not appear in destination', rootCause: 'Shopify metafields (custom data attached to products, orders, customers) require explicit configuration. The connector syncs metafields to a dedicated METAFIELD table rather than adding columns to parent tables.', impact: 'Custom product attributes, order notes, or customer tags stored as metafields won\'t appear in main tables. Analysts may miss critical business-specific data.', resolution: 'Enable the METAFIELD table in the Fivetran schema. Join metafields to parent tables using owner_id and owner_resource. For high-value metafields, create a pivot view in your warehouse.' },
      { category: 'Data Integrity', title: 'Multi-Currency Order Amounts', preview: 'Orders in different currencies can produce misleading totals', rootCause: 'Shopify stores order amounts in the presentment currency (what the customer paid) and the shop currency (merchant\'s base currency). Fivetran syncs both but aggregating without currency awareness produces incorrect totals.', impact: 'Revenue reports mixing currencies will be mathematically wrong. A $100 USD order and a 100 EUR order are not $200.', resolution: 'Always group by currency when summing amounts, or convert using presentment_currency and shop_currency fields. Use ORDER.total_price_usd if available, or build an exchange rate table for conversions.' },
      { category: 'Data Integrity', title: 'Order Edits Not Reflected as Updates', preview: 'Edited orders may show original values', rootCause: 'When a merchant edits an order in Shopify (changing quantities, adding items), the edit creates new records in ORDER_EDIT and STAGED_FULFILLMENT tables rather than updating the original ORDER row.', impact: 'ORDER table may show pre-edit totals. Line-item level analysis can miss added or removed items.', resolution: 'Check ORDER_EDIT table for modifications. The edited_at timestamp on ORDER indicates if edits occurred. For accurate current-state reporting, incorporate ORDER_EDIT adjustments.' },
      { category: 'Errors', title: 'API Version Deprecation Causes Sync Failures', preview: 'Sync breaks after Shopify deprecates an API version', rootCause: 'Shopify deprecates API versions on a regular cadence (roughly every 12 months). When a version is sunset, endpoints return errors. Fivetran must update the connector to use a supported version.', impact: 'Syncs fail completely until the connector is updated. No new data flows to the warehouse.', resolution: 'Check Fivetran\'s connector release notes for API version updates. If syncs fail with version-related errors, ensure your Fivetran connector is on the latest version. Contact Fivetran support if the issue persists.' },
      { category: 'Errors', title: 'Rate Limiting on High-Volume Stores', preview: '429 errors causing sync delays or failures', rootCause: 'Shopify enforces API rate limits (REST: 2 requests/second for standard plans, higher for Plus). High-volume stores with many products or orders can hit these limits during sync.', impact: 'Sync duration increases significantly. In extreme cases, syncs may time out before completing.', resolution: 'Fivetran handles rate limiting with automatic retries and backoff. If syncs consistently time out, consider upgrading to Shopify Plus for higher API limits, or reduce the number of enabled tables.' },
      { category: 'FAQ', title: 'Draft Orders vs Regular Orders', preview: 'Draft orders may or may not appear in ORDER table', rootCause: 'Draft orders are invoices or manual orders created by merchants but not yet completed. They live in a separate DRAFT_ORDER table until converted to a real order.', impact: 'Draft orders are not included in revenue calculations from the ORDER table. If a merchant relies heavily on draft orders (B2B, wholesale), revenue may appear understated.', resolution: 'Enable DRAFT_ORDER table for visibility into pending/manual orders. Once a draft order is completed, it appears as a regular ORDER. Do not double-count by summing both tables.' },
      { category: 'FAQ', title: 'Shopify Plus vs Standard Data Differences', preview: 'Some tables and fields only available on Shopify Plus', rootCause: 'Shopify Plus merchants have access to additional APIs (e.g., Gift Card, Multipass, Flow) and higher rate limits. Some connector tables are only populated for Plus stores.', impact: 'Sales reps demoing to Plus prospects can highlight additional data availability. Standard merchants asking about missing tables may simply lack the Plus subscription.', resolution: 'Check if the merchant is on Shopify Plus before discussing advanced tables like GIFT_CARD or SCRIPT. Confirm Plus-specific features in Shopify\'s API documentation.' },
      { category: 'Setup', title: 'Shopify App Permissions and Scopes', preview: 'Connector requires specific API access scopes', rootCause: 'The Fivetran Shopify connector requires a custom app or private app with read access to orders, products, customers, inventory, and other resources. Missing scopes cause silent data gaps.', impact: 'Tables for resources without granted scopes will be empty or missing entirely. No error may appear — data simply won\'t sync.', resolution: 'Ensure the Shopify app has these scopes: read_orders, read_products, read_customers, read_inventory, read_fulfillments, read_draft_orders, read_locations. For historical orders older than 60 days, request read_all_orders scope from Shopify.' },
      { category: 'Setup', title: 'Multiple Shopify Stores Require Separate Connectors', preview: 'Each Shopify store needs its own Fivetran connector', rootCause: 'Shopify does not have a multi-store API. Each store (mystore.myshopify.com) is an independent instance with its own credentials.', impact: 'Merchants with multiple brands or regions need a connector per store, increasing cost and complexity.', resolution: 'Set up one Fivetran connector per Shopify store. Use consistent schema naming (e.g., shopify_us, shopify_eu) for easier cross-store analytics. Build a union view in the warehouse for consolidated reporting.' },
      { category: 'Syncs', title: 'Fulfillment Data Lag', preview: 'Fulfillment status updates appear delayed', rootCause: 'Fulfillment events (shipped, delivered, returned) are updated asynchronously by Shopify and third-party logistics providers. The FULFILLMENT and FULFILLMENT_EVENT tables depend on carrier tracking updates reaching Shopify.', impact: 'Real-time shipping dashboards may show stale statuses. Delivery confirmation can lag by hours or days depending on the carrier.', resolution: 'This is a Shopify-side limitation, not a Fivetran issue. Increase sync frequency for more timely updates. For real-time tracking, consider supplementing with carrier API data directly.' },
      { category: 'Syncs', title: 'Deleted Products and Customers Not Captured', preview: 'Hard-deleted records disappear without trace', rootCause: 'When a merchant permanently deletes a product or customer in Shopify, the API no longer returns it. Fivetran marks these with _fivetran_deleted = TRUE but only if the deletion is detected during a sync window.', impact: 'If a product is deleted between syncs, historical order data referencing that product will have orphaned product_id values.', resolution: 'Filter on _fivetran_deleted for current-state queries. For historical analysis, ensure products and customers are archived (not deleted) in Shopify to preserve reference data.' }
    ]
  },
  netsuite: {
    name: 'NetSuite',
    icon: 'N',
    iconClass: 'icon-oracle',
    description: 'Enterprise ERP for financials, supply chain, CRM, and e-commerce (Oracle-owned)',
    whatItDoes: 'NetSuite is a cloud ERP system managing accounting, inventory, procurement, HR, and CRM in a single platform. Fivetran syncs financial transactions, customer records, item catalogs, and custom record types via SuiteAnalytics.',
    usefulFor: 'Finance and accounting teams, CFO reporting, revenue recognition, multi-subsidiary consolidation, supply chain analytics',
    docsUrl: 'https://fivetran.com/docs/connectors/applications/netsuite-suiteanalytics',
    tables: [
      { name: 'TRANSACTION', whatContains: 'All financial transactions — invoices, payments, journal entries, bills, sales orders, credit memos, and more', whyMatters: 'The single most important NetSuite table — every dollar flows through here. Powers P&L, balance sheet, cash flow, and revenue reporting.', keyCallouts: 'Transaction type field distinguishes invoices vs payments vs journals. Always filter by type for meaningful analysis. Use TRANSACTION_LINE for line-level detail.' },
      { name: 'CUSTOMER', whatContains: 'Customer master records with company name, billing/shipping addresses, payment terms, sales rep, and custom fields', whyMatters: 'Core entity for AR aging, customer segmentation, and revenue attribution by account', keyCallouts: 'Includes both companies and individuals. parent_id links child customers to parent entities. category field maps to customer segments.' },
      { name: 'ITEM', whatContains: 'Product and service catalog — inventory items, non-inventory items, service items, kits, assemblies, and discount items', whyMatters: 'Central reference for everything sold, purchased, or manufactured. Links transactions to what was bought/sold.', keyCallouts: 'item_type distinguishes inventory vs service vs kit. Use ITEM_MEMBER for kit/assembly components. cost and base_price fields enable margin analysis.' },
      { name: 'ACCOUNT', whatContains: 'Chart of accounts — account number, name, type (Asset, Liability, Equity, Income, Expense), and sub-accounts', whyMatters: 'The backbone of all financial reporting. Every transaction posts to accounts. Needed for P&L, balance sheet, and trial balance.', keyCallouts: 'account_type is critical for financial statement mapping. parent_id links sub-accounts to parent accounts. Use ACCOUNTING_PERIOD for period-based reporting.' },
      { name: 'SUBSIDIARY', whatContains: 'Legal entities in a multi-subsidiary NetSuite instance — company name, currency, fiscal calendar, country', whyMatters: 'Essential for multi-entity consolidation, intercompany eliminations, and currency translation', keyCallouts: 'Only populated in OneWorld (multi-subsidiary) accounts. subsidiary_id on transactions filters data by entity. Elimination subsidiary used for intercompany entries.' }
    ],
    knownIssues: [
      { category: 'Setup', title: 'SuiteAnalytics vs SuiteTalk — Choosing the Right Connector', preview: 'Two different NetSuite connectors serve different needs', rootCause: 'Fivetran offers two NetSuite connectors: SuiteAnalytics (uses ODBC/JDBC via saved searches and analytics data source) and SuiteTalk (uses REST/SOAP API). SuiteAnalytics is the recommended connector for most use cases — it provides broader table coverage and handles large data volumes better.', impact: 'Choosing the wrong connector can lead to missing tables, slower syncs, or unnecessary complexity. SuiteTalk has tighter API rate limits and doesn\'t support all record types.', resolution: 'Use SuiteAnalytics (the default) unless you have a specific need for SuiteTalk. SuiteAnalytics requires the SuiteAnalytics Connect feature enabled in NetSuite (SuiteAnalytics Workbook license). Confirm with the prospect\'s NetSuite admin.' },
      { category: 'Setup', title: 'Fivetran Integration Role and Permissions', preview: 'Connector requires a specific NetSuite role with precise permissions', rootCause: 'The Fivetran connector needs a dedicated role in NetSuite (typically called "Fivetran Integration") with permissions to access tables, saved searches, and RESTlets. Missing permissions silently exclude tables from sync.', impact: 'Incorrect role setup is the #1 cause of failed NetSuite deployments. Tables appear missing, syncs fail, or only partial data flows. Customers blame Fivetran when it\'s a permissions issue.', resolution: 'Follow Fivetran\'s NetSuite setup guide exactly — it specifies the required role permissions. The role needs: Log in using Access Tokens, SuiteAnalytics Workbook access, and read permissions for each record type. Provide the customer with Fivetran\'s setup checklist.' },
      { category: 'Setup', title: 'Token-Based Authentication (TBA) Setup', preview: 'OAuth or password auth not supported — must use TBA', rootCause: 'The NetSuite SuiteAnalytics connector requires Token-Based Authentication (TBA). This involves creating an Integration record, generating Consumer Key/Secret, then creating an Access Token for the Fivetran role/user. It\'s a multi-step process in NetSuite admin.', impact: 'Setup takes longer than simpler connectors (15-30 minutes for an experienced admin). Wrong token configuration causes immediate auth failures.', resolution: 'Walk the customer through: 1) Enable TBA feature in Setup → Company → Enable Features → SuiteCloud. 2) Create Integration record (get Consumer Key/Secret). 3) Create Access Token for the Fivetran user+role (get Token ID/Secret). All four values are needed in Fivetran setup.' },
      { category: 'Data Integrity', title: 'Saved Search Limitations Affect Data Completeness', preview: 'Some data may be filtered by saved search criteria', rootCause: 'The SuiteAnalytics connector can use saved searches to define which data to sync. If a saved search has filters (e.g., only "Active" customers), those filters restrict what Fivetran sees. Saved searches also have a 10,000-row display limit in the NetSuite UI, though the API can retrieve more.', impact: 'Data in the warehouse may be an incomplete subset of NetSuite. Finance teams may report discrepancies between NetSuite reports and warehouse data.', resolution: 'Review any saved searches used by the connector to ensure they don\'t have restrictive filters. For full data extracts, use the SuiteAnalytics Connect data source (table-level access) rather than saved searches. Advise the customer to audit search criteria.' },
      { category: 'Data Integrity', title: 'Custom Record Types May Not Sync Automatically', preview: 'Custom record types require explicit configuration', rootCause: 'NetSuite allows creating custom record types (e.g., custom transaction types, custom entities). These don\'t appear in the standard connector schema — they must be explicitly added using their internal ID (custrecord_xxx).', impact: 'Business-critical custom records (common in manufacturing, healthcare, financial services) may be missing from the warehouse without anyone realizing.', resolution: 'Ask the customer about custom record types during discovery. In Fivetran, add custom records via the Schema tab using the NetSuite internal ID. The Fivetran role must have read permission for each custom record type.' },
      { category: 'Data Integrity', title: 'Multi-Subsidiary Currency Handling', preview: 'Transactions in different subsidiaries may use different currencies', rootCause: 'NetSuite OneWorld supports multiple subsidiaries, each with its own base currency. Transactions are stored in the subsidiary\'s currency, and consolidated reporting requires currency translation using NetSuite\'s exchange rate tables.', impact: 'Summing transaction amounts across subsidiaries without currency conversion produces incorrect financial totals. This is a critical issue for multi-national customers.', resolution: 'Use the CURRENCY_EXCHANGE_RATE or CONSOLIDATED_EXCHANGE_RATE table for conversions. Join transactions with their subsidiary\'s base currency. Build a currency conversion layer in the warehouse before any cross-subsidiary aggregation.' },
      { category: 'Data Integrity', title: 'Deleted Records Handling', preview: 'Deleted records may not be captured depending on connector version', rootCause: 'NetSuite doesn\'t have a reliable "recycle bin" API like Salesforce. Detecting deleted records requires comparing current data against previous syncs. The SuiteAnalytics connector handles this via Fivetran\'s standard deletion detection, but there can be delays.', impact: 'Deleted transactions, customers, or items may persist in the warehouse as active records, inflating counts and financial totals.', resolution: 'Always filter on _fivetran_deleted = FALSE in queries. For critical financial tables (TRANSACTION, ACCOUNT), periodically reconcile warehouse totals against NetSuite reports to catch discrepancies.' },
      { category: 'Syncs', title: 'Slow Syncs Due to Large Transaction Volume', preview: 'Initial and incremental syncs take hours for large NetSuite instances', rootCause: 'Enterprise NetSuite instances often have millions of transaction lines accumulated over years. The SuiteAnalytics connector queries these via ODBC, which can be slow for large datasets. Saved search-based syncs are further limited by NetSuite\'s query execution timeouts.', impact: 'Initial sync can take days for large instances. Incremental syncs may run 2-4 hours for high-volume accounts, reducing data freshness.', resolution: 'For initial sync, plan for 2-7 days depending on data volume. Reduce scope by disabling non-essential tables. For ongoing performance, ensure the Fivetran role isn\'t sharing API concurrency with other integrations. Consider syncing historical data in phases.' },
      { category: 'Syncs', title: 'TRANSACTION_LINE Sync Volume and MAR Impact', preview: 'Transaction lines can be the largest table and biggest MAR driver', rootCause: 'Every line item on every invoice, payment, journal entry, and sales order creates a TRANSACTION_LINE row. A single invoice with 50 line items generates 50 rows. High-volume businesses can have tens of millions of lines.', impact: 'TRANSACTION_LINE is often the single largest contributor to MAR. Customers may be surprised by MAR consumption from this one table.', resolution: 'Set expectations during deal sizing: ask about average line items per transaction and total transaction volume. If MAR is a concern, consider limiting historical sync depth or filtering to specific transaction types.' },
      { category: 'Errors', title: 'SuiteAnalytics Connect License Required', preview: 'Sync fails with authentication or access errors', rootCause: 'The SuiteAnalytics connector requires the customer to have a SuiteAnalytics Connect (formerly SuiteAnalytics Workbook) license in their NetSuite contract. Without it, the ODBC/JDBC connection that Fivetran uses will be rejected.', impact: 'Complete sync failure — no data flows. This surfaces as an authentication error that can be confused with credential issues.', resolution: 'Before setup, confirm the customer has SuiteAnalytics Connect in their NetSuite contract. If not, they need to add it through their Oracle/NetSuite account manager. This is a paid NetSuite add-on — set expectations with the prospect.' },
      { category: 'Errors', title: 'Role Restriction Errors on Specific Tables', preview: 'Some tables return "insufficient permissions" while others sync fine', rootCause: 'The Fivetran Integration role may have blanket access to standard records but miss permissions for specific sensitive tables (e.g., EMPLOYEE, PAYROLL_ITEM) or custom records.', impact: 'Partial data in warehouse — some tables sync, others silently fail or are excluded. Finance team may not realize payroll or HR data is missing.', resolution: 'Review the Fivetran role in NetSuite: Lists → Relationships → Roles → Fivetran Integration → Permissions tab. Add read access for each missing record type. Common misses: Employee, Vendor, Department, Classification, Location.' },
      { category: 'FAQ', title: 'How Does Fivetran Handle NetSuite Customizations?', preview: 'Custom fields, records, and scripts in NetSuite', rootCause: 'NetSuite is heavily customized in most implementations. Custom fields (custbody_xxx, custcol_xxx) appear as additional columns on standard tables. Custom record types need explicit configuration. Custom scripts don\'t affect sync.', impact: 'The degree of NetSuite customization directly affects setup complexity. Highly customized instances may need more connector configuration.', resolution: 'Custom fields on standard records sync automatically. Custom record types must be manually added to the Fivetran schema. Workflows and SuiteScripts don\'t impact sync. Ask during discovery: "How customized is your NetSuite instance?"' },
      { category: 'FAQ', title: 'NetSuite Sandbox vs Production', preview: 'Testing the connector in a sandbox environment', rootCause: 'NetSuite offers sandbox accounts for testing. Fivetran can connect to either sandbox or production, but they require separate connectors with different credentials (the sandbox has its own account ID and TBA tokens).', impact: 'Setting up in sandbox first reduces risk but requires duplicate setup effort. Sandbox data may not reflect production volume or complexity.', resolution: 'Recommend sandbox testing for complex deployments. Use the same Fivetran setup steps but with sandbox-specific credentials. The NetSuite sandbox account ID format differs from production (typically includes _SB1 suffix).' }
    ]
  },
  google_ads: {
    name: 'Google Ads',
    icon: 'G',
    iconClass: 'icon-google',
    description: 'Search, display, video, and shopping advertising platform',
    whatItDoes: 'Google Ads powers paid search, display, YouTube, and shopping campaigns. Fivetran syncs campaign structures, ad performance metrics, keyword data, and conversion tracking across all campaign types.',
    usefulFor: 'Paid media teams, performance marketing, SEM/PPC management, cross-channel attribution, marketing ROI analysis',
    docsUrl: 'https://fivetran.com/docs/connectors/applications/google-ads',
    tables: [
      { name: 'CAMPAIGN', whatContains: 'All campaigns with name, status, budget, bidding strategy, network settings, and start/end dates', whyMatters: 'Top-level grouping for all ad spend and performance reporting', keyCallouts: 'Campaign types include Search, Display, Video, Shopping, Performance Max, and App. Status values: ENABLED, PAUSED, REMOVED.' },
      { name: 'AD_GROUP', whatContains: 'Ad groups within campaigns — targeting settings, default bids, status, and ad rotation preferences', whyMatters: 'Middle tier of the campaign hierarchy where targeting and bidding are set', keyCallouts: 'Each ad group belongs to one campaign. Bid adjustments and audience targeting are configured at this level.' },
      { name: 'AD', whatContains: 'Individual ad creatives — headlines, descriptions, display URLs, final URLs, and ad type', whyMatters: 'Tracks which specific creatives are running and enables A/B testing analysis', keyCallouts: 'Responsive search ads have multiple headlines/descriptions stored as arrays. Expanded text ads (legacy) have fixed headline fields.' },
      { name: 'KEYWORD', whatContains: 'Keywords with match type, bid, quality score, status, and approval status', whyMatters: 'Core of search campaign optimization — shows what terms you are bidding on and their quality', keyCallouts: 'Match types: EXACT, PHRASE, BROAD. Quality Score components: expected CTR, ad relevance, landing page experience.' },
      { name: 'CAMPAIGN_STATS', whatContains: 'Daily performance metrics per campaign — impressions, clicks, cost, conversions, CTR, average CPC', whyMatters: 'Primary table for spend tracking, ROI calculations, and trend analysis', keyCallouts: 'Metrics are aggregated daily. Cost is in micros (divide by 1,000,000 for actual currency). Conversions may update retroactively within the attribution window.' }
    ],
    knownIssues: [
      { category: 'Data Integrity', title: 'Metrics Arrive With Up to 3-Hour Delay', preview: 'Recent campaign data not yet visible in destination', rootCause: 'The Google Ads API has an inherent reporting delay of up to 3 hours. Click, impression, and conversion data is not available in real time.', impact: 'Dashboards showing "today\'s performance" will be incomplete. Stakeholders may see stale numbers.', resolution: 'Set expectations that Google Ads data has a built-in lag. Design dashboards with "as of" timestamps. Use the Google Ads UI for intra-day monitoring.' },
      { category: 'Data Integrity', title: 'Conversion Data Updates Retroactively', preview: 'Conversion counts change days after the click occurred', rootCause: 'Google Ads attributes conversions back to the original click date, not the conversion date. Conversions can be reported up to 90 days after the click.', impact: 'Historical conversion numbers shift over time. CPA and ROAS metrics are unstable until the attribution window closes.', resolution: 'Wait 7-14 days before treating conversion data as final. Use Fivetran\'s conversion window re-sync feature to keep historical data updated.' },
      { category: 'Data Integrity', title: 'Currency Values in Micros', preview: 'Cost and bid values appear as very large numbers', rootCause: 'Google Ads API returns all monetary values in micros (1/1,000,000 of the currency unit). A $5.00 CPC is returned as 5000000.', impact: 'Reports show wildly inflated numbers if analysts don\'t divide by 1,000,000.', resolution: 'Apply conversion in your transformation layer: cost_actual = cost / 1000000. The dbt_google_ads package handles this automatically.' },
      { category: 'Data Integrity', title: 'Segment Granularity Causes Row Explosion', preview: 'Adding segments dramatically increases row count and MAR', rootCause: 'When report tables include segments (device, network, click type), each combination creates a separate row. A single campaign-day can explode into dozens of rows.', impact: 'Unexpected MAR increases. Queries without proper aggregation will double-count metrics.', resolution: 'Only enable segments you actually need. Be aware that rows with segments cannot be simply summed. Review enabled segments in the Schema tab.' },
      { category: 'Data Integrity', title: 'Smart Campaign and Performance Max Limited Data', preview: 'Automated campaign types have restricted reporting fields', rootCause: 'Smart Campaigns and Performance Max use Google\'s AI to manage targeting. Google restricts the granularity of data available through the API for these types.', impact: 'Cannot perform keyword-level or creative-level analysis on automated campaigns.', resolution: 'Set expectations that automated campaign types offer aggregate-level reporting only. Use the Google Ads UI for detailed Performance Max insights.' },
      { category: 'Setup', title: 'MCC vs Individual Account Setup', preview: 'Choosing between manager account and individual account connections', rootCause: 'Google Ads supports MCC (Manager) account connections that sync all child accounts, and individual account connections.', impact: 'MCC = one connector covers all accounts. Individual = more control but multiple connectors. Switching requires re-setup.', resolution: 'For agencies or multi-account setups, use MCC. For single-account advertisers, use individual. Use Fivetran\'s account filtering to exclude unneeded accounts.' },
      { category: 'Setup', title: 'OAuth Scoping and Permissions', preview: 'Insufficient OAuth permissions block data sync', rootCause: 'The authenticating Google account must have at least read-only access to the Google Ads account. For MCC setups, admin or standard access is needed at the manager level.', impact: 'Connector authenticates but fails to pull ads data because the OAuth token lacks the Google Ads API scope.', resolution: 'Ensure the authenticating user has "Standard" or "Read-only" access in Google Ads. Re-authorize the connection if permissions were granted after initial setup.' },
      { category: 'Errors', title: 'API Quota Exceeded for Large Accounts', preview: 'Sync fails due to Google Ads API rate limits', rootCause: 'Google Ads API enforces daily request quotas. Accounts with hundreds of campaigns or millions of keywords can exhaust quotas.', impact: 'Sync fails partway through — some tables updated, others stale.', resolution: 'Reduce sync frequency for very large accounts. Disable unneeded report tables and segments. Contact Fivetran support for optimization.' },
      { category: 'Syncs', title: 'Re-Sync Window for Statistical Tables', preview: 'Fivetran re-syncs recent days to capture retroactive updates', rootCause: 'Because Google Ads retroactively updates metrics, Fivetran re-syncs a configurable window of recent days on each sync. Default is typically 30 days.', impact: 'MAR increases because rows within the re-sync window are re-processed every sync.', resolution: 'Adjust the conversion window in connector settings to match your actual Google Ads attribution window. Shorter windows reduce MAR.' },
      { category: 'FAQ', title: 'Why Google Ads Numbers Don\'t Match the UI', preview: 'Slight discrepancies between Fivetran data and Google Ads dashboard', rootCause: 'The Google Ads UI applies real-time data, includes invalid click adjustments live, and may use different attribution models than the API.', impact: 'Small discrepancies (typically under 5%) between warehouse data and the dashboard.', resolution: 'Minor discrepancies are expected. Compare using the same date range. Use "conversions" (not "all_conversions") to match the UI default. Allow 72 hours for numbers to stabilize.' }
    ]
  },
  facebook_ads: {
    name: 'Facebook Ads',
    icon: 'F',
    iconClass: 'icon-facebook',
    description: 'Social advertising across Facebook, Instagram, Messenger, and Audience Network',
    whatItDoes: 'Facebook Ads (Meta) manages paid advertising across the Meta family of apps. Fivetran syncs campaign hierarchies, ad creatives, audience targeting, and performance insights.',
    usefulFor: 'Social media marketing teams, demand generation, B2C acquisition, brand awareness, cross-platform attribution',
    docsUrl: 'https://fivetran.com/docs/connectors/applications/facebook-ads',
    tables: [
      { name: 'CAMPAIGN', whatContains: 'All campaigns with name, status, objective (awareness, traffic, conversions), budget type, and spend limits', whyMatters: 'Top-level container for all ad spend — defines the marketing objective and budget allocation', keyCallouts: 'Objective field changed with ODAX rollout. Status values: ACTIVE, PAUSED, DELETED, ARCHIVED.' },
      { name: 'AD_SET', whatContains: 'Ad sets with targeting criteria, placement settings, schedule, bid strategy, and budget', whyMatters: 'Controls who sees ads, where they appear, and how much is bid — the core targeting layer', keyCallouts: 'Targeting field contains nested JSON with demographics, interests, behaviors, and custom audiences.' },
      { name: 'AD', whatContains: 'Individual ads with creative references, status, tracking specs, and UTM parameters', whyMatters: 'Links the creative asset to the targeting and budget — the actual unit being served', keyCallouts: 'Creative content is in CREATIVE table (joined via creative_id). Ad-level tracking_specs define conversion events.' },
      { name: 'AD_INSIGHTS', whatContains: 'Daily performance metrics — impressions, reach, clicks, spend, actions (conversions), cost per action, frequency', whyMatters: 'Primary reporting table for spend analysis, ROAS calculations, and campaign optimization', keyCallouts: 'Actions are nested arrays containing event types and counts. Breakdowns create separate rows. Spend is in account currency.' },
      { name: 'CREATIVE', whatContains: 'Ad creative assets — image URLs, video thumbnails, body text, headlines, call-to-action, link URLs', whyMatters: 'Enables creative performance analysis and A/B test evaluation', keyCallouts: 'Dynamic creatives have multiple assets in asset_feed_spec. Creative reuse across ads tracked via creative ID.' }
    ],
    knownIssues: [
      { category: 'Data Integrity', title: 'iOS 14+ Privacy Impact on Attribution', preview: 'Significant data gaps due to Apple App Tracking Transparency (ATT)', rootCause: 'Apple\'s iOS 14.5+ ATT framework requires user opt-in for cross-app tracking. ~75-80% of iOS users opt out. Meta cannot track conversions from opted-out users.', impact: 'Conversion counts underreported by 30-50% for iOS-heavy audiences. Attribution windows shortened. Breakdown data limited.', resolution: 'This is industry-wide, not a Fivetran issue. Use Meta\'s Conversions API (server-side) for better coverage. Compare trends over time rather than absolute numbers.' },
      { category: 'Data Integrity', title: '28-Day Attribution Window Removed', preview: 'Historical comparison breaks due to attribution window change', rootCause: 'In January 2021, Meta removed 28-day click and 28-day view attribution windows. Maximum is now 7-day click and 1-day view.', impact: 'Year-over-year comparisons spanning Jan 2021 are misleading. Current conversion counts appear 15-25% lower for same performance.', resolution: 'Document the attribution window change date. Avoid direct YoY comparisons spanning January 2021. Use 7-day click as the standard going forward.' },
      { category: 'Data Integrity', title: 'Breakdowns Cause Row Duplication', preview: 'Summing metrics across breakdown rows produces incorrect totals', rootCause: 'When AD_INSIGHTS includes breakdowns (age, gender, placement, device), each combination creates a separate row. Reach is deduplicated per breakdown but not across breakdowns.', impact: 'Summing reach across breakdown rows will overcount. Reports may show impossible numbers (reach > population).', resolution: 'Never sum reach across breakdown rows — use the non-breakdown row for total reach. Impressions, clicks, and spend are safely summable.' },
      { category: 'Data Integrity', title: 'Data Discrepancies With Ads Manager UI', preview: 'Fivetran data doesn\'t exactly match the Ads Manager dashboard', rootCause: 'Ads Manager applies real-time data, cross-campaign reach deduplication, and may use different default attribution settings than the API.', impact: 'Expect 2-10% discrepancies. Reach metrics are the most divergent.', resolution: 'Minor discrepancies are expected. Use the same attribution window and date range when comparing. Allow 48-72 hours for numbers to stabilize.' },
      { category: 'Data Integrity', title: 'API Deprecation Cycles', preview: 'Meta API version upgrades can change data structure', rootCause: 'Meta deprecates API versions roughly every 2 years and changes field names, removes metrics, or alters structures between versions.', impact: 'Schema changes can break downstream dashboards and reports.', resolution: 'Monitor Fivetran release notes for Facebook Ads connector updates. Build resilient models that handle null/missing columns.' },
      { category: 'Setup', title: 'Ad Account Access Permissions', preview: 'Connector authenticates but cannot access ad accounts', rootCause: 'The authenticating user must have at least "Advertiser" role on the ad account(s) in Business Manager. Personal Facebook access is not sufficient.', impact: 'Connector shows "Connected" but syncs no data. Tables are simply empty.', resolution: 'Verify in Business Manager: Business Settings → Ad Accounts → select account → People. Use a system user token for stable long-term access.' },
      { category: 'Errors', title: 'Token Expiration and Re-Authentication', preview: 'Sync stops working after token expires', rootCause: 'Facebook user access tokens expire after ~60 days. System user tokens can be invalidated by password changes or security events.', impact: 'Sync silently stops — data becomes stale. Can go unnoticed without monitoring.', resolution: 'Use a system user token from Business Manager. Set up Fivetran sync failure alerts. Re-authenticate when token expires: Setup → Edit connection → Re-authorize.' },
      { category: 'Syncs', title: 'Large Account Sync Duration', preview: 'Syncs take hours for accounts with thousands of campaigns', rootCause: 'Meta\'s API rate limits are aggressive for the Insights endpoint. Breakdowns multiply the number of API calls needed.', impact: 'Sync duration can exceed 6-8 hours for large accounts. Data freshness suffers.', resolution: 'Reduce enabled breakdowns. Disable historical ad sets no longer relevant. Contact Fivetran support for sync optimization on high-volume accounts.' },
      { category: 'FAQ', title: 'Why Facebook Ads Costs Differ From Other Channels', preview: 'Understanding Meta\'s unique cost and billing model', rootCause: 'Meta uses auction-based pricing. CPC can mean "cost per all clicks" (reactions, comments) or "cost per link click" depending on the field.', impact: 'Comparing Facebook CPC to Google Ads CPC is misleading without aligning definitions.', resolution: 'Use cost_per_inline_link_click for CPC comparable to Google Ads. Use cost_per_action_type for conversion-specific costs. Document metric definitions clearly.' }
    ]
  },
  postgres: {
    name: 'PostgreSQL',
    icon: 'P',
    iconClass: 'icon-postgres',
    description: 'Open-source relational database — the most popular cloud database',
    whatItDoes: 'PostgreSQL is the most widely used open-source RDBMS. Fivetran syncs selected tables and schemas using WAL (logical replication), XMIN, or direct table queries depending on setup.',
    usefulFor: 'Application database replication, product analytics, operational reporting, data warehouse loading',
    docsUrl: 'https://fivetran.com/docs/connectors/databases/postgresql',
    tables: [
      { name: 'All Selected Tables', whatContains: 'Any tables/schemas the customer selects — application data, user tables, transactional records', whyMatters: 'Database connectors sync the customer\'s own tables, not predefined schemas like SaaS connectors', keyCallouts: 'Customer chooses which schemas and tables to sync via Fivetran\'s Schema tab. Each table\'s primary key drives MAR counting.' },
      { name: 'WAL-Tracked Tables', whatContains: 'Tables synced via Write-Ahead Log (logical replication) — captures inserts, updates, and deletes in near-real-time', whyMatters: 'WAL is the most efficient sync method — minimal source impact, real-time change capture, supports deletes', keyCallouts: 'Requires wal_level = logical in PostgreSQL config. Needs a replication slot and publication. Recommended for all production setups.' },
      { name: 'XMIN Fallback Tables', whatContains: 'Tables synced using PostgreSQL\'s XMIN system column when WAL is not available', whyMatters: 'XMIN works without WAL configuration but has limitations', keyCallouts: 'XMIN cannot detect deletes — only inserts and updates. Higher source load than WAL. Used as fallback when WAL isn\'t configured.' },
      { name: 'System Catalog Tables', whatContains: 'PostgreSQL metadata — table definitions, column types, constraints, and index info', whyMatters: 'Fivetran uses these internally for schema detection. Not typically synced to the destination.', keyCallouts: 'pg_catalog and information_schema are read for metadata but not synced as data tables.' }
    ],
    knownIssues: [
      { category: 'Setup', title: 'WAL (Logical Replication) Configuration Required', preview: 'Most efficient sync requires PostgreSQL configuration changes', rootCause: 'WAL-based sync requires: wal_level = logical in postgresql.conf, a replication slot created for Fivetran, and a publication for the target tables. These require superuser access and a PostgreSQL restart.', impact: 'Without WAL, Fivetran falls back to XMIN which can\'t detect deletes and puts more load on the source.', resolution: 'For RDS: modify parameter group → set rds.logical_replication = 1 → reboot instance. For self-hosted: set wal_level = logical in postgresql.conf → restart. Create publication: CREATE PUBLICATION fivetran FOR ALL TABLES.' },
      { category: 'Setup', title: 'SSH Tunnel or VPN for Private Databases', preview: 'Database not accessible from the public internet', rootCause: 'Most production PostgreSQL instances are in private networks (VPCs). Fivetran needs network access to connect.', impact: 'Connector cannot establish connection — setup fails immediately.', resolution: 'Options: 1) SSH tunnel (Fivetran connects through a bastion host), 2) VPN/PrivateLink (Enterprise plan), 3) IP whitelisting (add Fivetran\'s IPs to security group). SSH tunnel is the most common approach for Standard plan customers.' },
      { category: 'Setup', title: 'RDS/Aurora/Cloud SQL Specific Configuration', preview: 'Managed PostgreSQL services require different setup steps', rootCause: 'AWS RDS, Aurora, and Google Cloud SQL have their own ways of enabling logical replication that differ from self-hosted PostgreSQL.', impact: 'Configuration steps in Fivetran\'s generic PostgreSQL docs may not match the managed service\'s interface.', resolution: 'AWS RDS: Use parameter groups to set rds.logical_replication = 1. Aurora: Requires cluster parameter group change. Cloud SQL: Enable cloudsql.logical_decoding flag. Each requires instance reboot.' },
      { category: 'Data Integrity', title: 'TOAST Columns May Appear Unchanged', preview: 'Large column values not captured in WAL updates', rootCause: 'PostgreSQL stores large values (text, bytea, jsonb) in TOAST tables. By default, WAL only includes TOAST values if they were actually modified in the UPDATE. Unchanged TOAST columns show as null in the WAL event.', impact: 'Rows updated without changing large text/JSON columns may show null for those columns in the destination.', resolution: 'Set REPLICA IDENTITY FULL on affected tables: ALTER TABLE tablename REPLICA IDENTITY FULL. This forces PostgreSQL to include all column values in WAL events, at the cost of slightly more WAL volume.' },
      { category: 'Data Integrity', title: 'Replication Slot Can Block WAL Cleanup', preview: 'Replication slot prevents PostgreSQL from reclaiming disk space', rootCause: 'PostgreSQL keeps WAL files until all replication slots have consumed them. If Fivetran\'s slot gets disconnected or sync is paused, WAL files accumulate.', impact: 'Disk space exhaustion on the PostgreSQL server — can cause database outage. This is the most dangerous risk with WAL-based sync.', resolution: 'Monitor replication slot lag: SELECT * FROM pg_replication_slots. Set max_slot_wal_keep_size to limit retention (Postgres 13+). Alert if slot lag exceeds a threshold. If pausing the connector, drop the replication slot first.' },
      { category: 'Data Integrity', title: 'XMIN Cannot Detect Deletes', preview: 'Deleted rows remain in destination when using XMIN sync', rootCause: 'XMIN sync method works by comparing transaction IDs to detect changes. It can see inserts and updates but has no mechanism to detect when a row is removed from the source.', impact: 'Deleted records persist in the destination as active rows. Data counts will be inflated over time.', resolution: 'Switch to WAL-based sync to capture deletes. If WAL isn\'t possible, implement soft deletes in the source application (is_deleted flag) instead of hard deletes.' },
      { category: 'Errors', title: 'Connection Refused or Timeout', preview: 'Fivetran cannot reach the PostgreSQL server', rootCause: 'Firewall rules, security groups, or network ACLs are blocking Fivetran\'s connection. Common with private databases that haven\'t whitelisted Fivetran\'s IPs.', impact: 'Complete sync failure — no data flows.', resolution: 'Add Fivetran\'s IP addresses to the database\'s security group/firewall rules. For SSH tunnel, verify the bastion host is reachable and the SSH key is correct. Check that PostgreSQL is listening on the correct port (default 5432).' },
      { category: 'Syncs', title: 'Large Initial Sync for Big Tables', preview: 'Initial sync takes days for tables with hundreds of millions of rows', rootCause: 'The initial historical sync reads the entire table. Very large tables (100M+ rows) can take days to fully sync.', impact: 'Extended initial sync period. High source database load during the sync.', resolution: 'Schedule initial sync during low-traffic periods. Consider starting with a subset of tables and adding more later. Fivetran\'s teleport sync method can speed up large initial loads.' },
      { category: 'FAQ', title: 'Which Sync Method Should I Use?', preview: 'WAL vs XMIN vs Direct — choosing the right approach', rootCause: 'WAL (logical replication) is the gold standard — real-time, low-impact, captures deletes. XMIN is simpler to set up but can\'t detect deletes. Direct table queries are the simplest but least efficient.', impact: 'Sync method choice affects data freshness, source load, delete detection, and MAR.', resolution: 'Always recommend WAL for production. Use XMIN only if WAL configuration isn\'t possible (e.g., managed instances that don\'t support logical replication). Direct queries are last resort.' }
    ]
  },
  mysql: {
    name: 'MySQL',
    icon: 'M',
    iconClass: 'icon-mysql',
    description: 'The world\'s most popular open-source relational database',
    whatItDoes: 'MySQL powers web applications, e-commerce platforms, and content management systems. Fivetran syncs selected tables using binary log (binlog) replication for real-time change capture.',
    usefulFor: 'Application database replication, e-commerce analytics, product usage tracking, operational reporting',
    docsUrl: 'https://fivetran.com/docs/connectors/databases/mysql',
    tables: [
      { name: 'All Selected Tables', whatContains: 'Customer-selected tables from any database/schema — application data, user records, transactions', whyMatters: 'MySQL connectors sync the customer\'s own data. Table selection controls scope and MAR.', keyCallouts: 'Tables must have a primary key for incremental sync. Tables without PKs require full-table re-sync each cycle.' },
      { name: 'Binlog-Tracked Tables', whatContains: 'Tables synced via MySQL binary log — captures real-time inserts, updates, and deletes', whyMatters: 'Binlog is the most efficient sync method with minimal source impact', keyCallouts: 'Requires binlog_format = ROW and binlog_row_image = FULL. GTID-based replication is recommended for reliability.' },
      { name: 'Snapshot Tables', whatContains: 'Tables synced via periodic full-table reads when binlog is unavailable', whyMatters: 'Fallback method that works without binlog configuration', keyCallouts: 'Higher source load, no delete detection, higher MAR. Avoid for large tables.' }
    ],
    knownIssues: [
      { category: 'Setup', title: 'Binlog Configuration Requirements', preview: 'Binary logging must be enabled with specific settings', rootCause: 'Fivetran\'s MySQL connector requires: binlog_format = ROW (not STATEMENT or MIXED), binlog_row_image = FULL, and binary logging enabled. These may not be the defaults.', impact: 'Without proper binlog config, Fivetran can\'t capture changes efficiently. Falls back to full-table snapshots.', resolution: 'For RDS/Aurora: modify parameter group → set binlog_format = ROW, binlog_row_image = FULL. For self-hosted: edit my.cnf. Enable GTID for more reliable replication. Requires restart.' },
      { category: 'Setup', title: 'GTID-Based Replication Recommended', preview: 'GTID provides more reliable change tracking than file+position', rootCause: 'MySQL supports two binlog tracking methods: file+position (legacy) and GTID (Global Transaction ID). GTID is more resilient to failovers and replica promotions.', impact: 'Without GTID, binlog position can be lost during failovers, requiring a re-sync. GTID survives failovers gracefully.', resolution: 'Enable GTID: gtid_mode = ON, enforce_gtid_consistency = ON. For RDS/Aurora, these are set in the parameter group. Requires instance restart.' },
      { category: 'Setup', title: 'RDS/Aurora Specific Setup', preview: 'AWS managed MySQL requires parameter group changes', rootCause: 'RDS and Aurora don\'t expose my.cnf directly. Configuration is done via parameter groups, and some settings require cluster-level changes in Aurora.', impact: 'Incorrect parameter group configuration leads to sync failures or inefficient full-table snapshots.', resolution: 'RDS: Create custom parameter group, set binlog_format=ROW, binlog_row_image=FULL, binlog_retention_hours=24. Aurora: Use cluster parameter group. Both require reboot to apply.' },
      { category: 'Data Integrity', title: 'Character Encoding Issues', preview: 'Special characters or emoji appear corrupted in destination', rootCause: 'MySQL supports multiple character encodings (latin1, utf8, utf8mb4). If the connection charset doesn\'t match the data encoding, characters are corrupted during transfer.', impact: 'Names, addresses, or text fields with international characters or emoji appear as garbled text in the warehouse.', resolution: 'Ensure the MySQL connection uses utf8mb4 encoding. Verify table-level and column-level charsets: SHOW CREATE TABLE tablename. Set character_set_server = utf8mb4 for new tables.' },
      { category: 'Data Integrity', title: 'Tables Without Primary Keys', preview: 'Tables lacking a PK require full re-sync every cycle', rootCause: 'Fivetran uses primary keys to track changes incrementally. Tables without a PK cannot be synced incrementally — they must be fully re-read each sync.', impact: 'Much higher MAR consumption and longer sync times for PK-less tables. All rows count as MAR every sync.', resolution: 'Add primary keys to tables where possible. If PKs can\'t be added, consider excluding high-volume PK-less tables or accepting the MAR impact.' },
      { category: 'Errors', title: 'Binlog Retention Too Short', preview: 'Sync fails because binlog files were purged before Fivetran read them', rootCause: 'MySQL purges old binlog files based on expire_logs_days or binlog_expire_logs_seconds. If the retention is shorter than the sync interval, Fivetran\'s position is lost.', impact: 'Requires a full re-sync of affected tables — spikes MAR and takes time.', resolution: 'Set binlog retention to at least 24 hours (recommended 72 hours). For RDS: SET CALL mysql.rds_set_configuration(\'binlog retention hours\', 24). Self-hosted: expire_logs_days = 3.' },
      { category: 'Errors', title: 'Connection Blocked by Firewall or Security Group', preview: 'Fivetran cannot reach the MySQL server', rootCause: 'MySQL server is in a private network and Fivetran\'s IPs are not whitelisted, or SSH tunnel is misconfigured.', impact: 'Complete sync failure — no data flows.', resolution: 'Whitelist Fivetran\'s IPs in the security group (port 3306). For private databases, set up an SSH tunnel through a bastion host. Verify MySQL is listening on 0.0.0.0 (not just localhost).' },
      { category: 'FAQ', title: 'Can Fivetran Sync From a Read Replica?', preview: 'Using a replica to avoid impacting the primary database', rootCause: 'Fivetran can connect to a read replica instead of the primary server. This offloads sync queries from the production database.', impact: 'Reduces load on the primary. Slight additional data latency (replication lag + sync frequency).', resolution: 'Point Fivetran at the replica\'s endpoint. Ensure binlog is enabled on the replica if using binlog-based sync. For RDS read replicas, enable backups to activate binlog.' }
    ]
  },
  mongodb: {
    name: 'MongoDB',
    icon: 'M',
    iconClass: 'icon-mongo',
    description: 'Document database for modern applications — flexible schema, JSON-like documents',
    whatItDoes: 'MongoDB stores data as JSON-like documents rather than rows. Fivetran syncs collections using change streams (oplog) and infers a relational schema from the document structure.',
    usefulFor: 'Product analytics, application data replication, semi-structured data analysis, IoT data pipelines',
    docsUrl: 'https://fivetran.com/docs/connectors/databases/mongodb',
    tables: [
      { name: 'Selected Collections', whatContains: 'Each MongoDB collection becomes a table. Document fields become columns. Nested objects are flattened or stored as JSON.', whyMatters: 'MongoDB\'s flexible schema means each document can have different fields — Fivetran infers the union schema', keyCallouts: 'Schema is inferred from sampled documents. New fields added to documents appear as new columns automatically.' },
      { name: 'Nested Document Handling', whatContains: 'Nested objects and arrays within documents — Fivetran flattens nested objects into columns using dot notation', whyMatters: 'Most MongoDB documents have deeply nested structures that need to be flattened for SQL analytics', keyCallouts: 'Arrays create child tables linked by _id. Deeply nested objects use underscore-separated column names (e.g., address_city).' },
      { name: 'Change Stream Tables', whatContains: 'Collections tracked via MongoDB change streams (oplog) — real-time insert, update, and delete capture', whyMatters: 'Change streams are the most efficient sync method with minimal impact on the MongoDB cluster', keyCallouts: 'Requires MongoDB 3.6+ with replica set or sharded cluster. Change streams don\'t work on standalone instances.' }
    ],
    knownIssues: [
      { category: 'Setup', title: 'Replica Set or Sharded Cluster Required', preview: 'Standalone MongoDB instances cannot use change streams', rootCause: 'MongoDB change streams (Fivetran\'s primary sync method) require an oplog, which is only available on replica sets or sharded clusters. Standalone instances don\'t have an oplog.', impact: 'Cannot use incremental sync on standalone instances. Must use full-collection snapshots.', resolution: 'Convert standalone to a replica set (even a single-node replica set works). For MongoDB Atlas, all clusters are automatically replica sets. Self-hosted: initialize a replica set configuration.' },
      { category: 'Setup', title: 'Atlas vs Self-Hosted Connection', preview: 'MongoDB Atlas uses different connection strings and authentication', rootCause: 'Atlas uses SRV connection strings (mongodb+srv://), requires TLS, and uses SCRAM authentication. Self-hosted may use different auth mechanisms and connection formats.', impact: 'Using the wrong connection format or auth method causes connection failures.', resolution: 'For Atlas: use the connection string from Atlas UI → Connect → Connect your application. Ensure the Fivetran IP is in Atlas\'s IP Access List. For self-hosted: use standard mongodb:// format with appropriate auth.' },
      { category: 'Data Integrity', title: 'Schema Inference From Sampled Documents', preview: 'Not all document fields may be captured initially', rootCause: 'Fivetran infers the collection schema by sampling documents. If a field only exists in rare documents, it may not be discovered during initial schema inference.', impact: 'Missing columns in the destination for infrequently used fields. These appear as new columns when eventually encountered.', resolution: 'New fields are automatically added when encountered. If critical fields are missing, ensure documents with those fields exist before the initial sync. Schema changes appear as new columns — no data loss.' },
      { category: 'Data Integrity', title: 'Nested Array Handling Creates Child Tables', preview: 'Arrays within documents become separate tables linked by _id', rootCause: 'SQL warehouses don\'t support arrays natively. Fivetran creates child tables for array fields, with each array element as a row linked to the parent document by _id.', impact: 'Document structure in the warehouse is very different from MongoDB. Queries require JOINs to reconstruct the original document structure.', resolution: 'Expect child tables for every array field. The naming pattern is parent_collection_array_field. Use _id JOINs to reconstruct documents. Build views that pre-join common combinations.' },
      { category: 'Data Integrity', title: 'Mixed Data Types in the Same Field', preview: 'A field that contains strings in some documents and numbers in others', rootCause: 'MongoDB is schema-flexible — the same field can have different types across documents. Fivetran must choose a type for the destination column, typically promoting to the widest compatible type (usually STRING).', impact: 'Fields with mixed types become STRING columns, requiring casting for numeric operations.', resolution: 'This is inherent to MongoDB\'s schema-less design. Clean up type inconsistencies in the source if possible. In the warehouse, cast columns as needed: CAST(field AS INTEGER) WHERE field ~ \'^[0-9]+$\'.' },
      { category: 'Errors', title: 'Oplog Size Too Small', preview: 'Change stream falls behind and Fivetran misses changes', rootCause: 'The MongoDB oplog has a fixed size. If the oplog fills up before Fivetran reads it (due to high write volume or infrequent syncs), the connector loses its position.', impact: 'Requires a full re-sync of affected collections. Spikes MAR.', resolution: 'Increase oplog size for high-write-volume clusters. For Atlas: oplog size is automatic but can be configured. Ensure sync frequency is high enough that the oplog doesn\'t wrap between syncs.' },
      { category: 'Syncs', title: 'Large Collection Initial Sync', preview: 'Initial sync of large collections (100M+ docs) takes days', rootCause: 'Fivetran reads the entire collection for the initial sync. Large collections with complex nested documents take significant time and compute.', impact: 'Extended initial sync period. High read load on the MongoDB cluster during sync.', resolution: 'Point Fivetran at a secondary replica to avoid impacting the primary. Schedule initial sync during low-traffic periods. Consider syncing only the most critical collections first.' },
      { category: 'FAQ', title: 'How Are Schema Changes Handled?', preview: 'What happens when document structure changes in MongoDB', rootCause: 'MongoDB allows schema changes at any time — new fields, removed fields, type changes. Fivetran automatically detects new fields and adds columns. Removed fields keep their columns but show null for new documents.', impact: 'Schema evolution is handled automatically but destination tables grow wider over time as fields are added but never removed.', resolution: 'New fields appear automatically on next sync. Removed fields persist as null-only columns. Fivetran does not drop columns. Periodically clean up unused columns in your transformation layer.' }
    ]
  },
  sql_server: {
    name: 'SQL Server',
    icon: 'S',
    iconClass: 'icon-microsoft',
    description: 'Microsoft\'s enterprise relational database — on-premises and Azure SQL',
    whatItDoes: 'SQL Server is Microsoft\'s flagship RDBMS used in enterprise environments. Fivetran syncs tables using Change Tracking (CT) or Change Data Capture (CDC) for efficient incremental updates.',
    usefulFor: 'Enterprise data warehouse loading, ERP/CRM database replication, financial system analytics, legacy modernization',
    docsUrl: 'https://fivetran.com/docs/connectors/databases/sql-server',
    tables: [
      { name: 'All Selected Tables', whatContains: 'Customer-selected tables from SQL Server databases — ERP data, financial records, HR data, application tables', whyMatters: 'Enterprise SQL Server instances often contain the most critical business data — finance, HR, operations', keyCallouts: 'Tables must have Change Tracking or CDC enabled individually. Each table\'s PK drives MAR counting.' },
      { name: 'CT-Tracked Tables', whatContains: 'Tables using SQL Server Change Tracking — lightweight change detection for inserts, updates, and deletes', whyMatters: 'CT is the recommended and simplest method for most SQL Server sync scenarios', keyCallouts: 'CT tracks which rows changed but not the old values. Requires SQL Server 2008+ and database-level CT enabled.' },
      { name: 'CDC-Tracked Tables', whatContains: 'Tables using Change Data Capture — captures full row images for every change including old and new values', whyMatters: 'CDC captures complete change history including before/after values — more detail than CT but more overhead', keyCallouts: 'CDC requires SQL Server Enterprise edition (or Azure SQL). Requires SQL Server Agent to be running. Uses more disk space than CT.' }
    ],
    knownIssues: [
      { category: 'Setup', title: 'Change Tracking (CT) Must Be Enabled', preview: 'CT requires database-level and table-level configuration', rootCause: 'CT is not enabled by default. It must be enabled at the database level (ALTER DATABASE db SET CHANGE_TRACKING = ON) and then on each individual table (ALTER TABLE t ENABLE CHANGE_TRACKING).', impact: 'Without CT, Fivetran cannot incrementally sync — must use full-table snapshots with no delete detection.', resolution: 'Enable CT: ALTER DATABASE [DBName] SET CHANGE_TRACKING = ON (CHANGE_RETENTION = 3 DAYS, AUTO_CLEANUP = ON). Then per table: ALTER TABLE [schema].[table] ENABLE CHANGE_TRACKING. Set retention to at least 3 days.' },
      { category: 'Setup', title: 'Azure SQL vs On-Premises Differences', preview: 'Azure SQL Database and Azure SQL Managed Instance have different capabilities', rootCause: 'Azure SQL Database supports CT natively but CDC requires Managed Instance or SQL Server on VM. Authentication, networking, and configuration differ between Azure offerings.', impact: 'Customers may expect CDC on Azure SQL Database when it\'s only available on Managed Instance or SQL Server VM.', resolution: 'Azure SQL Database: use CT (supported). Azure SQL Managed Instance: CT or CDC both work. SQL Server on Azure VM: full SQL Server, all methods available. Clarify which Azure SQL product the customer uses.' },
      { category: 'Setup', title: 'SQL Server Agent Must Be Running for CDC', preview: 'CDC capture and cleanup jobs require SQL Server Agent', rootCause: 'CDC uses SQL Server Agent jobs to capture changes from the transaction log and clean up old change records. If Agent is stopped, CDC stops capturing changes.', impact: 'CDC falls behind — changes are missed. When Agent restarts, the capture job may need to catch up from the transaction log.', resolution: 'Ensure SQL Server Agent is running and set to auto-start. Monitor the CDC capture and cleanup jobs. Not applicable to Azure SQL Database (CDC is managed by the service).' },
      { category: 'Data Integrity', title: 'CT Retention Period Too Short', preview: 'Changes lost because CT cleanup removed them before Fivetran read them', rootCause: 'CT auto-cleanup removes change records after the configured retention period (default: 2 days). If Fivetran doesn\'t sync within that window, changes are lost.', impact: 'Requires a full table re-sync — spikes MAR and takes time. Any changes during the gap may be missed.', resolution: 'Set CHANGE_RETENTION to at least 3 days (recommended 7 days): ALTER DATABASE [DBName] SET CHANGE_TRACKING = ON (CHANGE_RETENTION = 7 DAYS). Ensure sync frequency is well within the retention window.' },
      { category: 'Data Integrity', title: 'Schema Changes During Sync', preview: 'Adding or dropping columns while a sync is running can cause failures', rootCause: 'If a table\'s schema changes (columns added, dropped, or altered) during an active sync, the connector may encounter mismatched column counts or types.', impact: 'Current sync may fail. Subsequent sync typically recovers automatically as Fivetran detects the new schema.', resolution: 'Schedule schema changes during sync gaps when possible. If a sync fails due to schema change, it will usually self-heal on the next run. For persistent issues, trigger a manual re-sync.' },
      { category: 'Errors', title: 'Windows Authentication Not Supported', preview: 'Fivetran requires SQL Server authentication, not Windows/AD auth', rootCause: 'Fivetran connects via TCP/IP using SQL Server authentication (username/password). Windows Integrated Authentication and Active Directory auth are not supported for direct connections.', impact: 'Customers using only Windows auth must create a SQL Server login for Fivetran.', resolution: 'Create a SQL Server authentication login: CREATE LOGIN fivetran WITH PASSWORD = \'...\'. Grant the login access to target databases and tables. Ensure SQL Server allows mixed mode authentication.' },
      { category: 'Errors', title: 'Firewall Blocking Inbound Connection', preview: 'Fivetran cannot reach the SQL Server instance', rootCause: 'On-premises SQL Server is behind a firewall. Azure SQL has firewall rules that block external IPs by default.', impact: 'Complete sync failure — connection times out.', resolution: 'On-premises: whitelist Fivetran IPs in the firewall (port 1433). Use SSH tunnel or VPN for private networks. Azure SQL: add Fivetran IPs to server-level firewall rules in the Azure portal.' },
      { category: 'FAQ', title: 'CT vs CDC — Which Should I Use?', preview: 'Choosing between Change Tracking and Change Data Capture', rootCause: 'CT is lightweight, easy to set up, and works on all SQL Server editions. CDC captures full row images (before/after values) but requires Enterprise edition and SQL Server Agent.', impact: 'CT is sufficient for most analytics use cases. CDC is needed when you need historical change tracking with old/new values.', resolution: 'Default to CT — it\'s simpler and works everywhere. Use CDC only if the customer specifically needs before/after values for audit trails or SCD Type 2 tracking. Azure SQL Database: CT only (unless Managed Instance).' }
    ]
  },
  linkedin_ads: {
    name: 'LinkedIn Ads',
    icon: 'L',
    iconClass: 'icon-linkedin',
    description: 'B2B advertising platform for targeting professionals by job title, company, and industry',
    whatItDoes: 'LinkedIn Ads enables B2B companies to reach decision-makers through sponsored content, message ads, and dynamic ads. Fivetran syncs campaign structures, creative assets, and performance analytics.',
    usefulFor: 'B2B demand generation, account-based marketing (ABM), recruiting campaigns, brand awareness for professional audiences',
    docsUrl: 'https://fivetran.com/docs/connectors/applications/linkedin-ads',
    tables: [
      { name: 'CAMPAIGN', whatContains: 'All campaigns with name, status, type (sponsored content, message, dynamic), objective, and schedule', whyMatters: 'Core unit for B2B ad spend tracking and performance analysis', keyCallouts: 'Campaign types differ significantly in available metrics. Sponsored Content has the richest reporting.' },
      { name: 'CAMPAIGN_GROUP', whatContains: 'Campaign groups (portfolios) with name, status, budget, and schedule', whyMatters: 'Groups organize campaigns — useful for reporting by initiative, product line, or region', keyCallouts: 'Budget can be set at group or campaign level. Group-level budgets cap total spend across member campaigns.' },
      { name: 'CREATIVE', whatContains: 'Ad creative assets — sponsored content posts, message ad content, carousel cards, and video ads', whyMatters: 'Enables A/B testing analysis and creative performance benchmarking', keyCallouts: 'Creatives link to LinkedIn organic posts for Sponsored Content. Video creatives have separate video analytics.' },
      { name: 'AD_ANALYTICS_BY_CAMPAIGN', whatContains: 'Daily performance metrics per campaign — impressions, clicks, spend, conversions, engagement rate, leads', whyMatters: 'Primary reporting table for LinkedIn Ads ROI analysis', keyCallouts: 'Conversion data depends on LinkedIn Insight Tag installation. Lead Gen Form conversions are tracked separately from website conversions.' },
      { name: 'ACCOUNT', whatContains: 'Ad account details — account name, ID, currency, status, and associated LinkedIn Page', whyMatters: 'Top-level entity for multi-account management and billing', keyCallouts: 'Each ad account maps to one LinkedIn Company Page. Multiple ad accounts can be managed from one Campaign Manager.' }
    ],
    knownIssues: [
      { category: 'Data Integrity', title: 'Conversion Data Latency (Up to 12 Hours)', preview: 'Conversion metrics are delayed compared to impression/click data', rootCause: 'LinkedIn\'s conversion tracking has inherent delays. The Insight Tag fires client-side and LinkedIn processes conversions asynchronously. Conversion windows (7-day click, 30-day view) mean late-arriving conversions are attributed retroactively.', impact: 'Real-time dashboards show incomplete conversion data. CPA and ROAS metrics stabilize slowly.', resolution: 'Wait at least 24-48 hours before treating conversion data as complete. Design dashboards with "data as of" disclaimers. Use 7-day rolling averages for more stable performance metrics.' },
      { category: 'Data Integrity', title: 'LinkedIn Insight Tag Requirements for Conversions', preview: 'Website conversion tracking requires the LinkedIn Insight Tag', rootCause: 'LinkedIn website conversions (page visits, form fills, purchases) require the LinkedIn Insight Tag JavaScript snippet installed on the customer\'s website. Without it, only in-platform events (Lead Gen Form fills, video views) are tracked.', impact: 'Missing website conversion data makes it impossible to calculate true ROAS for campaigns driving website actions.', resolution: 'Verify Insight Tag installation before expecting conversion data. Use LinkedIn\'s Tag Validation tool in Campaign Manager. Lead Gen Form campaigns work without the tag since conversions happen on LinkedIn.' },
      { category: 'Data Integrity', title: 'Cost Data Discrepancies With Campaign Manager', preview: 'Slight differences between Fivetran data and LinkedIn Campaign Manager UI', rootCause: 'LinkedIn Campaign Manager shows real-time spend data. The API data that Fivetran syncs may lag behind and uses a different aggregation method.', impact: 'Small discrepancies (2-5%) between warehouse and Campaign Manager, especially for current-day data.', resolution: 'Allow 48 hours for spend data to finalize. Use completed date ranges for billing reconciliation. Minor discrepancies are expected and industry-standard for ad platform APIs.' },
      { category: 'Setup', title: 'Account-Level vs Campaign-Level Permissions', preview: 'Authenticating user needs correct permissions in Campaign Manager', rootCause: 'The OAuth authenticating user must have at least "Viewer" access at the ad account level in LinkedIn Campaign Manager. Organization-level page access is not sufficient.', impact: 'Connector authenticates successfully but syncs no data if the user lacks ad account permissions.', resolution: 'In Campaign Manager: Account Assets → Matched Audiences isn\'t enough — the user needs ad account role. Admin, Campaign Manager, or Viewer role on the specific ad account(s). Re-authorize after granting access.' },
      { category: 'Errors', title: 'API Rate Limits During Large Syncs', preview: 'LinkedIn API throttling causes slow or failed syncs', rootCause: 'LinkedIn\'s Marketing API has strict rate limits (varies by app and endpoint). Accounts with many campaigns or long history can exhaust limits.', impact: 'Sync takes much longer than expected or fails partway through.', resolution: 'Reduce sync frequency for large accounts. Fivetran handles rate limiting with automatic retries. Contact Fivetran support for optimization on high-volume accounts.' },
      { category: 'FAQ', title: 'Lead Gen Form Data Availability', preview: 'Can Fivetran sync Lead Gen Form submissions?', rootCause: 'LinkedIn Lead Gen Forms collect lead data within the LinkedIn platform. Lead data is available via the API but may be in separate tables from campaign analytics.', impact: 'Sales teams need lead form data synced to CRM for follow-up. Without it, leads are only visible in Campaign Manager for 90 days.', resolution: 'Ensure Lead Gen Form tables are enabled in Fivetran. Note: LinkedIn only retains lead data for 90 days — set up the connector before the retention window expires. Consider also syncing leads directly to CRM via LinkedIn\'s native integrations.' },
      { category: 'Syncs', title: 'Historical Data Limited to Account Lifetime', preview: 'Cannot sync data from before the ad account was created', rootCause: 'LinkedIn\'s API provides data only from the account creation date. No archive API exists for older data.', impact: 'New ad accounts will have limited history. Accounts restructured or recreated lose historical continuity.', resolution: 'Set expectations about historical depth based on account age. If transitioning to a new ad account, keep the old account active for historical reporting access.' }
    ]
  },
  google_analytics_4: {
    name: 'Google Analytics 4',
    icon: 'G',
    iconClass: 'icon-google',
    description: 'Web and app analytics platform — event-based tracking for user behavior',
    whatItDoes: 'GA4 tracks user behavior across websites and apps using event-based measurement. Fivetran syncs configured reports with dimensions and metrics for deeper analysis in the warehouse.',
    usefulFor: 'Marketing analytics, website performance, user behavior analysis, conversion funnel optimization, product analytics',
    docsUrl: 'https://fivetran.com/docs/connectors/applications/google-analytics-4',
    tables: [
      { name: 'Configured Report Tables', whatContains: 'Custom report tables defined during setup — each report specifies dimensions (page, source, device) and metrics (sessions, users, events)', whyMatters: 'GA4 connector is report-based — you define what data to sync by configuring reports with specific dimension/metric combinations', keyCallouts: 'Unlike GA Universal, GA4 doesn\'t have predefined tables. You choose dimensions and metrics per report. Each report becomes a table.' },
      { name: 'Page Report (typical)', whatContains: 'Page-level metrics — page path, page title, sessions, users, engaged sessions, bounce rate, avg engagement time', whyMatters: 'Shows which pages drive traffic and engagement — fundamental for content and UX analysis', keyCallouts: 'Page path dimension can be high cardinality. Use page_path for URL-level analysis, page_title for content-level grouping.' },
      { name: 'Traffic Source Report (typical)', whatContains: 'Acquisition data — source, medium, campaign, sessions, new users, conversions by channel', whyMatters: 'Answers "where do users come from?" — essential for marketing attribution', keyCallouts: 'UTM parameters drive source/medium/campaign values. Cross-channel attribution in GA4 uses data-driven or last-click models.' },
      { name: 'Event Report (typical)', whatContains: 'Event-level data — event name, event count, users, event parameters', whyMatters: 'GA4 is event-based — everything is an event (page_view, scroll, click, purchase). Custom events track business-specific actions.', keyCallouts: 'Custom events and parameters must be created in GA4 before they appear in reports. Event parameter cardinality limits apply.' }
    ],
    knownIssues: [
      { category: 'Data Integrity', title: 'Data Sampling at High Volumes', preview: 'GA4 API may return sampled (estimated) data for large date ranges or properties', rootCause: 'GA4\'s Data API applies sampling when queries span large date ranges or high-traffic properties. Sampled data is an estimate, not exact counts. The API response includes a samplingMetadatas field indicating sampling ratio.', impact: 'Metrics may be approximate rather than exact. Discrepancies between GA4 UI and warehouse data can be significant (10-20%) for sampled queries.', resolution: 'Reduce report date ranges to minimize sampling. Use the "Unsampled" exports (BigQuery export) for exact data if available. Check sampling ratio in sync logs. For high-traffic sites, consider GA4 BigQuery linking as an alternative for raw event data.' },
      { category: 'Data Integrity', title: 'Data Thresholding for Small Audiences', preview: 'Rows removed from results when they represent too few users', rootCause: 'GA4 applies data thresholding to protect user privacy. When a dimension combination represents very few users, GA4 may withhold that row entirely from API results.', impact: 'Dimension breakdowns may not sum to the total. Low-traffic pages, campaigns, or segments may be invisible in warehouse data.', resolution: 'This is a GA4 privacy feature, not a Fivetran issue. Aggregate dimensions at a higher level to reduce thresholding. Use broader date ranges to increase user counts per dimension. Consider disabling Google Signals (which triggers more aggressive thresholding).' },
      { category: 'Data Integrity', title: 'Real-Time Data Not Available', preview: 'GA4 connector syncs processed data, not real-time', rootCause: 'The GA4 Data API returns processed data that is typically 24-48 hours behind real-time. Real-time data is only available in the GA4 UI.', impact: 'Warehouse data is at least a day behind. Stakeholders expecting same-day data will see yesterday\'s numbers at best.', resolution: 'Set expectations that GA4 warehouse data has 24-48 hour latency. Use the GA4 UI for real-time monitoring. For near-real-time needs, consider GA4 BigQuery streaming export (separate product).' },
      { category: 'Setup', title: 'Report Configuration Complexity', preview: 'GA4 connector requires manual report configuration during setup', rootCause: 'Unlike other connectors with predefined schemas, the GA4 connector requires you to define which reports (dimension + metric combinations) to sync. Incompatible dimension/metric combinations are rejected by the API.', impact: 'Setup takes longer than other connectors. Incorrect report configuration leads to empty tables or sync errors.', resolution: 'Use GA4\'s Dimensions & Metrics Explorer to verify compatible combinations before configuring in Fivetran. Start with common reports (pages, traffic sources, events) and add more as needed. Fivetran validates combinations during setup.' },
      { category: 'Setup', title: 'Property vs View Distinction', preview: 'GA4 properties replace Universal Analytics views', rootCause: 'GA4 uses properties (not views). Each property has a unique property ID. Data streams (web, iOS, Android) feed into properties. There\'s no equivalent to UA views with filtered data.', impact: 'Customers migrating from Universal Analytics may look for "views" in GA4 setup. GA4 has one property with multiple data streams.', resolution: 'Use the GA4 property ID (not a view ID) when setting up the Fivetran connector. Data stream filtering happens in GA4, not Fivetran. Each GA4 property requires a separate Fivetran connector.' },
      { category: 'Data Integrity', title: 'Custom Dimensions and Metrics Configuration', preview: 'Custom event parameters must be registered in GA4 before they appear in reports', rootCause: 'GA4 requires custom dimensions and metrics to be explicitly registered under Admin → Custom definitions before they\'re available in the Data API. Simply sending events with custom parameters isn\'t enough.', impact: 'Custom event data appears to be missing even though events are firing correctly. The data exists in GA4 but isn\'t available through the API.', resolution: 'Register all custom dimensions/metrics in GA4 Admin → Custom definitions. After registration, it takes 24-48 hours for data to become available in the API. Include registered custom dimensions in your Fivetran report configuration.' },
      { category: 'FAQ', title: 'GA4 BigQuery Export vs Fivetran GA4 Connector', preview: 'When to use native BigQuery linking vs Fivetran', rootCause: 'GA4 offers free native BigQuery export that sends raw event data directly to BigQuery. Fivetran\'s GA4 connector syncs report-level aggregated data to any destination.', impact: 'Different use cases: BigQuery export gives raw events (very granular, high volume). Fivetran gives aggregated reports (lower volume, any destination).', resolution: 'Use BigQuery export for raw event-level analysis, user-level path analysis, or ML training data. Use Fivetran for aggregated reporting metrics synced to Snowflake, Redshift, or other non-BigQuery destinations. Many teams use both.' },
      { category: 'Syncs', title: 'Retroactive Data Processing Delays', preview: 'GA4 reprocesses data for up to 72 hours after collection', rootCause: 'GA4 applies late-arriving hits, spam filtering, and data corrections for up to 72 hours after the original data collection date. Numbers for recent dates may shift.', impact: 'Reports for the last 3 days will show different numbers each time they\'re queried. Historical comparisons using very recent data are unreliable.', resolution: 'Treat data as final only after 72 hours. Design dashboards to show "data finalized as of [date - 3 days]." Fivetran re-syncs recent data to capture these corrections.' }
    ]
  },
  marketo: {
    name: 'Marketo',
    icon: 'M',
    iconClass: 'icon-default',
    description: 'Enterprise marketing automation platform for B2B lead management and campaigns',
    whatItDoes: 'Marketo (Adobe) manages B2B marketing campaigns, lead scoring, email marketing, and nurture programs. Fivetran syncs lead records, activity logs, program data, and campaign performance.',
    usefulFor: 'B2B marketing teams, demand generation, lead scoring and routing, marketing attribution, sales-marketing alignment',
    docsUrl: 'https://fivetran.com/docs/connectors/applications/marketo',
    tables: [
      { name: 'LEADS', whatContains: 'All lead/person records with email, company, title, score, lifecycle stage, UTM fields, and custom fields', whyMatters: 'The core marketing database — every contact, lead, and prospect lives here', keyCallouts: 'Marketo leads are equivalent to "people" in the database. Lead score fields drive MQL/SQL handoff. Custom fields vary widely by implementation.' },
      { name: 'ACTIVITIES', whatContains: 'Activity log — email opens, clicks, form fills, web page visits, scoring changes, lead status changes', whyMatters: 'Complete audit trail of every marketing touchpoint for attribution analysis', keyCallouts: 'This table can be MASSIVE — every action by every lead generates a row. #1 MAR driver for Marketo. Activity types identified by activityTypeId.' },
      { name: 'PROGRAMS', whatContains: 'Marketing programs — webinars, email campaigns, events, nurture streams, and their statuses', whyMatters: 'Programs are how marketers organize campaigns. Links back to leads via program membership.', keyCallouts: 'Program types: Email, Event, Engagement (nurture), Default. Costs tracked at program level for ROI.' },
      { name: 'CAMPAIGNS', whatContains: 'Smart campaigns and batch campaigns with trigger rules, flow actions, and schedule', whyMatters: 'The automation engine — shows what actions Marketo is taking on leads and when', keyCallouts: 'Smart campaigns can be triggered (real-time) or batch (scheduled). Flow steps define actions: send email, change score, sync to CRM.' },
      { name: 'LISTS', whatContains: 'Static lists and smart lists used for segmentation and targeting', whyMatters: 'How marketers segment their database for targeted campaigns', keyCallouts: 'Static lists are manually managed. Smart lists are rule-based and dynamic. List membership links to leads via LEAD_LIST_MEMBERSHIP.' }
    ],
    knownIssues: [
      { category: 'Data Integrity', title: 'Activity Volume and MAR Impact', preview: 'ACTIVITIES table is the biggest MAR driver — can be massive', rootCause: 'Every lead action (email open, web visit, form fill, score change) creates an activity row. A database of 100k leads with moderate engagement can generate millions of activity rows per month.', impact: 'ACTIVITIES table often accounts for 80%+ of total MAR. Customers are surprised by MAR consumption from this single table.', resolution: 'Set expectations during deal sizing: ask about database size and engagement volume. Consider filtering activity types to only sync high-value activities (form fills, MQL changes) vs. low-value (email opens). Or use Fivetran\'s table-level controls to limit activity syncing.' },
      { category: 'Data Integrity', title: 'Custom Object Syncing Requires Configuration', preview: 'Marketo custom objects don\'t sync automatically', rootCause: 'Marketo supports custom objects (like custom CRM objects within Marketo). These must be explicitly configured in the Fivetran connector — they\'re not auto-discovered.', impact: 'Business-critical custom data may be missing from the warehouse without anyone realizing.', resolution: 'Ask about custom objects during discovery. Add custom objects to the Fivetran connector configuration. Ensure the API user has permissions to access custom object types.' },
      { category: 'Setup', title: 'REST API vs Bulk API Modes', preview: 'Fivetran uses different API modes for different data types', rootCause: 'Fivetran uses the Marketo Bulk API for lead and activity exports (more efficient for large volumes) and the REST API for smaller reference tables (programs, campaigns). Bulk API has daily extraction limits.', impact: 'If Bulk API daily limits are exceeded, lead and activity syncs queue until the next day. Reference table syncs continue normally.', resolution: 'Monitor Bulk API daily usage in Marketo Admin → Integration → Web Services. Marketo limits are typically 500MB/day for Bulk Extract. If consistently hitting limits, contact Marketo to increase allocation or reduce sync scope.' },
      { category: 'Setup', title: 'API User and Role Configuration', preview: 'Connector needs a dedicated API-only user with specific permissions', rootCause: 'Marketo requires an API-only user (created in Admin → Users & Roles) with a role that has "Read-Only Lead," "Read-Only Activity," and other API permissions. A standard user login won\'t work.', impact: 'Incorrect user setup causes authentication failures or permission errors on specific endpoints.', resolution: 'Create a dedicated API-only user in Marketo: Admin → Users & Roles → New User → API Only. Create a custom role with: Access API, Read-Only Lead, Read-Only Activity, Read-Only Assets, Read-Only Custom Object. Assign this role to the API user.' },
      { category: 'Errors', title: 'Bulk API Daily Extraction Limit Exceeded', preview: 'Lead or activity sync pauses until daily limit resets', rootCause: 'Marketo imposes a daily Bulk Extract limit (typically 500MB). Large databases or high-activity volumes can exhaust this limit, especially during initial sync.', impact: 'Lead and activity syncs pause until midnight PT when the limit resets. Data freshness suffers.', resolution: 'Initial sync may take several days as it works through the daily limit. For ongoing syncs, ensure daily volume fits within the limit. Contact Marketo support to increase the allocation if needed.' },
      { category: 'Data Integrity', title: 'Lead Deduplication Complexity', preview: 'Duplicate leads in Marketo create duplicate records in warehouse', rootCause: 'Marketo allows duplicate leads (same email, different lead IDs). Deduplication depends on Marketo\'s merge rules or manual intervention. Fivetran syncs all leads including duplicates.', impact: 'Marketing metrics (lead counts, program membership, conversion rates) may be inflated by duplicates.', resolution: 'Use Marketo\'s built-in deduplication (Admin → Database Management) before syncing. In the warehouse, deduplicate on email or use Marketo\'s merge audit log. Build dedup logic in your dbt models.' },
      { category: 'FAQ', title: 'Munchkin Tracking vs Activity Data', preview: 'Web activity depends on Munchkin JavaScript tracker', rootCause: 'Marketo tracks web page visits via the Munchkin tracking code (JavaScript) installed on the customer\'s website. Without Munchkin, web visit activities won\'t appear in the ACTIVITIES table.', impact: 'Missing web behavior data limits lead scoring accuracy and attribution analysis.', resolution: 'Verify Munchkin is installed on all relevant web pages. Web visit activities appear as activityTypeId = 1 (Visit Web Page) in the ACTIVITIES table. Munchkin tracking is separate from Marketo forms — both need to be present.' }
    ]
  },
  zendesk: {
    name: 'Zendesk',
    icon: 'Z',
    iconClass: 'icon-default',
    description: 'Customer service and support platform — ticketing, help desk, and CX analytics',
    whatItDoes: 'Zendesk manages customer support tickets, agent workflows, and customer satisfaction. Fivetran syncs tickets, users, organizations, comments, and satisfaction ratings for support analytics.',
    usefulFor: 'Customer support analytics, SLA monitoring, agent productivity, CSAT/NPS tracking, customer health scoring',
    docsUrl: 'https://fivetran.com/docs/connectors/applications/zendesk',
    tables: [
      { name: 'TICKET', whatContains: 'All support tickets with subject, status, priority, assignee, requester, tags, custom fields, and timestamps', whyMatters: 'The core table for all support analytics — resolution time, volume trends, category analysis', keyCallouts: 'Status values: new, open, pending, hold, solved, closed. Custom fields are stored as additional columns. Tags enable flexible categorization.' },
      { name: 'USER', whatContains: 'All users — end-users (customers), agents, and admins with name, email, role, organization, and custom fields', whyMatters: 'Links tickets to people — enables customer-level and agent-level analysis', keyCallouts: 'Role field distinguishes end-user, agent, and admin. Agents have additional fields like group membership and availability.' },
      { name: 'ORGANIZATION', whatContains: 'Customer organizations with name, domain, tags, group, and custom fields', whyMatters: 'Account-level support analytics — ticket volume, CSAT, and SLA compliance per customer organization', keyCallouts: 'Organizations link to users (many users per org). Shared organizations allow cross-org ticket access.' },
      { name: 'TICKET_COMMENT', whatContains: 'All comments/replies on tickets — body text, author, public/internal flag, attachments, timestamps', whyMatters: 'The conversation history — enables response time analysis and quality review', keyCallouts: 'public flag distinguishes customer-facing replies from internal agent notes. body contains the full text. Can be very high volume.' },
      { name: 'SATISFACTION_RATING', whatContains: 'CSAT survey responses — score (good/bad), comment, ticket reference, and timestamp', whyMatters: 'Direct customer feedback on support interactions — the key CX metric', keyCallouts: 'Not all tickets generate a rating — only solved tickets with surveys enabled. Response rate is typically 10-30%.' }
    ],
    knownIssues: [
      { category: 'Setup', title: 'Admin Permissions Required for Incremental Export API', preview: 'Connector needs admin-level access for efficient syncing', rootCause: 'Fivetran uses Zendesk\'s Incremental Export API for efficient syncing. This API requires Admin role or a user with Admin-level API access. Regular agent tokens have limited access.', impact: 'Without admin access, the connector may fall back to less efficient APIs or miss certain data types entirely.', resolution: 'Create a dedicated Zendesk admin user for Fivetran, or use an admin\'s API token. In Zendesk Admin Center: People → Add User → Role: Admin. Generate an API token under Zendesk Admin Center → Apps and Integrations → APIs.' },
      { category: 'Setup', title: 'API Token vs OAuth Authentication', preview: 'Choosing between API token and OAuth for connector setup', rootCause: 'Fivetran supports both API token (email/token pair) and OAuth authentication. API tokens are simpler but tied to a specific user. OAuth uses the Fivetran app.', impact: 'API tokens are invalidated if the associated user is deactivated or their email changes. OAuth is more resilient.', resolution: 'Recommend API token for simplicity. Use a service account email (not a person\'s email) to avoid disruption when employees leave. OAuth is better for organizations with strict token management policies.' },
      { category: 'Data Integrity', title: 'Ticket Comment Volume Impact on MAR', preview: 'TICKET_COMMENT table can be very large and drive MAR', rootCause: 'Every reply, internal note, and system event on a ticket creates a comment record. High-volume support teams with 10+ comments per ticket accumulate millions of comment rows.', impact: 'TICKET_COMMENT is often the largest table and biggest MAR contributor. Can be 10-50x the size of the TICKET table.', resolution: 'Set expectations about comment volume during deal sizing. If MAR is a concern, consider disabling TICKET_COMMENT or using Fivetran\'s column-level controls to exclude the body field (which has the most storage impact).' },
      { category: 'Data Integrity', title: 'Custom Fields Handling', preview: 'Custom ticket, user, and organization fields require understanding', rootCause: 'Zendesk custom fields appear as additional columns on their respective tables. Field names are based on the field ID (custom_field_<id>), not the display label. Drop-down custom fields store the tag value, not the display value.', impact: 'Column names are opaque (custom_field_12345). Analysts need a mapping between field IDs and human-readable names.', resolution: 'Use the TICKET_FIELD table (or CUSTOM_FIELD_OPTION) to map field IDs to labels. Build a dimension table in your warehouse that maps custom_field_<id> to meaningful names. For dropdown fields, join with the options to get display values.' },
      { category: 'Data Integrity', title: 'Suspended and Deleted Ticket Data', preview: 'Suspended tickets and deleted data may not sync as expected', rootCause: 'Suspended tickets (caught by spam filters) are in a separate queue and may not appear in the main TICKET table. Hard-deleted tickets are removed from the API entirely.', impact: 'Support volume metrics may undercount if suspended tickets are significant. Deleted ticket history is lost.', resolution: 'Enable SUSPENDED_TICKET table if spam-filtered tickets are relevant. For deleted tickets, Fivetran marks them with _fivetran_deleted. Recommend using "soft delete" (closed status) in Zendesk rather than hard deletes to preserve data.' },
      { category: 'Syncs', title: 'Large Zendesk Instances — Initial Sync Duration', preview: 'Initial sync of large support operations can take days', rootCause: 'Zendesk instances with millions of tickets and tens of millions of comments can take 3-7 days for the initial sync, depending on API rate limits and data volume.', impact: 'Extended initial sync period. Incremental syncs are fast once the initial load completes.', resolution: 'Set expectations for initial sync duration based on ticket volume. Start with core tables (TICKET, USER, ORGANIZATION) and add TICKET_COMMENT later if needed. Incremental syncs after initial load are typically minutes.' },
      { category: 'FAQ', title: 'Zendesk Support vs Zendesk Sunshine', preview: 'Different Zendesk products have different connectors', rootCause: 'Zendesk Support (ticketing) and Zendesk Sunshine (custom objects platform) are different products. The Fivetran Zendesk connector covers Support. Sunshine custom objects may require separate configuration.', impact: 'Customers using Zendesk Sunshine for custom CRM-like data won\'t see that data in the standard Zendesk connector.', resolution: 'Ask if the customer uses Zendesk Sunshine in addition to Support. Sunshine custom objects may need a separate connector or custom API integration. The standard connector covers: Tickets, Users, Organizations, Groups, and related Support entities.' },
      { category: 'Errors', title: 'API Rate Limiting on High-Volume Instances', preview: '429 errors causing sync delays', rootCause: 'Zendesk enforces API rate limits based on plan tier: Essential (10 rpm), Team (200 rpm), Professional (400 rpm), Enterprise (700 rpm). The Incremental Export API has additional limits.', impact: 'Lower-tier plans experience significantly slower syncs. Large instances on Essential or Team plans may time out.', resolution: 'Check the customer\'s Zendesk plan tier — rate limits vary dramatically. Professional or Enterprise is recommended for Fivetran syncing. If on a lower tier, reduce sync frequency or contact Zendesk about rate limit increases.' }
    ]
  },
  jira: {
    name: 'Jira',
    icon: 'J',
    iconClass: 'icon-default',
    description: 'Project tracking and issue management for software teams — the backbone of engineering workflows',
    whatItDoes: 'Jira by Atlassian tracks issues, bugs, stories, and epics across software development teams. Fivetran syncs issues, projects, sprints, boards, and users to enable engineering analytics and DevOps reporting.',
    usefulFor: 'Engineering analytics, sprint velocity tracking, issue resolution time, DevOps metrics, product development insights',
    docsUrl: 'https://fivetran.com/docs/connectors/applications/jira',
    tables: [
      { name: 'ISSUE', whatContains: 'All Jira issues — bugs, stories, tasks, epics — with summary, status, priority, assignee, reporter, labels, components, fix versions, and custom fields', whyMatters: 'The central table for all engineering analytics — velocity, throughput, cycle time, bug rates, and workload distribution', keyCallouts: 'Issue types (Bug, Story, Task, Epic, Sub-task) are configurable per project. Custom fields appear as columns with customfield_XXXXX naming. Status categories (To Do, In Progress, Done) are more reliable than individual status names for cross-project analysis.' },
      { name: 'PROJECT', whatContains: 'All Jira projects with key, name, lead, project type (software, service desk, business), and category', whyMatters: 'Groups issues by team or product — enables cross-project comparison and portfolio-level reporting', keyCallouts: 'Project keys (e.g., ENG, PLAT) prefix all issue keys. Project type determines available features (Scrum vs Kanban vs Service Desk). Archived projects may still sync.' },
      { name: 'SPRINT', whatContains: 'Sprint records with name, state (future, active, closed), start date, end date, complete date, and board reference', whyMatters: 'Essential for velocity tracking, sprint burndown, and capacity planning across teams', keyCallouts: 'State values: future, active, closed. A sprint can span multiple boards if shared. Complete date vs end date shows if sprints finished early or late. Only available for Scrum boards.' },
      { name: 'BOARD', whatContains: 'Agile boards — Scrum and Kanban — with name, type, and associated project or filter', whyMatters: 'Links sprints and issues to team workflows — useful for understanding team structure', keyCallouts: 'Board types: scrum (has sprints) or kanban (continuous flow). A board can pull issues from multiple projects via JQL filters. Board configuration affects which issues appear.' },
      { name: 'USER', whatContains: 'All Jira users with display name, email, account ID, active status, and timezone', whyMatters: 'Links issues to people — enables assignee-level productivity and workload analysis', keyCallouts: 'Jira Cloud uses accountId (opaque string) as the primary identifier, not username. Deactivated users remain in historical data. Email may be hidden depending on Atlassian privacy settings.' }
    ],
    knownIssues: [
      { category: 'Data Integrity', title: 'Custom Fields Use Opaque Column Names', preview: 'Custom fields sync as customfield_XXXXX — not human-readable', rootCause: 'Jira stores custom fields with numeric IDs (e.g., customfield_10042). Fivetran syncs these as-is, resulting in column names like CUSTOMFIELD_10042 instead of "Story Points" or "Sprint Goal."', impact: 'Analysts can\'t tell what custom field columns mean without a mapping. Every Jira instance has different custom field IDs for the same concepts.', resolution: 'Use the FIELD table to map custom field IDs to display names. Build a reference view in your warehouse: SELECT id, name FROM field WHERE custom = true. Common fields to map: Story Points, Epic Link, Sprint, Team.' },
      { category: 'Setup', title: 'JQL-Based Filtering Configuration', preview: 'Connector can use JQL to limit which issues sync — but it has limits', rootCause: 'Fivetran supports JQL (Jira Query Language) filters to limit the scope of synced issues. However, JQL complexity and performance vary. Very broad JQL filters may not significantly reduce sync volume.', impact: 'Without filtering, all issues across all projects sync — which may include irrelevant projects (HR, facilities) and inflate MAR unnecessarily.', resolution: 'Configure JQL filters during setup to scope to relevant projects: "project in (ENG, PLAT, DATA)". Avoid time-based JQL filters as they interact poorly with incremental sync. Test the JQL in Jira\'s issue search first to verify result count.' },
      { category: 'FAQ', title: 'Jira Cloud vs Server/Data Center Differences', preview: 'The connector supports Jira Cloud — Server and Data Center require different setup', rootCause: 'Fivetran\'s Jira connector is designed for Jira Cloud (Atlassian-hosted). Jira Server (self-hosted, end-of-life Feb 2024) and Jira Data Center (self-hosted, enterprise) require different authentication and network configuration.', impact: 'Customers on Server or Data Center may need additional setup (SSH tunnel, VPN, or Hybrid Deployment Agent). API differences between Cloud and Server can affect available data.', resolution: 'Ask which Jira deployment the customer uses. Cloud: straightforward OAuth setup. Data Center: needs network access (SSH tunnel or Hybrid Agent) plus API token authentication. Server: end-of-life — recommend migration to Cloud.' },
      { category: 'Data Integrity', title: 'Agile Board Data Limitations', preview: 'Board configuration and column mappings have limited sync coverage', rootCause: 'Jira boards are views on top of issues, configured with column mappings, swimlanes, and quick filters. Fivetran syncs board metadata but not all board configuration details like column-to-status mappings or swimlane rules.', impact: 'Replicating the exact board view in a BI tool requires manual mapping of statuses to columns. Board-level metrics (WIP limits, swimlane groupings) aren\'t directly available.', resolution: 'Use the BOARD table for board metadata and the STATUS_CATEGORY table to approximate column mappings. For accurate Kanban metrics, map statuses to workflow stages in your dbt models. Most teams define: Backlog, In Progress, In Review, Done.' },
      { category: 'Syncs', title: 'Webhook vs Polling Sync Modes', preview: 'Connector can use webhooks for near-real-time updates or polling for scheduled syncs', rootCause: 'Fivetran supports both webhook-triggered syncs (Jira pushes changes) and polling-based syncs (Fivetran pulls on a schedule). Webhook setup requires admin access in Jira to configure the outbound webhook URL.', impact: 'Polling mode means data freshness depends on sync frequency (15 min on Standard). Webhook mode delivers near-real-time updates but requires additional setup and Jira admin permissions.', resolution: 'For most use cases, polling at 15-minute intervals is sufficient. If near-real-time is needed (e.g., live dashboards), configure webhooks in Jira: Settings → System → WebHooks → Create. Point to the Fivetran webhook URL from the connector setup page.' },
      { category: 'Syncs', title: 'Large Instance Initial Sync Duration', preview: 'Jira instances with years of history can take days to initial sync', rootCause: 'Enterprise Jira instances accumulate hundreds of thousands of issues over years. Each issue has changelog entries, comments, worklogs, and attachments metadata. The initial sync must paginate through the entire REST API.', impact: 'Initial sync for a 500k+ issue instance can take 3-5 days. Incremental syncs after initial load are fast (minutes).', resolution: 'Set expectations based on issue count (check in Jira: Filters → search "order by created" to see total). Use JQL filtering to exclude old or irrelevant projects if possible. Consider starting with a recent time frame if historical data isn\'t critical.' },
      { category: 'Data Integrity', title: 'Issue Changelog and History Tracking', preview: 'Change history is available but can be complex and high-volume', rootCause: 'Jira tracks every field change on an issue in the changelog (status transitions, assignee changes, priority updates). Fivetran syncs this as the ISSUE_FIELD_HISTORY table with from/to values and timestamps.', impact: 'The changelog table can be 10-50x larger than the issue table. It\'s essential for cycle time analysis but is a significant MAR driver.', resolution: 'ISSUE_FIELD_HISTORY is the key table for cycle time and lead time metrics. Filter to relevant fields (status, assignee, priority) in your analytics layer. If MAR is a concern, evaluate whether full changelog history is needed or if current-state analysis is sufficient.' },
      { category: 'Data Integrity', title: 'Attachments and Rich Content Not Synced', preview: 'File attachments and embedded images are not included in the sync', rootCause: 'Fivetran syncs attachment metadata (filename, size, author, date) but not the actual binary file content. Similarly, inline images in issue descriptions and comments reference Jira URLs that may require authentication.', impact: 'Teams relying on attachments for documentation or evidence won\'t have that content in the warehouse. Links to attachments require Jira access.', resolution: 'The ISSUE_COMMENT table includes comment text but not embedded images. ATTACHMENT table has metadata only. If attachment content is needed, use the Jira REST API directly to download files by attachment ID. This is a Fivetran connector limitation, not a bug.' },
      { category: 'Setup', title: 'Field Configuration Schemes Affect Available Data', preview: 'Different projects may expose different fields based on Jira configuration', rootCause: 'Jira allows field configuration schemes that show/hide fields per project or issue type. A custom field visible in Project A may be hidden in Project B. Fivetran syncs the field if it exists on any issue, but values will be NULL where the field isn\'t configured.', impact: 'Cross-project reports may show inconsistent NULL patterns for custom fields that aren\'t universal. Analysts may misinterpret NULLs as missing data vs. not-applicable.', resolution: 'Document which custom fields apply to which projects. Use the FIELD_CONFIGURATION_ITEM table (if available) to understand field visibility rules. In your analytics layer, filter custom field analysis to projects where the field is relevant.' }
    ]
  },
  intercom: {
    name: 'Intercom',
    icon: 'I',
    iconClass: 'icon-default',
    description: 'Customer messaging platform — live chat, product tours, help center, and customer engagement',
    whatItDoes: 'Intercom powers customer communication through live chat, in-app messaging, product tours, and help articles. Fivetran syncs contacts, conversations, conversation parts, tags, and companies for customer success and support analytics.',
    usefulFor: 'Customer success analytics, support response times, product adoption tracking, user engagement analysis',
    docsUrl: 'https://fivetran.com/docs/connectors/applications/intercom',
    tables: [
      { name: 'CONTACT', whatContains: 'All contacts — users (signed up), leads (anonymous visitors), with email, name, custom attributes, last seen, signed up date, and browser/OS info', whyMatters: 'The core people table — every customer, lead, and visitor your team has interacted with', keyCallouts: 'Contacts have a role field: "user" (identified, signed up) or "lead" (anonymous/visitor). Intercom merged the old User and Lead models into Contact in API v2. Custom attributes appear as additional columns.' },
      { name: 'CONVERSATION', whatContains: 'All conversations with state (open, closed, snoozed), assignee, team, priority, SLA status, first response time, and tags', whyMatters: 'The core support analytics table — response times, resolution rates, volume trends, team workload', keyCallouts: 'State values: open, closed, snoozed. Conversations can be assigned to individuals or teams. SLA fields track whether response and resolution targets were met. Rating field captures customer satisfaction.' },
      { name: 'CONVERSATION_PART', whatContains: 'Individual messages within a conversation — author, body, part type (comment, note, assignment), and timestamps', whyMatters: 'The message-level detail for response time analysis and conversation quality review', keyCallouts: 'Part types include: comment (customer-facing), note (internal), assignment, close, open, and system-generated parts. This table can be VERY large — every message in every conversation is a row. Major MAR driver.' },
      { name: 'TAG', whatContains: 'Tags applied to contacts, conversations, and companies for categorization', whyMatters: 'Tags are how teams categorize conversations by topic, product area, or priority', keyCallouts: 'Tags are applied manually or via automation rules. A single conversation can have multiple tags. Tag names are free-text, so inconsistencies are common (e.g., "billing" vs "Billing" vs "billing-issue").' },
      { name: 'COMPANY', whatContains: 'Company records with name, plan, monthly spend, user count, industry, and custom attributes', whyMatters: 'Account-level grouping — links individual contacts to their organization for account-based analytics', keyCallouts: 'Companies link to contacts via a many-to-many relationship. Company data can be enriched via Intercom\'s built-in enrichment or manually. Plan and monthly_spend fields are optional and often unfilled.' }
    ],
    knownIssues: [
      { category: 'Data Integrity', title: 'Conversation Part Volume Drives MAR', preview: 'CONVERSATION_PART table can be massive and is the primary MAR driver', rootCause: 'Every message, internal note, assignment action, and system event within a conversation creates a conversation part. Active support teams with lengthy back-and-forth conversations generate millions of parts.', impact: 'CONVERSATION_PART is typically 10-50x larger than CONVERSATION. For a workspace with 100k conversations, expect 1-5M conversation parts. This is the #1 MAR cost driver for Intercom connectors.', resolution: 'Set expectations during deal sizing: ask about monthly conversation volume and average conversation length. If MAR is a concern, consider syncing CONVERSATION for metrics and selectively querying CONVERSATION_PART. Use Fivetran\'s table-level controls to disable CONVERSATION_PART if message-level detail isn\'t needed.' },
      { category: 'Data Integrity', title: 'Contact vs Lead vs User Distinction', preview: 'Intercom\'s contact model has evolved — role field is key', rootCause: 'Intercom merged separate User and Lead models into a unified Contact model in API v2. The role field ("user" or "lead") distinguishes identified users from anonymous visitors. Historical data may still reference the old models.', impact: 'Analysts may double-count people if they don\'t filter by role. Leads (anonymous visitors) can inflate contact counts significantly — some workspaces have 10x more leads than users.', resolution: 'Always filter by role in analytics queries. For customer metrics, use role = "user" (identified, signed-up customers). Leads are anonymous visitors tracked by Intercom\'s JavaScript — they become users when they sign up or are identified. Build separate dashboards for users vs. leads.' },
      { category: 'Data Integrity', title: 'Custom Attributes Syncing Behavior', preview: 'Custom attributes on contacts, conversations, and companies require awareness', rootCause: 'Intercom supports custom data attributes on contacts, conversations, and companies. These sync as additional columns. However, attribute types (string, integer, boolean, date) must be correctly set in Intercom — mistyped attributes may cause sync issues.', impact: 'New custom attributes appear as new columns automatically (schema drift). Attributes set to the wrong type in Intercom may cause type conflicts in the warehouse.', resolution: 'Review custom attribute definitions in Intercom Settings → Data Management → Contact/Conversation Data. Ensure types are correct before syncing. New attributes added in Intercom will auto-appear in the next sync. Use Fivetran\'s column blocking to exclude unnecessary attributes.' },
      { category: 'FAQ', title: 'Data Model Changes Between API Versions', preview: 'Intercom API v2 introduced breaking changes to the data model', rootCause: 'Intercom\'s API v2 (now the standard) unified Users and Leads into Contacts, changed conversation structure, and deprecated several endpoints. Fivetran\'s connector uses the latest API version.', impact: 'Customers migrating from an older Fivetran connector setup or comparing with historical exports may see schema differences. Some fields from API v1 no longer exist.', resolution: 'If the customer previously synced Intercom via an older connector version, a re-sync may be needed to align with the v2 schema. The CONTACT table replaces the old USER and LEAD tables. Check Fivetran\'s Intercom connector release notes for migration details.' },
      { category: 'Data Integrity', title: 'Conversation Assignment and Routing Data', preview: 'Assignment rules and routing logic are partially captured', rootCause: 'Intercom\'s conversation routing (assignment rules, round-robin, load balancing) happens in real-time. Fivetran captures the result (who the conversation is assigned to) but not the routing rules or automation logic that made the assignment.', impact: 'You can analyze who handles conversations and response times per assignee, but you can\'t reconstruct why a conversation was routed to a specific person from the synced data alone.', resolution: 'Use the CONVERSATION table\'s assignee and team fields for workload and performance analysis. For routing rule analysis, check Intercom\'s built-in reporting or export automation rules separately. CONVERSATION_PART records assignment changes over time.' },
      { category: 'Data Integrity', title: 'Archived and Deleted Conversations', preview: 'Archived conversations may still sync; deleted ones are removed', rootCause: 'Closed conversations remain in Intercom indefinitely and continue to sync. Archived conversations (removed from inbox but not deleted) may or may not appear depending on the connector\'s filter settings. Hard-deleted conversations are removed from the API.', impact: 'Historical conversation data is preserved for closed conversations. Deleted conversations create gaps in trend analysis.', resolution: 'Closed conversations sync with state = "closed" — use this for historical reporting. For deleted conversations, Fivetran marks them with _fivetran_deleted = true. Recommend customers close rather than delete conversations to preserve analytics history.' },
      { category: 'Errors', title: 'Rate Limiting on Large Workspaces', preview: '429 errors during sync of high-volume Intercom workspaces', rootCause: 'Intercom enforces API rate limits that vary by plan. Workspaces with millions of contacts or conversations may hit rate limits during sync, especially during the initial historical load.', impact: 'Sync slows down during rate limiting. Initial syncs for large workspaces (1M+ contacts) can take several days as Fivetran respects rate limit back-off.', resolution: 'Rate limiting is usually temporary — Fivetran automatically retries. For the initial sync, allow 2-5 days for large workspaces. If rate limiting is persistent on incremental syncs, reduce sync frequency or contact Intercom about higher rate limits on their plan.' },
      { category: 'Data Integrity', title: 'Event Data Has Limited Retention', preview: 'Intercom event data may not include full historical events', rootCause: 'Intercom\'s Events API has retention limits depending on the plan. Some events older than 90 days may not be available via the API. Fivetran can only sync what the API exposes.', impact: 'Long-term behavioral analysis may have gaps if events expire before the initial sync captures them. Product usage trend analysis may be limited to the retention window.', resolution: 'Check Intercom\'s event retention policy for the customer\'s plan tier. Set up the Fivetran connector as early as possible to capture events before they expire. For long-term event storage, consider supplementing with a separate event tracking tool (Segment, Mixpanel).' }
    ]
  },
  asana: {
    name: 'Asana',
    icon: 'A',
    iconClass: 'icon-default',
    description: 'Work management platform for team collaboration — tasks, projects, timelines, and portfolios',
    whatItDoes: 'Asana organizes work into tasks, projects, and portfolios for cross-functional teams. Fivetran syncs tasks, projects, sections, users, and teams to enable project management analytics and productivity insights.',
    usefulFor: 'Project management analytics, team productivity, task completion rates, resource allocation, cross-team workload visibility',
    docsUrl: 'https://fivetran.com/docs/connectors/applications/asana',
    tables: [
      { name: 'TASK', whatContains: 'All tasks with name, assignee, due date, completion status, tags, custom fields, parent task (subtask), project memberships, and timestamps', whyMatters: 'The core work unit — every piece of trackable work lives here. Enables completion rate, cycle time, and workload analysis', keyCallouts: 'Tasks can be in multiple projects simultaneously (multi-homed). Subtasks are tasks with a parent field pointing to another task. Completed tasks have completed_at timestamp. Custom fields appear as additional columns.' },
      { name: 'PROJECT', whatContains: 'All projects with name, owner, team, status (on track, at risk, off track), due date, color, and privacy settings', whyMatters: 'The organizational container — groups tasks into initiatives, sprints, or workstreams for portfolio-level tracking', keyCallouts: 'Project status (on_track, at_risk, off_track) is manually set by project owners. Privacy can be public (workspace-wide) or private (team only). Archived projects still sync but should be filtered in reports.' },
      { name: 'SECTION', whatContains: 'Sections within projects — used as columns in board view or groupings in list view', whyMatters: 'Represents workflow stages (e.g., To Do, In Progress, Done) — enables pipeline and Kanban-style analysis', keyCallouts: 'Sections are project-specific. In board view, sections = columns. Tasks move between sections as they progress. The order of sections defines the workflow sequence.' },
      { name: 'USER', whatContains: 'All workspace users with name, email, and workspaces they belong to', whyMatters: 'Links tasks to people — enables assignee-level workload analysis and team productivity metrics', keyCallouts: 'Users can belong to multiple workspaces. Deactivated users remain in historical data but won\'t appear in active user lists. Guest users (external collaborators) have limited workspace access.' },
      { name: 'TEAM', whatContains: 'Teams within the organization — name, description, and member list', whyMatters: 'Groups people by department or function — enables team-level productivity comparison and resource planning', keyCallouts: 'Teams own projects. A user can belong to multiple teams. Team visibility can be public or membership-by-request. Team membership changes affect project access.' }
    ],
    knownIssues: [
      { category: 'Data Integrity', title: 'Custom Field Handling Across Projects', preview: 'Custom fields sync as separate columns but may have different definitions per project', rootCause: 'Asana custom fields can be workspace-level (shared across projects) or project-level. Fivetran syncs custom fields as additional columns on the TASK table. Different projects may define custom fields with the same name but different types or options.', impact: 'Column names may be ambiguous when custom fields with identical names exist across projects with different meanings. Type mismatches can cause sync issues.', resolution: 'Use the CUSTOM_FIELD table to map field GIDs to display names and types. Recommend workspace-level custom fields for consistency. When building reports, always filter custom field analysis to relevant projects.' },
      { category: 'Data Integrity', title: 'Task-Subtask Relationships and Hierarchy', preview: 'Subtasks are stored as regular tasks with a parent reference — hierarchy can be deep', rootCause: 'Asana allows unlimited subtask nesting (subtasks of subtasks). Each subtask is a row in the TASK table with a parent field referencing the parent task GID. There\'s no single "root task" column for deeply nested hierarchies.', impact: 'Counting tasks for workload analysis may include both parent tasks and subtasks, inflating numbers. Recursive queries are needed to traverse deep hierarchies.', resolution: 'Filter by parent IS NULL for top-level tasks only. For hierarchy traversal, use recursive CTEs in your warehouse. Most teams only use 1-2 levels of subtasks. Consider a dbt model that flattens the hierarchy and adds a depth column.' },
      { category: 'Data Integrity', title: 'Multi-Homed Tasks Appear in Multiple Projects', preview: 'A single task can belong to multiple projects — creating apparent duplicates', rootCause: 'Asana\'s multi-homing feature allows a task to exist in multiple projects simultaneously. The task itself is one record, but it has multiple project memberships tracked in the TASK_PROJECT_MEMBERSHIP table.', impact: 'If you count tasks per project by joining TASK to PROJECT, multi-homed tasks are counted once per project — inflating project-level task counts. Total unique tasks across the workspace may be lower than the sum of per-project counts.', resolution: 'Use the TASK table for unique task counts (each task has one GID). Use TASK_PROJECT_MEMBERSHIP for project-level analysis. When reporting "tasks per project," clarify whether multi-homed tasks should count in each project or only their primary project.' },
      { category: 'Data Integrity', title: 'Completed vs Incomplete Task Filtering', preview: 'Completed tasks accumulate over time and can dominate the dataset', rootCause: 'Asana retains all completed tasks indefinitely. Over years, completed tasks can outnumber active tasks by 100:1. Fivetran syncs all tasks regardless of completion status.', impact: 'Dashboards showing "all tasks" become slow and dominated by historical completed work. MAR increases as the completed task backlog grows.', resolution: 'Filter to completed = false for active workload views. Use completed_at for historical completion rate analysis. Consider using Fivetran\'s table-level or column-level controls to manage the data volume if historical completed tasks aren\'t needed.' },
      { category: 'Setup', title: 'Project Membership and Access Scoping', preview: 'The connector user\'s access determines which projects sync', rootCause: 'Fivetran syncs data based on the authenticated user\'s workspace and project access. If the service account user doesn\'t have access to private projects, those projects and their tasks won\'t sync.', impact: 'Private or restricted projects may be silently excluded from the sync, leading to incomplete data.', resolution: 'Use a dedicated service account with access to all relevant projects. Add the Fivetran service account to all teams whose projects should sync. For organization-level access, the account needs Organization Admin or workspace-wide member status.' },
      { category: 'Data Integrity', title: 'Attachment and File Data Limitations', preview: 'Attachment metadata syncs but file content does not', rootCause: 'Asana tasks can have file attachments (uploaded, Google Drive, Dropbox links). Fivetran syncs attachment metadata (name, URL, type, created_at) but not the binary file content.', impact: 'Attachment counts and types are available for analysis, but file contents require direct Asana or cloud storage access.', resolution: 'Use the ATTACHMENT table for metadata analysis (count of attachments per task, file types). For actual file access, the download_url field links to the file but may require authentication.' },
      { category: 'FAQ', title: 'Portfolio and Goal Data Availability', preview: 'Portfolios and Goals may have limited sync coverage', rootCause: 'Asana Portfolios (collections of projects) and Goals (strategic objectives) are newer features with evolving API coverage. Fivetran\'s connector may not sync all portfolio and goal metadata depending on the connector version.', impact: 'Strategic-level reporting (portfolio health, goal progress) may require supplementary data from Asana\'s API directly or Asana\'s built-in reporting.', resolution: 'Check the Fivetran Asana connector release notes for current portfolio and goal support. For strategic reporting, consider Asana\'s native reporting features alongside warehouse analytics. Project-level status (on_track, at_risk, off_track) is available as a proxy for portfolio health.' }
    ]
  },
  servicenow: {
    name: 'ServiceNow',
    icon: 'S',
    iconClass: 'icon-default',
    description: 'Enterprise IT service management (ITSM) platform — incidents, changes, CMDB, and IT workflows',
    whatItDoes: 'ServiceNow manages IT services including incident management, change requests, configuration items (CMDB), and IT workflows. Fivetran syncs incidents, change requests, CMDB records, users, and tasks for ITSM analytics and operational reporting.',
    usefulFor: 'ITSM analytics, incident management, SLA monitoring, change management tracking, CMDB reporting',
    docsUrl: 'https://fivetran.com/docs/connectors/applications/servicenow',
    tables: [
      { name: 'INCIDENT', whatContains: 'IT incidents with number, short description, priority (P1-P5), state, category, assignment group, assigned to, SLA breach status, resolution time, and timestamps', whyMatters: 'The core ITSM table — every help desk ticket, outage, and IT issue. Drives SLA reporting, MTTR, and incident trend analysis', keyCallouts: 'Priority levels: 1 (Critical) to 5 (Planning). State values track lifecycle: New, In Progress, On Hold, Resolved, Closed. SLA fields show breach status. Category and subcategory enable trend analysis by issue type.' },
      { name: 'CHANGE_REQUEST', whatContains: 'Change management records — type (standard, normal, emergency), risk, state, CAB approval status, implementation plan, and affected CIs', whyMatters: 'Tracks all IT changes to production systems — essential for change success rate, lead time, and compliance reporting', keyCallouts: 'Change types: Standard (pre-approved), Normal (requires CAB), Emergency (expedited). Risk assessment fields drive approval workflows. Links to CMDB_CI show which systems are affected by each change.' },
      { name: 'CMDB_CI', whatContains: 'Configuration Management Database items — servers, applications, databases, network devices, cloud resources with relationships, ownership, and lifecycle status', whyMatters: 'The IT asset inventory — every managed system and its relationships. Foundation for impact analysis and dependency mapping', keyCallouts: 'CMDB is hierarchical with many CI classes (cmdb_ci_server, cmdb_ci_app, cmdb_ci_database). Relationships between CIs (runs on, depends on, used by) are in a separate CMDB_REL_CI table. Data quality varies widely — many organizations have stale or incomplete CMDB data.' },
      { name: 'SYS_USER', whatContains: 'All ServiceNow users — IT staff, end users, and service accounts with name, email, department, location, manager, and active status', whyMatters: 'Links incidents and changes to people and teams — enables workload analysis and organizational reporting', keyCallouts: 'sys_id is the primary key (32-character GUID). Active field indicates current employment status. Department and location fields enable organizational segmentation. VIP flag identifies high-priority users.' },
      { name: 'TASK', whatContains: 'The parent table for all work items — incidents, changes, problems, requests, and custom task types all extend this table', whyMatters: 'Provides a unified view across all task-based work in ServiceNow — useful for cross-process reporting', keyCallouts: 'TASK is the parent table that INCIDENT, CHANGE_REQUEST, PROBLEM, and other task types inherit from. Querying TASK gives a unified view but includes all task types. Use sys_class_name to filter by type. Most teams query the specific child tables instead.' }
    ],
    knownIssues: [
      { category: 'Setup', title: 'Table API Access Requires Admin Role', preview: 'Connector needs web_service_admin or admin role for full table API access', rootCause: 'Fivetran uses ServiceNow\'s Table API (REST) to extract data. This API requires the integration user to have the web_service_admin role or equivalent admin permissions. Without this role, API access to many tables is denied.', impact: 'Insufficient permissions result in 403 errors or empty table syncs. The connector silently skips tables the user can\'t access, leading to incomplete data without clear error messages.', resolution: 'Create a dedicated integration user in ServiceNow: User Administration → New → assign the web_service_admin and itil roles. For CMDB access, also add the itil_admin or cmdb_read role. Test API access by calling /api/now/table/incident with the integration user\'s credentials before configuring Fivetran.' },
      { category: 'Data Integrity', title: 'ACLs Silently Filter Data', preview: 'Access Control Lists can cause rows to be missing without any error', rootCause: 'ServiceNow ACLs (Access Control Lists) filter data at the row and field level based on the querying user\'s roles and groups. If the Fivetran integration user doesn\'t match ACL conditions, those rows or field values are silently excluded — no error, just missing data.', impact: 'Reports may show fewer incidents or change requests than expected. Sensitive fields (like resolution notes or customer data) may sync as empty. This is especially problematic because there\'s no error to investigate — the data just isn\'t there.', resolution: 'Audit ACLs on critical tables: System Security → Access Control (ACL). Ensure the integration user\'s roles satisfy ACL conditions for all tables being synced. Common issue: ACLs on the incident table that restrict by assignment_group — the integration user needs to be in all relevant groups or have an ACL-bypassing role.' },
      { category: 'Setup', title: 'Custom Table Configuration', preview: 'ServiceNow custom tables need explicit configuration in the connector', rootCause: 'ServiceNow allows custom tables (prefixed with u_ or x_). These tables are not auto-discovered by Fivetran — they must be explicitly added to the connector configuration by specifying the table name.', impact: 'Business-critical custom tables (custom CMDB classes, custom task types, custom reference tables) won\'t sync unless explicitly configured. Customers who built custom applications on ServiceNow may have significant data in custom tables.', resolution: 'Ask the customer which custom tables they need during discovery. In ServiceNow, navigate to System Definition → Tables and filter by "custom = true" to see all custom tables. Add table names to the Fivetran connector configuration. Test each custom table\'s API accessibility with the integration user.' },
      { category: 'Syncs', title: 'Large CMDB Datasets and Sync Performance', preview: 'CMDB tables can be very large and slow to sync', rootCause: 'Enterprise CMDB instances can contain hundreds of thousands of configuration items across dozens of CI classes. The CMDB_REL_CI (relationship) table can have millions of records mapping dependencies. Initial sync of a full CMDB can take days.', impact: 'Large CMDB syncs consume significant MAR and extend initial sync duration. The relationship table alone can be the largest table in the entire ServiceNow sync.', resolution: 'Start with the most important CMDB classes (cmdb_ci_server, cmdb_ci_app_server, cmdb_ci_database) rather than syncing all CI classes. Use table filters to limit CMDB scope. For the relationship table, consider filtering to specific relationship types (Runs on, Depends on) rather than syncing all relationships.' },
      { category: 'Data Integrity', title: 'Journal Fields Stored in Separate Tables', preview: 'Comments and work notes are in sys_journal_field, not on the incident record', rootCause: 'ServiceNow stores long text fields (comments, work notes, additional comments) in a separate sys_journal_field table, not as columns on the incident or change_request table. The incident table only shows the latest comment snippet.', impact: 'Analysts expecting full comment history on the INCIDENT table will only see the most recent entry. Full conversation history requires joining with the journal table, which can be very large.', resolution: 'Sync the SYS_JOURNAL_FIELD table for full comment and work note history. Join to incidents on element_id = incident.sys_id. Filter by element (comments vs. work_notes) and name (table name). Be aware this table can be extremely large — it stores all journal entries across all tables in ServiceNow.' },
      { category: 'Data Integrity', title: 'Reference Fields Return sys_id Not Display Values', preview: 'Foreign key fields show 32-character GUIDs instead of human-readable names', rootCause: 'ServiceNow reference fields (like assigned_to, assignment_group, category) store the sys_id (32-character GUID) of the referenced record, not the display value. For example, assigned_to contains "6816f79cc0a8016401c5a33be04be441" instead of "John Smith."', impact: 'Raw synced data is difficult to read and analyze without joining to reference tables. Every reference field requires a lookup join to get the human-readable display value.', resolution: 'Build lookup views in your warehouse: JOIN incident.assigned_to = sys_user.sys_id to get the name. Common reference joins: assigned_to → sys_user, assignment_group → sys_user_group, cmdb_ci → cmdb_ci. Consider creating a dbt model that pre-joins the most common reference fields for analyst-friendly tables.' },
      { category: 'FAQ', title: 'Instance Version Compatibility', preview: 'Different ServiceNow releases may affect API behavior', rootCause: 'ServiceNow releases major versions twice a year (named after cities: Tokyo, Utah, Vancouver, Washington DC, Xanadu). API behavior, available tables, and field definitions can vary between versions. Fivetran supports current and recent versions.', impact: 'Customers on very old ServiceNow versions may encounter API compatibility issues. New features in recent versions may require connector updates to sync properly.', resolution: 'Check the customer\'s ServiceNow version: System Diagnostics → Stats → Build tag. Fivetran documentation lists supported versions. If the customer is on an older version, recommend upgrading ServiceNow before setting up the connector. Most compatibility issues are resolved by keeping ServiceNow within the vendor\'s supported versions.' },
      { category: 'Data Integrity', title: 'Domain Separation in Multi-Tenant Instances', preview: 'Domain-separated instances may filter data based on the integration user\'s domain', rootCause: 'ServiceNow Domain Separation allows a single instance to serve multiple tenants (subsidiaries, departments) with data isolation. The integration user\'s domain assignment determines which records are visible via the API.', impact: 'In domain-separated instances, the Fivetran integration user may only see data from their assigned domain. Records from other domains are silently filtered, leading to incomplete data that appears correct (no errors, just fewer records).', resolution: 'For full cross-domain data access, assign the integration user to the "global" domain with the domain_admin role. If domain-specific access is intentional (each domain syncs separately), create one Fivetran connection per domain with domain-specific integration users. Verify data completeness by comparing record counts in ServiceNow vs. the warehouse.' }
    ]
  },
  quickbooks: {
    name: 'QuickBooks',
    icon: 'Q',
    iconClass: 'icon-default',
    description: 'Cloud accounting and bookkeeping platform for small and mid-sized businesses',
    whatItDoes: 'QuickBooks Online manages invoicing, expense tracking, payroll, bill payments, and bank reconciliation for SMBs. Fivetran syncs the full accounting dataset — invoices, payments, customers, vendors, accounts, and journal entries — giving finance teams a warehouse-ready view of the books.',
    usefulFor: 'SMB financial analytics, AP/AR reporting, cash flow analysis, revenue recognition, bookkeeping automation, month-end close acceleration',
    docsUrl: 'https://fivetran.com/docs/connectors/applications/quickbooks',
    tables: [
      { name: 'INVOICE', whatContains: 'All customer invoices with line items, amounts, due dates, status (paid/unpaid/overdue), and customer references', whyMatters: 'Core revenue table — drives AR aging, revenue recognition, and cash flow forecasting', keyCallouts: 'Balance field shows outstanding amount. Due date enables aging bucket calculations. Linked to INVOICE_LINE for item-level detail.' },
      { name: 'PAYMENT', whatContains: 'Customer payments received — amount, date, payment method, deposit account, and linked invoices', whyMatters: 'Tracks cash inflows and payment application against outstanding invoices', keyCallouts: 'A single payment can apply to multiple invoices. Unapplied payments show as credits. Join to INVOICE via invoice_id for reconciliation.' },
      { name: 'CUSTOMER', whatContains: 'Customer master records — name, email, billing address, balance, payment terms, and tax info', whyMatters: 'Central entity for AR reporting, customer segmentation, and revenue attribution', keyCallouts: 'Balance field is QuickBooks-calculated. Sub-customers linked via parent_ref. Active field distinguishes current vs inactive customers.' },
      { name: 'ACCOUNT', whatContains: 'Chart of accounts — account number, name, type (Asset, Liability, Equity, Revenue, Expense), sub-type, and current balance', whyMatters: 'Backbone of all financial reporting — every transaction posts here. Required for P&L, balance sheet, and trial balance.', keyCallouts: 'classification field maps to financial statement sections. account_sub_type provides granular categorization (e.g., Accounts Receivable vs Other Current Asset).' },
      { name: 'BILL', whatContains: 'Vendor bills with line items, due dates, amounts owed, and vendor references', whyMatters: 'Drives AP aging, vendor spend analysis, and cash outflow forecasting', keyCallouts: 'Balance field shows unpaid amount. Link to BILL_PAYMENT for payment tracking. due_date enables AP aging calculations.' }
    ],
    knownIssues: [
      { category: 'Setup', title: 'OAuth Token Expires Every 100 Days', preview: 'Connection breaks if OAuth is not refreshed within the window', rootCause: 'Intuit enforces a 100-day refresh token expiry on QuickBooks Online OAuth 2.0 connections. If no sync runs within that window (e.g., connector paused for months), the refresh token expires and re-authorization is required.', impact: 'Connector silently stops syncing after token expiry. Data goes stale without any sync error until the next attempted sync. Customers may not notice for days or weeks.', resolution: 'Ensure syncs run at least once every 90 days to keep the token alive. If the token expires, re-authorize in Fivetran: Connector → Setup tab → Re-authorize. The customer\'s QuickBooks admin must log in during re-auth. Set a calendar reminder for long-paused connectors.' },
      { category: 'Setup', title: 'QuickBooks Online vs Desktop — Only Online Supported', preview: 'Customer using QuickBooks Desktop cannot connect', rootCause: 'Fivetran\'s QuickBooks connector only supports QuickBooks Online (the cloud version). QuickBooks Desktop, QuickBooks Enterprise (on-prem), and QuickBooks Self-Employed are not supported because they lack a cloud API.', impact: 'Prospects on QuickBooks Desktop cannot use this connector at all. This is a common discovery surprise — many SMBs still run Desktop.', resolution: 'Ask early in discovery: "Are you on QuickBooks Online or Desktop?" If Desktop, discuss migration to QBO (Intuit offers migration tools) or alternative approaches like exporting Desktop data to CSV and loading via Fivetran\'s file connector. QuickBooks Desktop has a separate SDK but Fivetran does not support it.' },
      { category: 'Data Integrity', title: 'Multi-Currency Handling Complexity', preview: 'Transactions in foreign currencies require careful conversion', rootCause: 'When multi-currency is enabled in QuickBooks Online, transactions store amounts in both the transaction currency and the home currency. Exchange rates are set at time of transaction and may differ from current rates.', impact: 'Financial reports mixing currencies produce incorrect totals. Unrealized gains/losses on open foreign-currency invoices can confuse AP/AR aging reports.', resolution: 'Use the home_currency_amount fields for consolidated reporting in home currency. For transaction-currency analysis, group by currency_ref. Build an exchange rate layer in your warehouse for custom conversions. Note: multi-currency cannot be disabled once enabled in QBO.' },
      { category: 'Data Integrity', title: 'Class and Location Tracking Dimensions', preview: 'Class and Location fields may be empty if not enabled in QBO', rootCause: 'QuickBooks Online supports Class and Location tracking as optional dimensions on transactions. These must be explicitly enabled in QBO Settings → Advanced → Categories. Even when enabled, they\'re optional per transaction — many entries lack class/location.', impact: 'Departmental or location-based P&L reports will have gaps if users don\'t consistently tag transactions. Finance teams may see large "Unclassified" buckets.', resolution: 'Confirm with the customer whether Class and Location tracking are enabled and how consistently they\'re used. If adoption is low, the warehouse data will reflect that — it\'s a source data quality issue, not a sync issue. QBO Plus or Advanced is required for Location tracking.' },
      { category: 'Data Integrity', title: 'Deleted Transactions Not Immediately Reflected', preview: 'Voided or deleted transactions may persist in the destination', rootCause: 'QuickBooks Online handles deletions by voiding (zeroing out amounts) or deleting (removing entirely). Fivetran detects deletions on subsequent syncs, but voided transactions remain as $0 records rather than being flagged as deleted.', impact: 'Transaction counts may be inflated by voided entries. Deleted transactions show _fivetran_deleted = TRUE but voided ones remain active with zero amounts, potentially confusing reports.', resolution: 'Filter on _fivetran_deleted = FALSE for deleted records. For voided transactions, check for $0 amounts with a non-null void_date or look at the transaction status field. Build logic to exclude both voided and deleted records from financial summaries.' },
      { category: 'Data Integrity', title: 'Journal Entry Complexity and Double-Entry Lines', preview: 'Journal entries create multiple line items that must balance to zero', rootCause: 'QuickBooks Online journal entries follow double-entry accounting — each entry has debit and credit lines that must balance. Fivetran syncs these as separate rows in the JOURNAL_ENTRY_LINE table.', impact: 'Summing journal entry amounts without understanding debit/credit structure produces zero (which is correct accounting) but confuses non-accounting analysts. Improperly filtered queries can double-count amounts.', resolution: 'Understand the debit/credit model: posting_type = "Debit" increases asset/expense accounts, "Credit" increases liability/equity/revenue. For financial statements, aggregate by account and posting_type. The dbt_quickbooks package handles this correctly.' },
      { category: 'Data Integrity', title: 'Report vs Raw Data Discrepancies', preview: 'Warehouse totals don\'t match QuickBooks built-in reports', rootCause: 'QuickBooks built-in reports (P&L, Balance Sheet, AR Aging) apply business logic, accrual adjustments, and rounding that raw synced data does not include. Reports may also use a different date basis (transaction date vs posting date).', impact: 'Finance teams comparing Fivetran-powered dashboards to native QBO reports will see discrepancies. This can erode trust in the data warehouse.', resolution: 'Set expectations upfront: raw data requires transformation to match report outputs. Use the dbt_quickbooks package which replicates QBO\'s report logic. For validation, compare at the account level using the same date range and accounting method (cash vs accrual).' },
      { category: 'Data Integrity', title: 'Chart of Accounts Mapping to Standard Categories', preview: 'Custom account names don\'t map cleanly to standard financial categories', rootCause: 'Every QBO instance has a customized chart of accounts. Account names, numbering, and hierarchies vary widely between businesses. Fivetran syncs the raw chart of accounts as-is.', impact: 'Cross-company benchmarking or multi-entity consolidation requires mapping custom accounts to a standard taxonomy. Without this, consolidated P&L reports are meaningless.', resolution: 'Build an account mapping table in your warehouse that maps each account to a standard category (GAAP or IFRS line items). The account_type and account_sub_type fields provide a starting point. For multi-entity consolidation, create a shared mapping maintained by the finance team.' },
      { category: 'Data Integrity', title: 'Bank Feed Data Limitations', preview: 'Bank feed transactions may not include all detail available in QBO', rootCause: 'QuickBooks Online\'s bank feeds pull transaction data from financial institutions, but Fivetran syncs the matched/reconciled transactions, not the raw bank feed. Unmatched bank feed entries are not available through the API.', impact: 'Bank reconciliation workflows that rely on unmatched feed entries cannot be replicated in the warehouse. Only transactions that have been reviewed and matched in QBO are synced.', resolution: 'Advise the customer that the warehouse reflects the reconciled state of their books. For full bank transaction data, consider connecting directly to the bank via a separate connector (e.g., Plaid) alongside QuickBooks.' },
      { category: 'FAQ', title: 'Cash vs Accrual Basis Reporting', preview: 'QBO supports both methods but Fivetran syncs raw transactions', rootCause: 'QuickBooks Online allows toggling between cash and accrual basis in its reports. Fivetran syncs the underlying transactions without applying either accounting method — that logic must be built in the warehouse.', impact: 'Raw data in the warehouse is transaction-level. To produce cash-basis or accrual-basis financial statements, transformation logic is required.', resolution: 'Use the dbt_quickbooks package which supports both cash and accrual basis P&L and balance sheet generation. If building custom, cash basis = recognize when payment is received; accrual basis = recognize when invoice is created.' }
    ]
  },

  xero: {
    name: 'Xero',
    icon: 'X',
    iconClass: 'icon-default',
    description: 'Cloud accounting platform popular with SMBs and mid-market companies, especially in UK, Australia, and New Zealand',
    whatItDoes: 'Xero handles invoicing, bank reconciliation, expense claims, payroll (in select regions), and financial reporting. Fivetran syncs invoices, payments, contacts, accounts, bank transactions, and journal entries — delivering a complete financial dataset to the warehouse.',
    usefulFor: 'SMB and mid-market financial analytics, multi-entity consolidation, AP/AR analysis, tax reporting, cash flow forecasting, finance team automation',
    docsUrl: 'https://fivetran.com/docs/connectors/applications/xero',
    tables: [
      { name: 'INVOICE', whatContains: 'Sales and purchase invoices — type (ACCREC/ACCPAY), status, amounts, due dates, line items, and contact references', whyMatters: 'Core financial table covering both AR (ACCREC) and AP (ACCPAY) in a single table. Drives revenue recognition, aging reports, and cash flow projections.', keyCallouts: 'Type field is critical: ACCREC = sales invoice (AR), ACCPAY = purchase invoice (AP). Status values: DRAFT, SUBMITTED, AUTHORISED, PAID, VOIDED. amount_due shows outstanding balance.' },
      { name: 'PAYMENT', whatContains: 'All payments received and made — amount, date, payment type, bank account, and linked invoice references', whyMatters: 'Tracks cash inflows and outflows, enabling bank reconciliation and cash basis reporting', keyCallouts: 'Payments link to invoices via invoice_id. Overpayments and prepayments are tracked as separate payment types. is_reconciled flag shows bank reconciliation status.' },
      { name: 'CONTACT', whatContains: 'Customers and suppliers — name, email, phone, addresses, tax info, account number, and outstanding balances', whyMatters: 'Unified entity table for both customers (AR) and suppliers (AP). Central to vendor management and customer analytics.', keyCallouts: 'is_customer and is_supplier flags distinguish roles — a contact can be both. accounts_receivable_outstanding and accounts_payable_outstanding are Xero-calculated balances.' },
      { name: 'ACCOUNT', whatContains: 'Chart of accounts — code, name, type (REVENUE, EXPENSE, ASSET, LIABILITY, EQUITY), tax type, and status', whyMatters: 'Foundation for all financial reporting. Every transaction line posts to an account. Needed for P&L, balance sheet, and trial balance.', keyCallouts: 'type field maps to financial statement sections. class field (ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE) enables quick statement grouping. enable_payments_to_account flag shows bank-linked accounts.' },
      { name: 'BANK_TRANSACTION', whatContains: 'Bank statement lines with type (SPEND/RECEIVE), amount, date, reference, contact, and line items posted to accounts', whyMatters: 'Direct feed of banking activity. Essential for cash flow analysis and reconciliation between bank and books.', keyCallouts: 'Type SPEND = money out, RECEIVE = money in. is_reconciled flag shows whether the transaction has been matched. Unreconciled transactions indicate bookkeeping gaps.' }
    ],
    knownIssues: [
      { category: 'Setup', title: 'OAuth Token Refresh Requirements', preview: 'Connection may break if OAuth tokens are not regularly refreshed', rootCause: 'Xero uses OAuth 2.0 with access tokens that expire every 30 minutes. Fivetran handles automatic refresh, but if the refresh token itself is revoked (e.g., user disconnects the app in Xero, or the authorizing user loses access), the connector breaks and requires re-authorization.', impact: 'Connector stops syncing silently. Data goes stale until someone notices and re-authorizes. This can happen if the Xero admin who authorized Fivetran leaves the company.', resolution: 'Use a service account or shared admin account for authorization rather than a personal user account. If the connection breaks, re-authorize in Fivetran: Connector → Setup tab → Re-authorize. The Xero Advisor role is recommended for the authorizing user.' },
      { category: 'Setup', title: 'Multi-Org Setup Requires Separate Connectors', preview: 'Each Xero organization needs its own Fivetran connector', rootCause: 'Xero treats each organization as a completely independent instance with its own chart of accounts, contacts, and transactions. There is no multi-org API — each org requires separate OAuth authorization and a separate Fivetran connector.', impact: 'Businesses with multiple entities (common in franchises, holding companies, or multi-country operations) need N connectors for N Xero orgs. Cost and management overhead scale linearly.', resolution: 'Set up one Fivetran connector per Xero org. Use consistent schema naming (e.g., xero_us, xero_uk, xero_au) for easier cross-entity analytics. Build a union view in the warehouse for consolidated reporting. Ask during discovery: "How many Xero organizations do you have?"' },
      { category: 'Data Integrity', title: 'Tracking Categories for Departmental Reporting', preview: 'Tracking categories may not map cleanly to departmental dimensions', rootCause: 'Xero uses "Tracking Categories" (up to 2) as dimensional tags on transactions — commonly used for departments, cost centers, or projects. These are synced as separate fields on transaction lines, but the structure is Xero-specific and doesn\'t follow a standard dimensional model.', impact: 'Departmental P&L reports depend on consistent tracking category usage. If staff don\'t tag transactions, the department column will be null. With only 2 tracking categories allowed, complex organizations may lack granularity.', resolution: 'Map tracking categories to your warehouse\'s dimensional model during transformation. Check with the customer how consistently tracking categories are applied — low adoption means low data quality. Consider supplementing with rules-based classification in the warehouse.' },
      { category: 'Data Integrity', title: 'Manual Journal Handling', preview: 'Manual journals may create unexpected entries in financial data', rootCause: 'Xero allows manual journal entries for adjustments, accruals, and corrections. These are synced to the MANUAL_JOURNAL table with line items. Unlike invoices and bank transactions, manual journals bypass normal business workflows.', impact: 'Manual journals can materially change financial totals. Month-end adjustments posted as manual journals may surprise analysts who only look at invoice and payment tables.', resolution: 'Always include MANUAL_JOURNAL in financial reporting queries. For audit purposes, flag manual journals separately from system-generated entries. High volumes of manual journals may indicate the customer is using workarounds for processes Xero doesn\'t natively support.' },
      { category: 'Data Integrity', title: 'Tax Rate Complexity by Region', preview: 'Tax rates vary significantly by country and require careful handling', rootCause: 'Xero supports region-specific tax configurations (GST in Australia/NZ, VAT in UK/EU, Sales Tax in US). Tax rates are synced to a TAX_RATE table, but the rules for tax calculation — including compound taxes, reduced rates, and exemptions — are complex and region-dependent.', impact: 'Tax reporting built from raw Fivetran data requires understanding the customer\'s tax jurisdiction. Incorrect tax aggregation can produce compliance issues.', resolution: 'Join transaction lines with the TAX_RATE table for accurate tax breakdowns. For multi-region organizations, build region-specific tax logic. Recommend the customer\'s tax team validate warehouse tax reports against Xero\'s built-in tax reports (BAS, VAT Return, etc.).' },
      { category: 'Syncs', title: 'API Rate Limits — 60 Calls Per Minute', preview: 'Large Xero orgs may experience slow syncs due to rate limiting', rootCause: 'Xero enforces a strict rate limit of 60 API calls per minute per app per tenant. For organizations with large transaction volumes, this throttling significantly extends sync duration. The daily limit is 5,000 calls per app per tenant.', impact: 'Initial sync for a mature Xero org (5+ years of data) can take several hours. Incremental syncs are usually fast but can slow down during month-end when transaction volumes spike.', resolution: 'Set expectations for initial sync duration: 2-8 hours depending on data volume. Reduce scope by disabling non-essential tables during initial sync. Fivetran handles rate limiting automatically with retries and backoff — no user action needed.' },
      { category: 'Data Integrity', title: 'Archived Contacts Not Syncing', preview: 'Contacts marked as archived in Xero may be excluded from sync', rootCause: 'Xero allows archiving contacts to keep the active contact list clean. Depending on the API endpoint behavior, archived contacts may not be returned in standard API responses, leading to gaps in the CONTACT table.', impact: 'Historical transactions reference contacts that don\'t exist in the CONTACT table, creating orphaned foreign keys. Vendor or customer analytics may undercount total relationships.', resolution: 'Check if archived contacts are present in the synced data. If missing, the customer may need to un-archive critical contacts or accept that historical contact details for archived entities will be incomplete. Build OUTER JOINs rather than INNER JOINs when linking transactions to contacts.' },
      { category: 'Data Integrity', title: 'Payroll Data in Separate API', preview: 'Payroll data is not included in the standard Xero connector', rootCause: 'Xero Payroll is a separate product with its own API (and separate regional versions for AU, NZ, and UK). The standard Fivetran Xero connector syncs accounting data only — payroll-specific tables like pay runs, pay items, employees, and timesheets are not included.', impact: 'Customers expecting payroll data in their warehouse will not find it through the Xero accounting connector. Payroll costs may appear as summarized journal entries but not at the employee or pay-item level.', resolution: 'Set expectations during discovery: the Xero connector covers accounting, not payroll. For payroll analytics, the customer may need a separate integration or CSV export from Xero Payroll. Payroll journal entries posted to the accounting ledger will sync as summarized amounts.' }
    ]
  },

  workday: {
    name: 'Workday',
    icon: 'W',
    iconClass: 'icon-default',
    description: 'Enterprise cloud platform for human capital management (HCM), financials, and planning',
    whatItDoes: 'Workday is the system of record for HR, payroll, benefits, talent, and workforce planning at large enterprises. Fivetran syncs worker profiles, organizational structures, compensation data, and time-off records through Workday\'s Report-as-a-Service (RaaS) framework.',
    usefulFor: 'People analytics, workforce planning, headcount reporting, compensation analysis, diversity and inclusion metrics, org design, talent retention modeling',
    docsUrl: 'https://fivetran.com/docs/connectors/applications/workday',
    tables: [
      { name: 'WORKER', whatContains: 'Employee and contingent worker records — name, employee ID, hire date, status (active/terminated/leave), worker type, manager reference, and business title', whyMatters: 'The foundational people table. Every HR metric — headcount, turnover, tenure, span of control — starts here.', keyCallouts: 'Worker type distinguishes employees from contingent workers (contractors). Status changes (hire, term, leave) are point-in-time — use effective dates for historical analysis. Contains PII that may require access controls.' },
      { name: 'ORGANIZATION', whatContains: 'Organizational hierarchy — org name, type (supervisory, cost center, company, region), parent org, manager, and effective dates', whyMatters: 'Defines the org chart and reporting structure. Critical for rollup reporting by department, division, or cost center.', keyCallouts: 'Workday supports multiple overlapping org hierarchies (supervisory, matrix, cost center). The hierarchy type determines which reporting tree you\'re analyzing. Effective-dated entries mean the structure changes over time.' },
      { name: 'POSITION', whatContains: 'Job positions — title, job profile, position ID, location, time type (full-time/part-time), and worker assignment', whyMatters: 'Links workers to their roles. Enables headcount planning, open position tracking, and workforce capacity analysis.', keyCallouts: 'A position can be filled or vacant. Position management is optional in Workday — some orgs don\'t use it. worker_ref links to the WORKER table when filled.' },
      { name: 'COMPENSATION', whatContains: 'Compensation plans — base pay, total pay, currency, frequency (annual/hourly), grade, and step', whyMatters: 'Powers compensation analysis, pay equity studies, budget vs actual comparisons, and merit cycle planning', keyCallouts: 'Amounts may be in different currencies for global workforces. Frequency field (annual, hourly, monthly) must be normalized for cross-employee comparisons. Compensation changes are effective-dated.' },
      { name: 'TIME_OFF', whatContains: 'Time-off requests and balances — type (vacation, sick, personal), status (approved/pending/denied), dates, and hours', whyMatters: 'Drives time-off utilization analysis, absence trend identification, and workforce availability planning', keyCallouts: 'Balance fields show current accrual status. Request status must be filtered (approved only) for accurate utilization metrics. Time-off plans define accrual rules.' }
    ],
    knownIssues: [
      { category: 'Setup', title: 'RaaS (Report-as-a-Service) Configuration Required', preview: 'Connector requires custom reports built in Workday — not a plug-and-play setup', rootCause: 'Unlike most connectors that query standard APIs, Fivetran\'s Workday connector ingests data through RaaS — custom reports created in Workday that expose data as web service endpoints. Each report must be built by a Workday administrator with the right data sources, filters, and output fields.', impact: 'Setup takes significantly longer than typical connectors (days to weeks vs minutes). Requires a skilled Workday admin or consultant. The data you get is only as good as the reports you build.', resolution: 'Fivetran provides report templates and a setup guide. The customer\'s Workday admin creates the reports following Fivetran\'s specifications. Recommend starting with 3-5 core reports (Workers, Organizations, Compensation) and expanding later. Budget 1-2 weeks for setup with an experienced admin.' },
      { category: 'Setup', title: 'Custom Report Design Complexity', preview: 'Report structure determines data quality and completeness', rootCause: 'RaaS reports must be carefully designed: the data source, business object, filters, and output columns all affect what data Fivetran receives. A poorly designed report (wrong data source, missing filters, incorrect prompts) produces incomplete or incorrect data.', impact: 'Garbage in, garbage out. If the report is missing fields, the warehouse table is missing columns. If the filter is wrong, data is either too broad (all workers including terminated) or too narrow (only US employees).', resolution: 'Use Fivetran\'s recommended report templates as the starting point. Have the Workday admin test reports in Workday first before connecting to Fivetran. Include effective-date filters to enable point-in-time analysis. Document report designs so future changes are traceable.' },
      { category: 'Setup', title: 'ISU (Integration System User) Permissions', preview: 'Connector requires a dedicated integration user with specific security permissions', rootCause: 'Workday requires an Integration System User (ISU) account to authenticate API requests. The ISU must be assigned to an Integration Security Group with domain security policies granting access to the data in the RaaS reports. Missing permissions cause silent data gaps.', impact: 'If the ISU lacks permission to a domain (e.g., Compensation), the report runs but returns empty columns. This is hard to debug because there\'s no explicit error — data just doesn\'t appear.', resolution: 'Create a dedicated ISU for Fivetran (don\'t reuse an existing one). Assign it to an ISSG with read access to: Worker Data, Organization Data, Compensation Data, Time Off Data, and any custom domains the reports reference. Test by running the reports as the ISU in Workday before connecting to Fivetran.' },
      { category: 'Data Integrity', title: 'Sensitive PII Data Handling', preview: 'Worker data contains personal information requiring careful governance', rootCause: 'Workday is the system of record for employee PII: SSNs, dates of birth, home addresses, compensation details, medical leave status, and performance ratings. All of this data flows through Fivetran into the warehouse.', impact: 'Data governance and compliance risks (GDPR, CCPA, SOX). Unrestricted warehouse access to HR data can expose sensitive employee information to unauthorized users.', resolution: 'Implement column-level security or row-level security in the warehouse. Mask or hash PII fields (SSN, DOB) during transformation. Exclude highly sensitive fields from the RaaS reports if they\'re not needed for analytics. Work with the customer\'s legal/compliance team to define data access policies before going live.' },
      { category: 'Data Integrity', title: 'Tenant-Specific Report Definitions', preview: 'Reports are not portable between Workday tenants', rootCause: 'Workday RaaS reports are defined per tenant (each customer instance). Report definitions, custom fields, calculated fields, and business objects vary between tenants. A report built for Customer A won\'t work for Customer B because their Workday configurations differ.', impact: 'Every new Workday customer requires custom report setup. There is no one-size-fits-all template. Highly customized Workday instances require more setup effort.', resolution: 'Use Fivetran\'s baseline report templates as a starting point, then customize for each tenant. Document deviations from the baseline for support purposes. If the customer has a Workday sandbox, build and test reports there first before deploying to production.' },
      { category: 'Syncs', title: 'Large Workforce Data Volumes', preview: 'Enterprises with 50K+ employees may experience long sync times', rootCause: 'Large enterprises can have hundreds of thousands of worker records with deep history (compensation changes, position changes, manager changes over years). RaaS reports pulling all historical data generate very large result sets.', impact: 'Initial sync can take many hours. Incremental syncs may also be slow if reports include effective-dated history. Memory and timeout issues can occur with extremely large reports.', resolution: 'For initial sync, consider limiting historical depth (e.g., last 3 years). Break large reports into smaller ones (e.g., separate report for active vs terminated workers). Use Fivetran\'s pagination settings for large result sets. Incremental sync via effective_date filter reduces ongoing volume.' },
      { category: 'Data Integrity', title: 'Compensation History Tracking Challenges', preview: 'Point-in-time compensation analysis requires careful report design', rootCause: 'Workday stores compensation as effective-dated records — each change (merit increase, promotion, adjustment) creates a new effective-dated row. To see a worker\'s compensation at a specific point in time, you need to find the record with the most recent effective date on or before that date.', impact: 'Simply querying the compensation table returns multiple rows per worker (one per change). Summing compensation without filtering to a specific effective date produces inflated totals.', resolution: 'Build an "as of" date filter in your transformation: for each worker, select the compensation record with MAX(effective_date) WHERE effective_date <= target_date. This pattern is needed for any point-in-time workforce snapshot. The dbt approach is a window function with ROW_NUMBER() partitioned by worker_id.' },
      { category: 'Data Integrity', title: 'Organizational Hierarchy Complexity', preview: 'Multiple overlapping org structures make rollup reporting non-trivial', rootCause: 'Workday supports multiple concurrent organizational hierarchies: supervisory org (reporting manager), cost center hierarchy (finance), company hierarchy (legal entity), and custom hierarchies (matrix reporting, projects). A single worker can belong to different nodes in each hierarchy.', impact: 'The question "How many people are in Engineering?" depends on which hierarchy you use. Supervisory org says 500, cost center says 480, and company hierarchy says 520. Executives get confused when dashboards show different numbers.', resolution: 'Standardize on one hierarchy type for headcount reporting (usually supervisory org). Document which hierarchy each metric uses. Build separate dimension tables for each hierarchy type. When presenting to executives, explicitly state the hierarchy used and why numbers may differ from other systems.' },
      { category: 'Syncs', title: 'Real-Time Data Not Available — Batch Reports Only', preview: 'Workday data is synced via scheduled reports, not real-time streaming', rootCause: 'The RaaS approach means data is extracted via report execution, not real-time API events. Reports run on a schedule (typically daily or every few hours). Changes made in Workday between report runs are not reflected until the next sync.', impact: 'Workforce dashboards show data as of the last sync, not real time. A new hire entered at 9 AM won\'t appear in the warehouse until the next scheduled sync. This can be a problem for time-sensitive use cases like onboarding workflows.', resolution: 'Set expectations that Workday data has inherent latency (typically 4-24 hours). For most people analytics use cases, daily sync is sufficient. If near-real-time is needed, explore Workday\'s Integration Cloud (Workday Studio) for event-based triggers, though this is outside Fivetran\'s scope.' },
      { category: 'FAQ', title: 'Workday HCM vs Workday Financials', preview: 'Fivetran\'s Workday connector focuses on HCM data', rootCause: 'Workday offers both HCM (HR, Payroll, Benefits, Talent) and Financials (GL, AP, AR, Procurement) modules. Fivetran\'s Workday connector can sync data from either, but the setup and report design differ significantly between the two. Most customers start with HCM.', impact: 'Customers asking about "Workday" may mean HCM, Financials, or both. Setting up both modules doubles the report design effort. Financial data adds complexity around journal entries, chart of accounts, and multi-currency.', resolution: 'Clarify which Workday modules the customer uses and which they want to sync. Start with HCM (more common, faster ROI). Add Financials in a second phase if needed. Each module requires its own set of RaaS reports.' }
    ]
  },

  bamboohr: {
    name: 'BambooHR',
    icon: 'B',
    iconClass: 'icon-default',
    description: 'Cloud HR platform for small and mid-sized businesses — employee records, time off, onboarding, and performance',
    whatItDoes: 'BambooHR is an HR information system (HRIS) for managing employee data, PTO, onboarding, benefits, and basic reporting. Fivetran syncs employee records, time-off requests, directory information, and custom tables to enable people analytics in the warehouse.',
    usefulFor: 'People analytics, headcount tracking, turnover analysis, time-off utilization, HR compliance reporting, workforce demographics',
    docsUrl: 'https://fivetran.com/docs/connectors/applications/bamboohr',
    tables: [
      { name: 'EMPLOYEE', whatContains: 'Core employee records — name, email, department, division, hire date, termination date, employment status, job title, supervisor, and custom fields', whyMatters: 'The foundational HR table. Powers headcount, tenure, turnover, and org reporting. Every people analytics question starts here.', keyCallouts: 'Status field distinguishes active vs terminated vs on leave. Termination date + termination reason enable turnover analysis. Custom fields vary by customer — the table structure may differ between BambooHR accounts.' },
      { name: 'TIME_OFF', whatContains: 'Time-off requests — type (vacation, sick, personal, etc.), dates, amount (hours/days), status (approved/pending/cancelled), and employee reference', whyMatters: 'Enables PTO utilization tracking, absence trend analysis, and workforce availability planning', keyCallouts: 'Filter on status = "approved" for accurate utilization. Amount field units depend on the time-off policy (hours vs days). date_start and date_end define the range, but multi-day requests may or may not show as separate rows depending on the policy.' },
      { name: 'TIME_OFF_POLICY', whatContains: 'Time-off policy definitions — policy name, type (vacation, sick, personal), accrual rate, maximum balance, and carryover rules', whyMatters: 'Provides context for time-off analysis: how much PTO employees earn, caps, and accrual schedules', keyCallouts: 'Join with TIME_OFF on policy_id for policy-level utilization metrics. Multiple policies can exist for the same time-off type (e.g., different vacation policies for US vs EU employees).' },
      { name: 'EMPLOYEE_DIRECTORY', whatContains: 'Simplified employee directory — name, preferred name, department, location, phone, photo URL, and job title', whyMatters: 'Quick reference table for organizational directory and basic workforce demographics', keyCallouts: 'Subset of EMPLOYEE data optimized for directory-style queries. May not include all custom fields available in the EMPLOYEE table. Useful for lightweight people dashboards.' },
      { name: 'CUSTOM_TABLE', whatContains: 'Customer-defined data tables in BambooHR — varies by implementation but commonly includes compensation history, equipment tracking, or training records', whyMatters: 'Captures business-specific HR data not covered by standard BambooHR tables. Often contains compensation history, which BambooHR doesn\'t natively expose through standard API fields.', keyCallouts: 'Structure varies entirely by customer. Column names are user-defined. Must be explicitly configured in Fivetran. Always ask the customer what custom tables they\'ve created and what they contain.' }
    ],
    knownIssues: [
      { category: 'Setup', title: 'API Key Requires Full API Access', preview: 'Restricted API keys may cause silent data gaps', rootCause: 'BambooHR uses API key authentication. The API key must belong to a user with full administrative access to the BambooHR account. Restricted-access users generate API keys that can authenticate but cannot read all employee data — certain fields or employees may be silently excluded.', impact: 'Connector authenticates successfully but returns incomplete data. Headcount numbers in the warehouse don\'t match BambooHR reports. Specific departments or locations may be missing entirely.', resolution: 'Generate the API key from a Full Admin account in BambooHR. In BambooHR: Account → API Keys → Add New Key. Verify the generating user has access to all employees and all fields. If the customer has access-level restrictions, they must use an admin user for the Fivetran integration.' },
      { category: 'Setup', title: 'Custom Field and Table Configuration', preview: 'Custom fields and tables require explicit setup in Fivetran', rootCause: 'BambooHR allows customers to create custom fields on the employee record and custom tables (e.g., compensation history, equipment, certifications). These don\'t appear in the Fivetran schema automatically — they must be identified and configured during connector setup.', impact: 'Critical HR data stored in custom fields or tables will be missing from the warehouse. Compensation data is commonly stored in a custom table, so pay analytics may be impossible without this configuration.', resolution: 'During discovery, ask: "What custom fields and custom tables have you added to BambooHR?" Common custom tables: Compensation, Equipment, Training, Emergency Contacts. Configure these in the Fivetran connector\'s schema settings. Each custom table appears as a separate destination table.' },
      { category: 'Data Integrity', title: 'Employee Termination Data Handling', preview: 'Terminated employees remain in the data but require careful filtering', rootCause: 'BambooHR keeps terminated employee records in the system (they\'re not deleted). Fivetran syncs all employees regardless of status. The termination date, termination reason, and status fields indicate when and why an employee left.', impact: 'Headcount reports that count all employees without filtering on status = "Active" will be inflated. Active headcount vs total employees (including terminated) can differ dramatically for mature organizations.', resolution: 'Always filter on employment status for current headcount: WHERE status = \'Active\'. For turnover analysis, use termination_date and termination_reason. Build separate views for active headcount vs terminated employee analysis. Voluntary vs involuntary termination may require mapping the termination_reason values.' },
      { category: 'Data Integrity', title: 'Sensitive PII Considerations', preview: 'Employee data contains personal information requiring access controls', rootCause: 'BambooHR stores employee PII: SSN/national ID, date of birth, home address, salary, emergency contacts, and potentially medical information (disability, EEO data). All of this syncs to the warehouse unless explicitly excluded.', impact: 'Unrestricted warehouse access to HR data creates compliance risks (GDPR, CCPA, ADA, HIPAA). A data breach involving employee PII has severe legal and reputational consequences.', resolution: 'Implement column-level security for sensitive fields (SSN, DOB, address, salary). Consider excluding highly sensitive fields from the sync entirely if not needed for analytics. Work with the customer\'s HR and legal teams to define access policies. Apply row-level security if different users should only see their own department.' },
      { category: 'Data Integrity', title: 'Time-Off Accrual Calculations', preview: 'PTO balance calculations may not match BambooHR exactly', rootCause: 'BambooHR calculates PTO balances using complex accrual rules: accrual frequency, waiting periods, carryover limits, and anniversary-based resets. Fivetran syncs the time-off requests and policy definitions, but the real-time balance calculation happens inside BambooHR.', impact: 'Attempting to calculate PTO balances from raw time-off data in the warehouse may not match BambooHR\'s internal calculations. Accrual rules are complex and customer-specific.', resolution: 'If BambooHR exposes current balance fields through the API, use those directly rather than trying to recalculate. For historical balance analysis, the calculation requires: accrual rate × periods elapsed - time used + carryover, capped at maximum balance. Recommend the customer validate warehouse balance calculations against BambooHR reports.' },
      { category: 'Data Integrity', title: 'Limited Reporting Field Access on Lower Tiers', preview: 'Some BambooHR plans restrict which fields are available via API', rootCause: 'BambooHR offers Essentials and Advantage plans. Some API fields and features (performance management, employee satisfaction, advanced reporting) are only available on the Advantage plan. The Essentials plan may expose fewer fields through the API.', impact: 'Customers on the Essentials plan may find certain fields or tables empty or unavailable. Performance review data, training tracking, and advanced custom fields may require an upgrade.', resolution: 'During discovery, confirm the customer\'s BambooHR plan level. If they\'re on Essentials and need data from Advantage-only features, they\'ll need to upgrade with BambooHR. Document which fields are available on each plan to set accurate expectations.' },
      { category: 'Data Integrity', title: 'Photo and Document Data Not Synced', preview: 'Employee photos and uploaded documents are not available through the connector', rootCause: 'BambooHR\'s API provides URLs for employee photos and lists document metadata, but Fivetran does not download or sync binary file content (images, PDFs, attached documents). Only text-based structured data is synced.', impact: 'Employee directory applications that need photos must fetch them separately from BambooHR. Document management use cases (offer letters, I-9s, signed policies) are not supported through the Fivetran connector.', resolution: 'For employee photos, the EMPLOYEE_DIRECTORY table may include a photo URL that can be used directly by downstream applications (if the URL is publicly accessible or the app can authenticate to BambooHR). For documents, use BambooHR\'s native document management or a separate document management system.' },
      { category: 'FAQ', title: 'BambooHR vs Workday — When to Expect Each', preview: 'Understanding which HR system a prospect likely uses', rootCause: 'BambooHR targets SMBs (50-1,000 employees) while Workday targets mid-market to enterprise (1,000+ employees). During AE conversations, the customer\'s size and HR complexity signal which system they likely use.', impact: 'Knowing the customer\'s HRIS helps tailor the conversation. BambooHR customers value simplicity and fast setup. Workday customers expect enterprise-grade data handling and complex org structures.', resolution: 'Under 500 employees → likely BambooHR, Gusto, or Rippling. 500-2,000 → could be BambooHR Advantage, Workday, or ADP. 2,000+ → likely Workday, SAP SuccessFactors, or Oracle HCM. Ask: "What HRIS are you using?" during discovery to tailor the data integration conversation.' }
    ]
  },
  amplitude: {
    name: 'Amplitude',
    icon: 'A',
    iconClass: 'icon-default',
    description: 'Product analytics platform for tracking user behavior, funnels, and retention',
    whatItDoes: 'Amplitude captures every user interaction inside digital products — clicks, page views, feature usage, and custom events. Fivetran syncs raw event data, user profiles, and identity mappings so teams can build warehouse-native product analytics alongside revenue and marketing data.',
    usefulFor: 'Product analytics, user behavior analysis, funnel and retention metrics, A/B test analysis, product-led growth measurement',
    docsUrl: 'https://fivetran.com/docs/connectors/applications/amplitude',
    tables: [
      { name: 'EVENT', whatContains: 'Every tracked user event — event type, timestamp, user ID, device, session, OS, country, and JSON event/user properties', whyMatters: 'The core table for all product analytics. Each row is a single user action. Powers funnels, retention, feature adoption, and engagement analysis.', keyCallouts: 'Event volume can be massive — millions of rows per day for active products. event_properties and user_properties are JSON columns that need parsing in SQL. Each event is a MAR row.' },
      { name: 'USER', whatContains: 'User profiles with user ID, device IDs, platforms, country, last seen date, and user properties', whyMatters: 'Links event activity to individual users for cohort analysis, LTV modeling, and segmentation', keyCallouts: 'Users can have multiple device IDs. The user_properties JSON column contains custom attributes set by the product team. Join to EVENT on user_id.' },
      { name: 'MERGE_IDS', whatContains: 'Identity resolution records mapping merged user IDs — links anonymous IDs and aliases to canonical user IDs', whyMatters: 'Critical for accurate unique user counts. Without merge resolution, the same person using multiple devices or logging in later appears as multiple users.', keyCallouts: 'merge_id maps to the merged (alias) user. Use this table to deduplicate users in warehouse queries. Ignore it and you\'ll double-count users.' },
      { name: 'EVENT_TYPE', whatContains: 'Catalog of all event types defined in the Amplitude project — event name, display name, description, status (active, hidden, deleted)', whyMatters: 'Reference table for understanding what events exist and which are actively tracked. Useful for documentation and data governance.', keyCallouts: 'Hidden or deleted event types may still have historical EVENT rows. Use this table to filter to active events only.' }
    ],
    knownIssues: [
      { category: 'Data Integrity', title: 'Event Volume Drives MAR — The #1 Cost Conversation', preview: 'Millions of events per day can create massive MAR bills', rootCause: 'Amplitude tracks every user interaction as a discrete event. A moderately active product with 100K daily users easily generates 5-10M events/day. Every event row synced by Fivetran counts as a Monthly Active Row. Unlike CRM connectors where MAR is bounded by customer count, event-based connectors scale with product usage.', impact: 'MAR costs can be 10-100x what the customer expects. A product team that doesn\'t understand MAR will set up the connector and be shocked at the bill. This is the single most common objection when selling Fivetran for product analytics sources.', resolution: 'Size the deal by asking: "How many events per day does your Amplitude project track?" (Check Amplitude\'s Govern page or Plan & Billing for volume). Discuss event filtering — Fivetran can exclude specific event types at the schema level. Consider syncing only high-value events rather than everything. Compare the cost of building and maintaining a custom pipeline vs. Fivetran\'s MAR cost.' },
      { category: 'Data Integrity', title: 'Export API Has Daily Data Availability Lag', preview: 'Events from today may not appear in the warehouse until tomorrow', rootCause: 'Fivetran uses Amplitude\'s Export API, which processes and makes event data available in batches. Amplitude guarantees data availability with up to a 24-hour delay after the event occurs. Fivetran syncs what\'s available, so there\'s an inherent lag.', impact: 'Teams expecting real-time or near-real-time product analytics in the warehouse will be disappointed. Dashboards showing "today\'s" data will always be incomplete. This matters most for product launches and time-sensitive experiments.', resolution: 'Set expectations during the sales process: Amplitude via Fivetran is for deep analytical workloads (cohort analysis, retention curves, cross-source joins), not real-time dashboards. For real-time needs, use Amplitude\'s native UI. Data typically lands 2-6 hours after events occur, with worst case at 24 hours.' },
      { category: 'Data Integrity', title: 'User Identity Resolution via Merge IDs', preview: 'Users with multiple IDs appear as separate rows without merge resolution', rootCause: 'Amplitude assigns anonymous IDs to users before login. Once a user identifies themselves (signs up, logs in), Amplitude merges the anonymous ID with the known user ID. This merge is tracked in the MERGE_IDS table but is NOT automatically applied to the EVENT table — each event retains the user_id it was originally logged with.', impact: 'Querying EVENT by user_id without resolving merges will undercount unique users and break funnel/retention analysis. A user who browsed anonymously then signed up looks like two users.', resolution: 'Build an identity resolution layer in the warehouse using MERGE_IDS: map every merged_id back to its canonical user_id, then join that mapping to EVENT. This is a standard data modeling step — recommend the customer plan for it during implementation. dbt packages for Amplitude typically handle this.' },
      { category: 'Data Integrity', title: 'Event and User Properties Stored as JSON Columns', preview: 'Custom properties require JSON parsing — not flat columns', rootCause: 'Amplitude allows arbitrary key-value properties on events and users. Fivetran syncs these as JSON string columns (event_properties, user_properties) rather than flattening them into individual columns, because the schema is dynamic and varies per event type.', impact: 'Analysts need to use JSON parsing functions (e.g., JSON_EXTRACT_PATH_TEXT in Snowflake, JSON_EXTRACT in BigQuery) to access individual properties. Non-technical users expecting flat columns will struggle. Query performance can suffer on large JSON columns without materialized views.', resolution: 'Advise customers to plan a dbt or transformation layer that parses high-value properties into flat columns. Identify the top 10-20 properties they care about and create materialized views. This is standard practice for event data in the warehouse.' },
      { category: 'Data Integrity', title: 'Historical Backfill Can Take Days or Weeks', preview: 'Backfilling months or years of event data is slow', rootCause: 'Amplitude\'s Export API returns data in hourly files. Backfilling 12 months of history for a high-volume product means downloading thousands of hourly export files sequentially. Fivetran processes these in order, and large files with millions of events per hour take time to parse and load.', impact: 'Initial sync can take 3-14 days depending on data volume and history depth. The customer won\'t see complete data until the backfill finishes. Incremental syncs start immediately after the latest available data is reached.', resolution: 'During deal scoping, ask how much history they need. If they only need 90 days for active analysis, limit the historical sync depth. For long backfills, set expectations on timeline and coordinate with the data team so they don\'t assume the connector is broken.' },
      { category: 'Data Integrity', title: 'Time Zone Handling Across Events', preview: 'Event timestamps may not align with other data sources', rootCause: 'Amplitude stores event timestamps in UTC by default, but the Amplitude UI displays them in the project\'s configured timezone. Fivetran exports raw UTC timestamps. If the customer\'s other data sources use a different timezone convention, joins on date/time will produce mismatches.', impact: 'Cross-source analytics (e.g., joining Amplitude events with Salesforce activities by date) may show off-by-one-day errors. Marketing attribution windows can shift.', resolution: 'Confirm the Amplitude project timezone setting (Project Settings → General). Apply timezone conversion in the transformation layer if needed. Standardize all event timestamps to UTC in the warehouse for consistent cross-source joins.' },
      { category: 'Data Integrity', title: 'Deleted and Blocked Events Still in Historical Data', preview: 'Events deleted or blocked in Amplitude persist in the warehouse', rootCause: 'When a product team blocks or deletes an event type in Amplitude, it stops future collection but does not retroactively remove historical events. Fivetran has already synced those historical rows and will not delete them from the warehouse.', impact: 'The warehouse may contain event types that the product team considers invalid or deprecated. Reports built on "all events" will include noise from blocked event types.', resolution: 'Use the EVENT_TYPE table to identify blocked or deleted event types. Filter them out in downstream models: WHERE event_type NOT IN (SELECT event_type FROM event_type WHERE deleted = TRUE). Maintain a blocklist in the transformation layer.' },
      { category: 'Setup', title: 'Amplitude Project vs Organization Level Access', preview: 'API keys are scoped to a project, not the entire org', rootCause: 'Amplitude organizations can contain multiple projects (e.g., "Web App", "Mobile App", "Internal Tools"). API credentials are issued per project. A single Fivetran connector syncs one Amplitude project — not the full organization.', impact: 'Customers with multiple Amplitude projects need one Fivetran connector per project. This multiplies MAR and setup effort. An AE who doesn\'t ask about project count during discovery may underestimate deal size.', resolution: 'Discovery question: "How many Amplitude projects do you have, and which ones do you want in the warehouse?" Each project needs a separate Fivetran connector with its own API key and secret key. Factor per-project MAR into deal sizing.' },
      { category: 'Syncs', title: 'Re-Syncs Pull Full Event History', preview: 'Triggering a re-sync reprocesses all historical data', rootCause: 'Because Amplitude\'s Export API provides hourly data files without granular cursor tracking, a re-sync requires re-downloading and re-processing all historical event files from the beginning of the sync window.', impact: 'Re-syncs are expensive (high MAR spike) and slow (same duration as initial backfill). Should only be triggered when absolutely necessary.', resolution: 'Avoid re-syncs unless data integrity issues are confirmed. If a re-sync is needed, coordinate with the customer to do it at the start of a billing cycle to minimize MAR impact. Contact Fivetran support to discuss partial re-sync options.' },
      { category: 'FAQ', title: 'Can I Filter Which Events Fivetran Syncs?', preview: 'Reducing event volume to control MAR', rootCause: 'Fivetran syncs all events from the Amplitude Export API by default. However, you can exclude specific event types at the schema level in Fivetran\'s connector configuration, preventing those events from being loaded into the warehouse.', impact: 'Filtering events is the primary lever for controlling MAR costs. A customer tracking 50 event types but only needing 15 for warehouse analysis can reduce MAR by 70%.', resolution: 'Work with the customer\'s product analytics team to identify which events they actually need in the warehouse vs. which are only used in Amplitude\'s native UI. Exclude high-volume, low-value events (like page_view or heartbeat events) to reduce MAR.' }
    ]
  },

  mixpanel: {
    name: 'Mixpanel',
    icon: 'M',
    iconClass: 'icon-default',
    description: 'Product analytics platform for tracking user engagement, funnels, and experiments',
    whatItDoes: 'Mixpanel captures user behavior data — events, user profiles, and engagement metrics — to help product teams understand adoption, conversion, and retention. Fivetran syncs raw event data, user profiles, cohort memberships, and funnel snapshots to the data warehouse.',
    usefulFor: 'Product analytics, user engagement tracking, conversion funnel analysis, behavioral segmentation, experiment analysis',
    docsUrl: 'https://fivetran.com/docs/connectors/applications/mixpanel',
    tables: [
      { name: 'EVENT', whatContains: 'Every tracked user event — event name, timestamp, distinct_id, device, browser, OS, geo data, and JSON event properties', whyMatters: 'The foundational table for all product analytics. Each row is a discrete user action. Powers funnel analysis, retention, and feature adoption queries.', keyCallouts: 'Volume can be enormous — millions of rows/day for active products. Properties stored as JSON columns need parsing. Each event row counts toward MAR.' },
      { name: 'USER_PROFILE', whatContains: 'User identity profiles with distinct_id, name, email, first/last seen timestamps, and custom user properties as JSON', whyMatters: 'Links events to known users and enables segmentation by user attributes (plan type, company, role)', keyCallouts: 'Mixpanel\'s People feature must be enabled for this table to populate. User properties are JSON — parse for custom attributes. Join to EVENT on distinct_id.' },
      { name: 'ENGAGE', whatContains: 'User engagement metrics including session counts, last seen timestamps, and computed engagement scores', whyMatters: 'Pre-computed engagement data useful for quickly identifying power users, at-risk users, and activation status', keyCallouts: 'Overlaps with what can be computed from EVENT table, but provides convenient pre-aggregated metrics. Not all Mixpanel plans include this.' },
      { name: 'FUNNEL', whatContains: 'Snapshot data from defined Mixpanel funnels — step names, conversion counts, conversion rates, and date ranges', whyMatters: 'Brings pre-built funnel analysis into the warehouse without re-computing from raw events. Useful for executive dashboards and cross-source reporting.', keyCallouts: 'These are periodic snapshots, not real-time. Funnel definitions must exist in Mixpanel first. Changes to funnel definitions in Mixpanel don\'t retroactively update historical snapshots.' },
      { name: 'COHORT', whatContains: 'Cohort definitions and membership — cohort ID, name, description, and user IDs belonging to each cohort', whyMatters: 'Enables warehouse-side segmentation using the same cohorts defined by the product team in Mixpanel', keyCallouts: 'Cohort membership is snapshotted — users added/removed between syncs won\'t show historical changes. Dynamic cohorts in Mixpanel are exported as static membership lists at sync time.' }
    ],
    knownIssues: [
      { category: 'Data Integrity', title: 'Event Volume Is the Primary MAR Driver', preview: 'High-volume products can generate massive MAR from events alone', rootCause: 'Like all event-based analytics connectors, every Mixpanel event row synced to the warehouse counts as a Monthly Active Row. A product with 500K daily active users might generate 10-50M events/day. MAR scales linearly with product usage, not customer count.', impact: 'MAR costs can exceed expectations by an order of magnitude. Customers comparing Fivetran pricing to their Mixpanel subscription may experience sticker shock. This is the most common cost objection for product analytics connectors.', resolution: 'Ask during discovery: "What\'s your monthly event volume in Mixpanel?" (Check Mixpanel Organization Settings → Plan Details). Discuss filtering strategies — not all events need to be in the warehouse. High-volume, low-signal events (page_viewed, session_start) can often be excluded. Frame the value: warehouse analytics enables cross-source joins that Mixpanel alone can\'t do.' },
      { category: 'Data Integrity', title: 'Raw Data Export vs JQL Reports — Different Data Shapes', preview: 'Fivetran exports raw events, not Mixpanel report outputs', rootCause: 'Mixpanel\'s UI provides computed reports (funnels, retention charts, flows) with pre-applied logic like property grouping, time bucketing, and statistical calculations. Fivetran syncs the raw underlying data — individual events and user profiles — not the rendered report outputs. The FUNNEL table provides snapshots of funnel results, but most data arrives as raw events.', impact: 'Customers expecting their Mixpanel dashboards to appear as-is in the warehouse will be disappointed. Recreating complex Mixpanel reports (especially retention and flow analysis) from raw events requires significant SQL modeling effort.', resolution: 'Set expectations clearly: Fivetran gives you the raw ingredients, not the finished meal. The value is joining product analytics with revenue data, support tickets, and marketing spend — things Mixpanel can\'t do alone. Recommend a dbt modeling layer to recreate key Mixpanel metrics. Point to Mixpanel\'s own warehouse connector alternative if they want report-level data.' },
      { category: 'Data Integrity', title: 'User Identity Management — distinct_id vs $user_id', preview: 'Mixpanel\'s identity model creates complexity in the warehouse', rootCause: 'Mixpanel uses distinct_id as the primary user identifier. Before a user logs in, distinct_id is a random anonymous ID. After login, Mixpanel aliases the anonymous ID to the known $user_id. In Mixpanel\'s original ID management, these are linked via an $identify call. The newer Simplified ID Merge model handles this differently. Fivetran exports distinct_id as-is — it does not resolve aliases.', impact: 'Without identity resolution in the warehouse, the same person appears as multiple users (anonymous + identified). Unique user counts will be inflated. Funnel analysis across the anonymous-to-identified boundary will break.', resolution: 'Ask the customer which identity model they use (Original vs Simplified ID Merge). For Original: use the $identify and $create_alias events in the EVENT table to build a merge mapping. For Simplified: distinct_id should already be the canonical ID. Build an identity resolution model in dbt before any user-level analysis.' },
      { category: 'Data Integrity', title: 'Event Property Schema Evolution', preview: 'New event properties appear without warning, old ones disappear', rootCause: 'Mixpanel allows arbitrary properties on any event — developers can add new properties or change property names at any time without a schema migration. Fivetran syncs properties as JSON columns, so new properties don\'t break the sync, but the warehouse model needs to handle dynamic schemas.', impact: 'dbt models or views that parse specific JSON keys will miss new properties unless updated. Properties that are renamed or removed in the product code will produce nulls for new events while old events retain the old property names.', resolution: 'Implement a schema registry or property catalog in the transformation layer. Periodically audit which properties appear in recent events vs. historical events. Use JSON parsing with fallback/coalesce logic to handle property renames gracefully.' },
      { category: 'Setup', title: 'EU vs US Data Residency Affects API Endpoint', preview: 'Wrong data residency setting causes empty syncs or auth failures', rootCause: 'Mixpanel offers US (mixpanel.com) and EU (eu.mixpanel.com) data residency. The Fivetran connector must be configured with the correct region — it determines which API endpoint Fivetran calls. Using the US endpoint for an EU project (or vice versa) returns either empty results or authentication errors.', impact: 'Connector appears to work but returns no data, or fails authentication. This can waste hours of troubleshooting if the data residency mismatch isn\'t identified quickly.', resolution: 'During setup, ask: "Is your Mixpanel data hosted in the US or EU?" Check in Mixpanel under Organization Settings → Data Residency. Configure the Fivetran connector with the matching region. If the customer recently migrated between regions, they may need to re-create the connector.' },
      { category: 'Setup', title: 'Project-Level API Credentials', preview: 'Credentials are per Mixpanel project, not per organization', rootCause: 'Mixpanel API credentials (API Secret for older projects, or Service Account for newer auth) are scoped to a single project. Organizations with multiple Mixpanel projects (e.g., separate projects for web, mobile, internal tools) need one Fivetran connector per project.', impact: 'Multi-project setups multiply connectors and MAR. Customers may not realize they need separate connectors for each project. Under-scoped deal sizing if the AE doesn\'t ask about project count.', resolution: 'Discovery question: "How many Mixpanel projects do you have?" Each project needs its own Fivetran connector and API credentials. For newer Mixpanel orgs, recommend using Service Accounts (Project Settings → Service Accounts) instead of the legacy API Secret.' },
      { category: 'Data Integrity', title: 'Cohort and Funnel Data as Snapshots, Not Incremental', preview: 'COHORT and FUNNEL tables show point-in-time snapshots only', rootCause: 'Mixpanel cohorts and funnels are dynamic calculations in the UI. When Fivetran syncs these tables, it captures the current state — which users are in a cohort now, what the funnel conversion rate is now. Historical states are not preserved.', impact: 'Cannot trend cohort membership over time or see how funnel conversion rates changed week-over-week from the COHORT/FUNNEL tables alone. Historical analysis requires recomputing from raw EVENT data.', resolution: 'For trending cohort/funnel metrics over time, build the analysis from the raw EVENT table rather than relying on COHORT/FUNNEL snapshots. If snapshot history is needed, implement a snapshot strategy in the warehouse (e.g., dbt snapshots) to capture COHORT/FUNNEL state at each sync.' },
      { category: 'Data Integrity', title: 'Lookup Tables May Not Sync Automatically', preview: 'Mixpanel lookup tables require special handling', rootCause: 'Mixpanel lookup tables (used to enrich events with additional metadata like mapping product_id to product_name) are a separate feature from core events and user profiles. Their availability via the export API depends on the Mixpanel plan and how they were configured.', impact: 'Enrichment data that product teams rely on in Mixpanel\'s UI may not be available in the warehouse, leading to incomplete analysis.', resolution: 'Check if the customer uses lookup tables in Mixpanel and whether they\'re included in the Fivetran sync. If not available, the enrichment data can be maintained as a separate reference table in the warehouse and joined to events during transformation.' },
      { category: 'Syncs', title: 'Historical Data Export Latency', preview: 'Backfilling months of history takes time due to API rate limits', rootCause: 'Mixpanel\'s raw data export API returns events in daily batches. For large projects, each day\'s export can contain millions of events. API rate limits throttle how fast Fivetran can pull historical data, and Mixpanel\'s export can take minutes per day of data for high-volume projects.', impact: 'Initial sync for a high-volume project with 12+ months of history can take 5-14 days. Incremental syncs after initial load are much faster (typically completing within an hour).', resolution: 'Set timeline expectations during deal scoping. If the customer only needs recent data for active analysis, limit historical sync to 90-180 days. Plan the initial sync for a period when the data team can wait for backfill to complete before building dashboards.' }
    ]
  },

  segment: {
    name: 'Segment',
    icon: 'S',
    iconClass: 'icon-default',
    description: 'Customer data platform for collecting, routing, and unifying user event data across sources',
    whatItDoes: 'Segment is a customer data platform (CDP) that collects user interaction data from websites, apps, and servers, then routes it to destinations like analytics tools, warehouses, and marketing platforms. Fivetran can sync data FROM Segment when Segment is configured as a source, pulling in the standardized event types that Segment has already collected and normalized.',
    usefulFor: 'Customer data platform analytics, cross-platform user tracking, event stream consolidation, identity resolution',
    docsUrl: 'https://fivetran.com/docs/connectors/applications/segment',
    tables: [
      { name: 'IDENTIFIES', whatContains: 'Identity events — user ID, anonymous ID, traits (email, name, company, plan), and timestamp of each identify call', whyMatters: 'Links anonymous visitors to known users. Every identity resolution query starts here. Contains the user traits that define who each person is.', keyCallouts: 'Each identify() call creates a row. Traits are stored as individual columns (unlike Amplitude/Mixpanel JSON). anonymous_id and user_id together form the identity graph.' },
      { name: 'TRACKS', whatContains: 'Custom event tracking — event name, user ID, anonymous ID, timestamp, and event-specific properties as columns', whyMatters: 'The primary behavioral data table. Every track() call from the customer\'s apps lands here. Powers engagement analysis, feature adoption, and conversion tracking.', keyCallouts: 'Segment creates a separate child table for each unique event name (e.g., tracks_order_completed, tracks_signup_started). The parent TRACKS table contains common fields; child tables contain event-specific properties.' },
      { name: 'PAGES', whatContains: 'Page view events — page URL, title, referrer, path, search terms, user ID, anonymous ID, and timestamp', whyMatters: 'Web traffic analysis, content performance, and user journey mapping. Every page() call generates a row.', keyCallouts: 'High-volume table — every page view is a row. Can be the single largest MAR contributor. Consider whether all page views need to be in the warehouse.' },
      { name: 'SCREENS', whatContains: 'Mobile screen view events — screen name, user ID, anonymous ID, device info, and timestamp', whyMatters: 'Mobile app navigation analytics, screen flow analysis, and mobile engagement tracking', keyCallouts: 'The mobile equivalent of PAGES. Only populated if the customer\'s mobile app uses Segment\'s screen() call. Volume depends on mobile app activity.' },
      { name: 'GROUPS', whatContains: 'Group/account associations — group ID, user ID, group traits (company name, plan, industry), and timestamp', whyMatters: 'B2B account-level analytics. Links individual users to their company/organization. Powers account-based product analytics.', keyCallouts: 'Only populated if the customer uses Segment\'s group() call. Many B2C products don\'t use this. group_id typically maps to the customer\'s internal account/company ID.' }
    ],
    knownIssues: [
      { category: 'Setup', title: 'Fivetran as Segment Warehouse Destination vs Segment as Fivetran Source', preview: 'Critical distinction — two completely different architectures', rootCause: 'There are two ways Segment and Fivetran interact: (1) Segment\'s built-in warehouse destination writes directly to a warehouse without Fivetran involved — this is Segment\'s own feature and Fivetran is not in the picture. (2) Fivetran\'s Segment connector pulls data FROM Segment\'s APIs as a source. These are fundamentally different architectures. Customers often confuse the two.', impact: 'If a prospect already uses Segment\'s warehouse destination, they may not need Fivetran for Segment data at all — Segment is already loading it. The Fivetran value proposition shifts to unifying Segment data with non-Segment sources (CRM, billing, support) in a managed pipeline. Pitching "we\'ll load your Segment data" to someone who already has Segment Warehouses is a misread.', resolution: 'Discovery question: "Are you already using Segment\'s warehouse destination?" If YES, the Fivetran play is unifying other sources alongside Segment data, not replacing Segment\'s own loading. If NO, Fivetran can serve as a reliable, managed pipeline for Segment data with better schema management, transformation support, and monitoring.' },
      { category: 'Data Integrity', title: 'Event Volume and MAR Impact from track() and page() Calls', preview: 'Segment event volume can produce very high MAR', rootCause: 'Segment captures every track(), page(), screen(), and identify() call as a separate row. For a product with rich instrumentation, this easily reaches millions of events per day. PAGES alone can dominate MAR — every page view on a high-traffic website generates a row.', impact: 'MAR can be extremely high for well-instrumented Segment sources. A prospect may have 500M events/month flowing through Segment. If all of that flows to Fivetran, the MAR bill will be substantial.', resolution: 'Ask: "What\'s your monthly event volume in Segment?" (Check Segment workspace under Settings → Usage & Billing). Discuss which event types to include — PAGES and SCREENS are often high-volume, low-value for warehouse use cases. The TRACKS table with specific events (signup, purchase, feature_used) is usually the highest-value, lowest-volume option.' },
      { category: 'Data Integrity', title: 'Anonymous ID to User ID Stitching', preview: 'Connecting anonymous browsing to identified users requires modeling', rootCause: 'Before a user logs in, Segment assigns an anonymous_id. After login, an identify() call associates the anonymous_id with a user_id. Both IDs appear in TRACKS, PAGES, and SCREENS. Fivetran syncs both columns as-is — it does not merge them.', impact: 'Without identity stitching in the warehouse, pre-login and post-login activity for the same person appear as separate users. Funnel analysis that spans anonymous-to-identified (e.g., "landed on pricing page → signed up") will break.', resolution: 'Build an identity stitching model using the IDENTIFIES table: map each anonymous_id to its resolved user_id. Apply this mapping to TRACKS, PAGES, and SCREENS. dbt packages for Segment typically include identity stitching. This is a standard and expected step.' },
      { category: 'Data Integrity', title: 'Per-Source Schema Separation', preview: 'Each Segment source generates its own schema in the warehouse', rootCause: 'Segment treats each source (website, iOS app, Android app, server) as an independent data stream. When using Segment\'s native warehouse destination, each source writes to its own schema (e.g., website.tracks, ios_app.tracks). Fivetran follows a similar pattern — each Segment source connector creates a separate schema.', impact: 'Cross-platform analytics (web + mobile) requires unioning tables across schemas. A user who visits the website and then uses the mobile app will have events split across two schemas with different anonymous IDs.', resolution: 'Plan for a unification layer in the warehouse that unions TRACKS, PAGES/SCREENS, and IDENTIFIES across sources. Apply cross-platform identity resolution using user_id (which should be consistent across sources after login). This is a core value-add of having the data in a warehouse vs. Segment\'s native tools.' },
      { category: 'Data Integrity', title: 'Track Call Properties Stored as Flat Columns, Not JSON', preview: 'Segment child tables have individual property columns — but schema changes are frequent', rootCause: 'Unlike Amplitude/Mixpanel which store properties as JSON, Segment creates dedicated child tables for each event type (e.g., tracks_order_completed) with individual columns for each property. This is more analyst-friendly but creates a schema evolution challenge: when developers add new properties to a track() call, new columns appear. Renamed properties create new columns and orphan old ones.', impact: 'Schema drift is common. Tables may accumulate dozens of columns over time, many of which are sparsely populated. Column naming can be inconsistent if different developers instrument the same event differently.', resolution: 'Implement a Segment Tracking Plan (Protocols) to enforce a consistent schema. In the warehouse, create curated views that select only the columns analysts actually need. Monitor for schema changes using Fivetran\'s schema change notifications.' },
      { category: 'Data Integrity', title: 'Segment Protocols Validation Doesn\'t Affect Fivetran', preview: 'Events blocked by Protocols may still reach the warehouse through other paths', rootCause: 'Segment Protocols can validate and block non-conforming events before they reach destinations. However, if the customer has Segment configured to send events to the warehouse AND to Fivetran through different paths, Protocols enforcement may differ. Also, Protocols violations logged as events themselves can add noise.', impact: 'Data quality rules enforced in Segment may not fully translate to the warehouse if the data path bypasses Protocols enforcement.', resolution: 'Confirm how Segment Protocols is configured and whether it applies to the Fivetran integration path. If using Fivetran as the warehouse destination rather than Segment\'s native one, ensure Protocols is applied before events reach Fivetran.' },
      { category: 'Setup', title: 'Warehouse Destination Schema Naming Conventions', preview: 'Schema and table naming from Segment may conflict with existing warehouse objects', rootCause: 'Segment generates schema names based on the source name in the Segment workspace and table names based on event names. Special characters in event names are converted to underscores. Long event names may be truncated. If the customer already has tables or schemas with similar names, conflicts can occur.', impact: 'Naming conflicts can cause confusion or errors in the warehouse. Analysts may join the wrong tables. Queries referencing Segment data need to use the correct schema prefix.', resolution: 'Review the Segment source names before setup and choose clear, distinct naming. In Fivetran, configure the destination schema name to avoid conflicts with existing schemas. Document the naming convention for the data team.' }
    ]
  },

  braze: {
    name: 'Braze',
    icon: 'B',
    iconClass: 'icon-default',
    description: 'Customer engagement platform for cross-channel messaging — push, email, in-app, SMS, and webhooks',
    whatItDoes: 'Braze powers customer engagement across push notifications, email, in-app messages, SMS, and content cards. Fivetran syncs campaign metadata, canvas (journey) structures, user profiles, engagement events, and message-level performance data to enable cross-channel marketing analytics in the warehouse.',
    usefulFor: 'Marketing analytics, campaign performance measurement, push/email/in-app engagement tracking, customer journey analysis, lifecycle marketing optimization',
    docsUrl: 'https://fivetran.com/docs/connectors/applications/braze',
    tables: [
      { name: 'CAMPAIGN', whatContains: 'Campaign metadata — campaign ID, name, channel (push, email, SMS), tags, created/updated dates, conversion events, and status (active, draft, archived)', whyMatters: 'The starting point for campaign performance analysis. Links to engagement events to measure effectiveness. Tags enable grouping by business initiative, team, or product.', keyCallouts: 'Campaigns can have multiple variants (A/B tests). Each variant generates separate engagement events. Use campaign tags for business-level rollups.' },
      { name: 'CANVAS', whatContains: 'Canvas (journey) definitions — canvas ID, name, tags, entry schedule, steps, and branching logic metadata', whyMatters: 'Canvases are Braze\'s multi-step journeys (onboarding flows, re-engagement sequences, lifecycle campaigns). Understanding canvas structure is essential for journey analytics.', keyCallouts: 'Canvases are more complex than campaigns — they include steps, branches, delays, and decision splits. Canvas-level metrics aggregate across all steps. Use CANVAS_STEP for step-level granularity.' },
      { name: 'USER', whatContains: 'User profiles — external user ID, email, push tokens, custom attributes, last active date, country, language, and subscription states', whyMatters: 'Central user table for segmentation, reachability analysis (who can you email, push, SMS), and customer profile enrichment', keyCallouts: 'Custom attributes are additional columns. Push token presence indicates push reachability. Subscription state (opted_in, subscribed, unsubscribed) is critical for compliance reporting.' },
      { name: 'EVENT', whatContains: 'Custom events tracked in Braze — event name, user ID, timestamp, and event properties. These are behavioral events sent from the app to Braze.', whyMatters: 'Product behavior data used by Braze for triggering campaigns and segmentation. Enables join between what users do (events) and what messages they receive (engagement).', keyCallouts: 'Different from message engagement events. These are product-side events (e.g., "added_to_cart", "completed_onboarding") that Braze uses for targeting. Volume can be very high.' },
      { name: 'MESSAGE_ENGAGEMENT', whatContains: 'Message-level engagement events — sends, deliveries, opens, clicks, bounces, unsubscribes, conversions — by channel (email, push, SMS, in-app), campaign, canvas step, user, and timestamp', whyMatters: 'The core performance measurement table. Every marketing KPI (delivery rate, open rate, click rate, conversion rate) is computed from this data.', keyCallouts: 'Each engagement type (send, open, click, bounce) is a separate row. Channel-specific metrics: email has opens/clicks, push has direct_opens, SMS has deliveries. Join to CAMPAIGN or CANVAS for attribution.' }
    ],
    knownIssues: [
      { category: 'Setup', title: 'Currents Data Streaming Setup — S3 or GCS Required', preview: 'High-volume engagement data requires a Currents export to cloud storage', rootCause: 'Braze offers two data access paths: the REST API (for user profiles, campaign metadata, and limited event data) and Currents (a real-time data streaming product that exports engagement events to S3, GCS, or other destinations). For high-volume engagement data, Fivetran\'s Braze connector may use Currents exports as the data source rather than polling the REST API directly. Setting up Currents requires configuring an S3 bucket or GCS bucket as an intermediary.', impact: 'Setup is more complex than typical API connectors. The customer needs to provision cloud storage, configure Currents in Braze (requires Braze Currents subscription — it\'s an add-on), and grant Fivetran read access to the storage bucket. This can add days to the deployment timeline.', resolution: 'During discovery, ask: "Do you have Braze Currents enabled?" If not, they may need to purchase it from Braze — this is a paid add-on. Help the customer provision the S3/GCS bucket and configure Currents before setting up the Fivetran connector. Fivetran\'s setup guide walks through the bucket permissions needed.' },
      { category: 'Data Integrity', title: 'Event Volume Is Extremely High for Active Senders', preview: 'Engagement events generate millions of rows per day for large senders', rootCause: 'Every message sent, delivered, opened, clicked, bounced, and unsubscribed generates a separate event row. A company sending 10M emails/month generates at minimum 10M send events, plus 2-5M open events, plus 500K-1M click events, plus bounces and unsubscribes. Add push notifications, SMS, and in-app messages and the total easily reaches 20-50M events/month.', impact: 'MAR from Braze engagement data alone can be substantial. Customers who send at high volume (e-commerce with daily promotions, media with breaking news pushes) will see especially high MAR. This is the primary cost conversation for Braze connectors.', resolution: 'Size the deal by asking: "How many messages do you send per month across all channels?" Multiply by ~2-3x for engagement events (sends + opens + clicks). Discuss filtering — do they need every send event, or only opens, clicks, and conversions? Fivetran can filter at the schema level to exclude high-volume, low-value event types (e.g., send events if only engagement matters).' },
      { category: 'Data Integrity', title: 'Campaign vs Canvas Distinction in Reporting', preview: 'Campaigns and canvases are separate objects with different attribution models', rootCause: 'Braze has two messaging constructs: Campaigns (single-step messages with optional variants) and Canvases (multi-step journeys with branching logic). Engagement events reference either a campaign_id OR a canvas_step_id, never both. Attribution and performance analysis must account for this split.', impact: 'Reports that only look at CAMPAIGN performance will miss all canvas-driven engagement — and for many mature Braze customers, canvases drive the majority of messaging volume. A "total email performance" dashboard must union campaign and canvas data.', resolution: 'Build separate models for campaign performance and canvas performance, then union them for holistic reporting. Use the engagement event\'s campaign_id vs canvas_step_id to determine the source. Ask the customer: "Do you primarily use campaigns, canvases, or both?" to understand their messaging architecture.' },
      { category: 'Data Integrity', title: 'Message Engagement Types Vary by Channel', preview: 'Email, push, SMS, and in-app each have different engagement metrics', rootCause: 'Engagement events are channel-specific: Email has send, deliver, open, click, bounce, spam, unsubscribe. Push has send, open (direct_open vs influenced_open). SMS has send, deliver, short_link_click. In-app has impression and click. Not all event types exist for all channels.', impact: 'A single "engagement rate" metric doesn\'t work across channels. Comparing email open rate to push open rate is an apples-to-oranges comparison. Dashboards need channel-specific KPI definitions.', resolution: 'Build channel-specific engagement models: email_performance, push_performance, sms_performance. Define KPIs per channel (email: open rate, CTR; push: direct open rate; SMS: delivery rate). Only aggregate to a cross-channel view using a normalized metric like "engagement rate" with channel-appropriate definitions.' },
      { category: 'Data Integrity', title: 'User Attribute Custom Fields as Dynamic Schema', preview: 'Custom user attributes create columns that change over time', rootCause: 'Braze allows setting arbitrary custom attributes on user profiles (e.g., "favorite_color", "subscription_tier", "last_purchase_date"). These appear as columns in the USER table. When the product or marketing team adds new custom attributes, new columns appear. Removed attributes persist as null-filled columns.', impact: 'The USER table schema grows over time and may contain many sparsely populated columns. Warehouse schema management becomes complex. Queries selecting * from the USER table may return hundreds of columns.', resolution: 'Work with the customer to identify which custom attributes are critical for warehouse analytics (typically 10-20 out of potentially hundreds). Create a curated user profile view selecting only those columns. Monitor for new attributes periodically.' },
      { category: 'Data Integrity', title: 'Data Retention Policies Limit Historical Access', preview: 'Braze does not retain engagement data indefinitely', rootCause: 'Braze has data retention policies that vary by contract and plan. Event-level engagement data may only be retained for 2 years (or less for some plans). After the retention period, events are purged from Braze\'s systems and are no longer available via API or Currents. User profiles have separate retention rules.', impact: 'If the Fivetran connector is set up after data has already aged out, that historical data is permanently lost. The warehouse will only contain data from the connector start date forward. Year-over-year comparisons may have gaps.', resolution: 'Set up the Fivetran connector as early as possible — the warehouse becomes the long-term archive. Ask the customer: "When did you start using Braze, and what\'s your data retention policy?" If they need historical data beyond Braze\'s retention, check if they have Currents exports to S3 from earlier periods that could be backfilled.' },
      { category: 'Data Integrity', title: 'REST API vs Currents Data Differences', preview: 'Data from the REST API and Currents exports may not match exactly', rootCause: 'Braze\'s REST API provides aggregated campaign/canvas metrics (total sends, opens, clicks) while Currents provides event-level streaming data. Due to timing differences, deduplication logic, and rate limiting, aggregated REST API numbers may not exactly match the sum of event-level Currents data for the same time period.', impact: 'Customers comparing Fivetran warehouse numbers to Braze dashboard numbers may see small discrepancies (typically 1-3%). This creates trust issues with the data pipeline even when the data is correct.', resolution: 'Set expectations: small discrepancies between Braze dashboard and warehouse are normal due to data processing timing and deduplication differences. For official reporting, pick one source of truth (recommend the warehouse for historical analysis, Braze dashboard for real-time monitoring). Document the expected variance range.' },
      { category: 'FAQ', title: 'Do I Need Braze Currents to Use the Fivetran Connector?', preview: 'Currents is needed for event-level engagement data', rootCause: 'The Fivetran Braze connector can pull campaign metadata and user profiles via the REST API without Currents. However, event-level engagement data (individual opens, clicks, sends) at scale requires Currents streaming to cloud storage. The REST API has rate limits that make it impractical for high-volume event export.', impact: 'Customers without Currents get campaign-level aggregates but not event-level engagement data. This limits the depth of analysis possible — no user-level engagement tracking, no per-message performance, no journey-step attribution.', resolution: 'For full value, recommend Braze Currents. If the customer doesn\'t have Currents, set expectations about what data will be available (metadata and aggregates only). Braze Currents pricing is based on data volume — factor this into the total solution cost when positioning.' }
    ]
  },

  outreach: {
    name: 'Outreach',
    icon: 'O',
    iconClass: 'icon-default',
    description: 'Sales engagement platform for managing outbound sequences, calls, and prospect outreach at scale',
    whatItDoes: 'Outreach orchestrates multi-channel sales engagement — email sequences, phone tasks, LinkedIn touches, and meeting scheduling. Fivetran syncs prospect records, sequence configurations, email/call activities, and account data so revenue teams can measure outbound effectiveness end to end.',
    usefulFor: 'Sales engagement analytics, sequence effectiveness, rep productivity, outbound pipeline attribution, email/call activity tracking',
    docsUrl: 'https://fivetran.com/docs/connectors/applications/outreach',
    tables: [
      { name: 'PROSPECT', whatContains: 'All prospect records with email, title, company, stage, owner, tags, custom fields, and engagement timestamps', whyMatters: 'The core outbound object — every sequence, email, and call links back to a prospect. Essential for funnel analysis and rep workload distribution.', keyCallouts: 'Prospects are NOT the same as CRM contacts/leads. Deduplication against Salesforce requires matching on email or external CRM ID. prospect stage tracks Outreach-specific lifecycle, not CRM stage.' },
      { name: 'SEQUENCE', whatContains: 'Sequence definitions — name, owner, step count, enabled/disabled status, tags, and share settings', whyMatters: 'Sequences are the playbooks reps follow. Comparing sequence performance reveals which messaging and cadence patterns drive meetings.', keyCallouts: 'A sequence can be shared, cloned, or private. Use enabled field to filter active sequences. step_count doesn\'t tell you step types — join SEQUENCE_STEP for email vs call vs task breakdown.' },
      { name: 'SEQUENCE_STATE', whatContains: 'Per-prospect sequence enrollment — state (active, finished, bounced, opted_out), step number, and timestamps', whyMatters: 'The bridge between sequences and prospects. Shows where each prospect is in the sequence and how they exited — the key table for conversion funnel analysis.', keyCallouts: 'State values: active, paused, finished, bounced, opted_out, failed. A "finished" state does NOT mean a meeting was booked — it means all steps completed. Join with MAILING for reply data.' },
      { name: 'MAILING', whatContains: 'Individual emails sent — subject, body preview, delivered/opened/clicked/replied/bounced timestamps, and tracking status', whyMatters: 'Email-level engagement data powers open rates, reply rates, and A/B testing. Shows exactly which messages resonate.', keyCallouts: 'Open tracking depends on pixel loading — privacy tools (Apple MPP, Hey) inflate open rates. Reply detection is server-side and more reliable. bounced_at vs delivered_at distinguishes deliverability issues.' },
      { name: 'ACCOUNT', whatContains: 'Account (company) records with name, domain, industry, owner, custom fields, and CRM mapping', whyMatters: 'Groups prospects by company for account-based outreach analytics and territory management', keyCallouts: 'Outreach accounts are often synced from the CRM but can diverge. Check external_id mapping to Salesforce Account ID for reconciliation.' }
    ],
    knownIssues: [
      { category: 'Setup', title: 'OAuth Re-Authentication Required Periodically', preview: 'Connector disconnects and requires manual re-auth', rootCause: 'Outreach OAuth refresh tokens can expire or be revoked when the authenticating user changes their password, an admin revokes the integration, or the Outreach org\'s security policies enforce token rotation. Unlike some connectors, Outreach does not issue long-lived refresh tokens.', impact: 'Sync stops silently until someone re-authenticates in Fivetran. If not monitored, data gaps accumulate — especially problematic for reps who rely on daily activity reports.', resolution: 'Use a service account (not a personal rep account) for authentication. Set up Fivetran sync failure alerts in Slack or email. When re-auth is needed: Fivetran dashboard → Outreach connector → Setup → Re-Authorize. Consider documenting the service account credentials in a shared vault.' },
      { category: 'Data Integrity', title: 'Sequence Performance Data Lacks Step-Level Granularity', preview: 'Aggregate sequence metrics don\'t break down by individual step', rootCause: 'Outreach\'s API provides engagement data (opens, clicks, replies) at the mailing level, but tying those back to specific sequence steps requires joining MAILING → SEQUENCE_STATE → SEQUENCE_STEP. The connector does not provide a pre-aggregated "step performance" view.', impact: 'Building a "which step in the sequence drives the most replies?" analysis requires multi-table joins. Non-technical stakeholders may struggle to build this themselves.', resolution: 'Build a materialized view joining MAILING to SEQUENCE_STEP via sequence_state_id and step_number. Pre-calculate step-level reply rates in dbt or your transformation layer. This is a great value-add to offer during implementation.' },
      { category: 'Data Integrity', title: 'Prospect vs CRM Contact/Lead Deduplication', preview: 'Outreach prospects create duplicates when joined with Salesforce data', rootCause: 'Outreach maintains its own prospect records separate from Salesforce contacts/leads. While Outreach can sync with a CRM, the mapping is via external_id on the prospect — and this field may be null for manually created prospects or prospects added via CSV import.', impact: 'Joining Outreach prospects to Salesforce contacts/leads without dedup logic produces inflated counts. Pipeline attribution can double-count if both systems claim credit.', resolution: 'Join on prospect.external_id = salesforce.contact.id (or lead.id). For prospects without external_id, fall back to email matching. Build a unified person model in your warehouse that reconciles both sources. Flag unmatched prospects for CRM hygiene review.' },
      { category: 'Data Integrity', title: 'Email Open Tracking Inflated by Privacy Tools', preview: 'Open rates appear artificially high due to Apple MPP and email privacy', rootCause: 'Outreach tracks email opens via a tracking pixel. Apple Mail Privacy Protection (MPP), Hey.com, and corporate email proxies pre-fetch images, triggering false opens. This is an industry-wide issue affecting all email tracking, not specific to Fivetran.', impact: 'Open rates are unreliable as a performance metric — they can show 80-90%+ when true opens are much lower. Reps and managers relying on open rates for coaching get misleading signals.', resolution: 'De-emphasize open rates in dashboards. Focus on reply rates (server-side, not affected by privacy tools) and meeting-booked rates as primary engagement metrics. If open data is needed, segment by recipient email domain to identify which domains are inflating rates (e.g., icloud.com, me.com).' },
      { category: 'Syncs', title: 'API Rate Limits (10,000 Requests/Hour)', preview: 'Large Outreach instances may hit API throttling', rootCause: 'Outreach enforces a rate limit of 10,000 API requests per hour. Organizations with tens of thousands of prospects, high email volume, or many sequences can exceed this during sync, especially during initial historical sync.', impact: 'Sync duration extends significantly — what should take 30 minutes may take 3-4 hours. In extreme cases, syncs fail and retry on the next cycle, creating data freshness gaps.', resolution: 'Fivetran handles rate limiting with automatic backoff and retry. For initial sync of large instances, expect 6-12 hours. Reduce sync frequency if daily data is sufficient. Disable tables not needed (e.g., TASK, TEMPLATE) to reduce API calls per sync.' },
      { category: 'Data Integrity', title: 'Call Recording and Voicemail Data Not Synced', preview: 'Phone call metadata syncs but recordings and transcripts do not', rootCause: 'Outreach\'s API provides call metadata (duration, disposition, direction, prospect) but does not expose call recording audio files or transcription text via the standard API endpoints that Fivetran uses.', impact: 'Call analytics cover volume and outcomes but not content. Teams wanting to analyze talk tracks or coaching moments won\'t find that data in the warehouse.', resolution: 'Use call metadata (duration, disposition) for productivity analytics. For recording/transcript analysis, integrate directly with Outreach\'s voice provider (e.g., Outreach Kaia, Gong, Chorus) via their own connectors. Fivetran has connectors for Gong and other conversation intelligence tools.' },
      { category: 'Data Integrity', title: 'Custom Field Mapping Requires Schema Configuration', preview: 'Custom fields on prospects and accounts may not sync by default', rootCause: 'Outreach allows custom fields on prospects, accounts, and other objects. These fields appear in the API response but may be nested in a custom_fields JSON object rather than as top-level columns, depending on the connector version.', impact: 'Business-critical custom data (e.g., industry vertical, lead score, SDR assignment) may be missing from analyst queries if they don\'t know to parse the custom_fields column.', resolution: 'Check the connector schema for custom_fields columns. If present as JSON, build parsing logic in your transformation layer (dbt JSON extraction). If custom fields appear as individual columns, verify all expected fields are enabled in Fivetran\'s schema tab.' },
      { category: 'Syncs', title: 'Activity Data Volume Grows Rapidly', preview: 'Mailing and call tables grow very large over time', rootCause: 'Every email sent, opened, clicked, and replied-to generates rows in the MAILING table. A 50-rep team sending 100 emails/day creates 5,000 mailing records daily — nearly 2M per year. Call records add further volume.', impact: 'MAR consumption increases steadily. Warehouse storage and query costs grow. Initial sync of a 2+ year Outreach instance can be very large.', resolution: 'Set expectations during deal sizing: estimate MAR as (daily_emails × 365) + (daily_calls × 365) + prospect_count. Consider limiting historical sync depth if only recent activity is needed. Archive or partition older activity data in the warehouse.' }
    ]
  },

  salesloft: {
    name: 'Salesloft',
    icon: 'S',
    iconClass: 'icon-default',
    description: 'Sales engagement platform for cadences, email, calling, and revenue workflow orchestration',
    whatItDoes: 'Salesloft powers structured sales outreach through cadences (multi-step sequences), integrated dialing, email tracking, and deal intelligence. Fivetran syncs person records, cadence configurations, email and call activities, and CRM sync status for complete sales engagement analytics.',
    usefulFor: 'Sales engagement analytics, cadence performance, rep activity tracking, outbound pipeline metrics, coaching insights',
    docsUrl: 'https://fivetran.com/docs/connectors/applications/salesloft',
    tables: [
      { name: 'PERSON', whatContains: 'All person (prospect/contact) records — email, name, title, company, owner, tags, custom fields, CRM sync status, and do-not-contact flags', whyMatters: 'The core outbound record. Every cadence enrollment, email, and call ties back to a person. Essential for funnel analysis, territory reporting, and activity attribution.', keyCallouts: 'Salesloft "person" maps to Salesforce "lead" or "contact" — use crm_id field for matching. do_not_contact flag must be respected in any outreach analytics to avoid compliance issues.' },
      { name: 'CADENCE', whatContains: 'Cadence definitions — name, owner, step count, team vs personal visibility, archived status, and tags', whyMatters: 'Cadences are structured outreach playbooks. Analyzing cadence-level performance reveals which sequences, messaging, and timing drive the most meetings.', keyCallouts: 'Salesloft calls them "cadences" while Outreach calls them "sequences" — same concept. team_cadence vs personal_cadence distinction matters for benchmarking. Archived cadences still have historical data.' },
      { name: 'CADENCE_MEMBERSHIP', whatContains: 'Per-person cadence enrollment — current step, status (active, completed, removed), added/completed timestamps', whyMatters: 'The join table between people and cadences. Shows drop-off rates per step, completion rates, and why people exited (bounced, replied, removed by rep).', keyCallouts: 'Status values include: active, bounced, completed, pending_removal. "completed" means all steps finished — not that a meeting was booked. Join with PERSON and CADENCE for full context.' },
      { name: 'EMAIL', whatContains: 'Individual emails sent — subject, body snippet, status (sent, delivered, bounced), open/click/reply tracking, and send timestamp', whyMatters: 'Email-level engagement data is the foundation for reply rate analysis, A/B testing, and identifying top-performing messaging.', keyCallouts: 'Open tracking is pixel-based and increasingly unreliable (Apple MPP). Reply and bounce data is server-side and trustworthy. personalization_score indicates template vs custom content ratio.' },
      { name: 'CALL', whatContains: 'Phone call records — duration, disposition (connected, voicemail, no_answer), direction, recording_url reference, and sentiment', whyMatters: 'Call analytics drive dialing strategy optimization and rep coaching. Connect rates by time of day and disposition patterns reveal best calling windows.', keyCallouts: 'Call dispositions are customizable per org — values vary. sentiment field (if populated) is Salesloft\'s AI-generated call sentiment, not a universal standard. recording_url may be null if recordings are disabled.' }
    ],
    knownIssues: [
      { category: 'Setup', title: 'OAuth Token Management and Expiry', preview: 'Connector requires periodic re-authentication', rootCause: 'Salesloft OAuth tokens have a finite lifespan. When the authenticating user\'s password changes, their account is deactivated, or an admin revokes the integration in Salesloft\'s Connected Apps settings, the refresh token becomes invalid and sync stops.', impact: 'Silent sync failure until re-authenticated. Data gaps accumulate, and activity reports go stale without alerting end users who consume dashboards downstream.', resolution: 'Authenticate with a dedicated service account, not an individual rep\'s credentials. Enable Fivetran sync failure notifications. Re-auth path: Fivetran → Salesloft connector → Setup → Re-Authorize. Document the service account in your team\'s credential manager.' },
      { category: 'Data Integrity', title: 'Cadence vs Sequence Terminology Mapping to CRM', preview: 'Salesloft "cadences" don\'t map 1:1 to CRM campaign or opportunity stages', rootCause: 'Salesloft uses "cadence" for structured outreach, while Salesforce uses "campaign" for marketing and "opportunity stage" for sales. There\'s no native link — Salesloft cadence completions don\'t automatically update CRM fields unless the customer has configured Salesloft-Salesforce sync rules.', impact: 'Pipeline attribution is broken by default. Marketing and sales teams each claim credit for meetings without a unified view. Analysts trying to join Salesloft and Salesforce data face a terminology and schema mismatch.', resolution: 'Build a bridge table: Salesloft person.crm_id → Salesforce contact.id/lead.id. Map cadence completions to Salesforce campaign membership or task records. Many customers use Salesloft\'s native CRM sync to log activities as Salesforce tasks — check if that\'s enabled before building custom attribution.' },
      { category: 'Data Integrity', title: 'Person Record Deduplication Across Systems', preview: 'Same person exists in Salesloft, Salesforce, and marketing automation with different IDs', rootCause: 'Salesloft maintains its own person records separate from the CRM. People can be added to Salesloft via CSV import, manual entry, or CRM sync — leading to duplicates when the same person exists under different email addresses or when CRM sync creates a new Salesloft record instead of matching.', impact: 'Activity metrics are split across duplicate records. Rep effort appears lower than reality. Cadence effectiveness is diluted if the same person is enrolled from two records.', resolution: 'Use crm_id on the Salesloft PERSON table to join with Salesforce. For persons without crm_id, match on email_address. Build a deduplication layer in your warehouse that creates a canonical person_id. Flag duplicates for Salesloft admin cleanup.' },
      { category: 'Data Integrity', title: 'Email Open and Click Data Reliability', preview: 'Open rates inflated by email privacy features; click tracking depends on link wrapping', rootCause: 'Like all email platforms, Salesloft\'s open tracking uses a pixel that is pre-fetched by Apple Mail Privacy Protection, corporate email gateways, and privacy-focused email clients. Click tracking requires Salesloft\'s link wrapping to be enabled — if reps manually edit links or use plain text, clicks aren\'t tracked.', impact: 'Open rates are unreliable (often 70-90%+ for Apple Mail recipients). Click rates are reliable only when link wrapping is consistently used. Coaching based on open rates leads to wrong conclusions.', resolution: 'Report on reply rates as the primary engagement metric — replies are server-side and accurate. If open data is used, segment by email domain and flag known privacy-impacted domains. For click tracking, ensure link wrapping is enabled org-wide in Salesloft admin settings.' },
      { category: 'Syncs', title: 'API Pagination Limits on Large Datasets', preview: 'Syncs slow down or time out for orgs with high activity volume', rootCause: 'Salesloft\'s API paginates results and enforces rate limits. Organizations with hundreds of reps and millions of emails/calls accumulated over years can exhaust API limits during sync, especially during the initial historical sync.', impact: 'Initial sync can take 12-24+ hours for large organizations. Incremental syncs may take 1-2 hours for high-volume teams, reducing data freshness for real-time dashboards.', resolution: 'Plan for extended initial sync times. Fivetran handles pagination and rate limiting automatically with retries. If incremental syncs are too slow, consider disabling high-volume tables that aren\'t needed (e.g., STEP, ACTION). Increase sync frequency for critical tables only.' },
      { category: 'Data Integrity', title: 'Call Recording and Transcription Data Availability', preview: 'Call metadata syncs but full recordings and transcripts may not', rootCause: 'Salesloft\'s API provides call metadata (duration, disposition, direction, timestamp) and may include a recording URL, but the actual audio file and AI-generated transcript are not available through the standard API endpoints Fivetran syncs.', impact: 'Quantitative call analytics (volume, connect rates, duration) are available, but qualitative analysis (talk-to-listen ratio, keyword mentions, coaching moments) requires a separate conversation intelligence integration.', resolution: 'Use Salesloft call data for productivity metrics. For conversation intelligence, integrate with Salesloft\'s native Conversations feature or a third-party tool (Gong, Chorus, Clari). Fivetran has connectors for several conversation intelligence platforms.' },
      { category: 'Data Integrity', title: 'Activity Sync with Salesforce — Double Counting Risk', preview: 'Activities logged in both Salesloft and Salesforce can be counted twice', rootCause: 'Salesloft can automatically log emails and calls as Salesforce tasks. If both the Salesloft and Salesforce Fivetran connectors are active, the same activity appears in both datasets — once as a Salesloft email/call and once as a Salesforce task.', impact: 'Activity dashboards that union Salesloft and Salesforce data will double-count rep activities. Pipeline velocity metrics tied to "number of touches" are inflated.', resolution: 'Choose one system of record for activity data. If Salesloft is primary, use Salesloft tables for activity metrics and Salesforce for pipeline/deal data. If both must be used, deduplicate by matching Salesloft email.crm_activity_id to Salesforce task.id.' },
      { category: 'Setup', title: 'Custom Field Access Requires Admin Configuration', preview: 'Custom fields on person records may not sync without explicit enablement', rootCause: 'Salesloft supports custom fields on person and account records. These fields may appear in the API as a nested JSON object or as individual columns depending on the connector version and Salesloft\'s API configuration. Admin-level API access is needed to read custom field definitions.', impact: 'Critical business data stored in custom fields (e.g., persona, lead score, territory) is missing from analytics if the custom fields aren\'t properly exposed in the API response.', resolution: 'Ensure the authenticating user has admin-level access in Salesloft. Check the Fivetran schema tab for custom field columns. If custom fields appear as JSON, parse them in your transformation layer. Verify expected custom fields against Salesloft admin → Custom Fields settings.' }
    ]
  },

  klaviyo: {
    name: 'Klaviyo',
    icon: 'K',
    iconClass: 'icon-default',
    description: 'Email and SMS marketing automation platform built for e-commerce brands',
    whatItDoes: 'Klaviyo powers lifecycle marketing for e-commerce — automated email flows (welcome series, abandoned cart, post-purchase), broadcast campaigns, SMS, and customer segmentation based on behavioral data. Fivetran syncs campaigns, flows, events, metrics, and customer profiles for full marketing attribution.',
    usefulFor: 'E-commerce email/SMS marketing analytics, flow performance, customer segmentation, lifecycle marketing, revenue attribution',
    docsUrl: 'https://fivetran.com/docs/connectors/applications/klaviyo',
    tables: [
      { name: 'CAMPAIGN', whatContains: 'Email and SMS campaign records — name, status (draft, scheduled, sent), subject line, send time, audience list, and performance summary', whyMatters: 'Campaigns are one-time sends (newsletters, promotions, announcements). Performance data here drives send-time optimization and content strategy.', keyCallouts: 'Campaigns are distinct from flows — campaigns are manual/scheduled sends, flows are automated triggers. Status field distinguishes draft, scheduled, sending, sent, and cancelled.' },
      { name: 'FLOW', whatContains: 'Automated flow definitions — name, trigger type (metric, list, segment, date), status (live, draft, manual), and action count', whyMatters: 'Flows drive the majority of Klaviyo-attributed revenue for most e-commerce brands. Abandoned cart, welcome series, and post-purchase flows are the top performers.', keyCallouts: 'A flow can be live but have individual actions (emails) disabled. trigger_type reveals what starts the flow — critical for understanding automation coverage. Flow revenue attribution is Klaviyo\'s key differentiator.' },
      { name: 'METRIC', whatContains: 'Metric definitions — name, integration source (Shopify, custom, Klaviyo), and creation timestamp', whyMatters: 'Metrics define what Klaviyo tracks: Placed Order, Viewed Product, Added to Cart, Opened Email, Clicked Email, etc. They\'re the foundation of all event data.', keyCallouts: 'Metrics come from integrations (Shopify sends "Placed Order") or are Klaviyo-native ("Received Email"). Understanding metrics is key to understanding EVENT data. Custom metrics can be created via API.' },
      { name: 'EVENT', whatContains: 'Individual events — timestamp, metric (what happened), profile (who), properties (details like order value, product name, email subject)', whyMatters: 'The highest-volume and most granular table. Every email open, click, order, product view, and cart addition is an event. Powers all behavioral segmentation and attribution.', keyCallouts: 'EVENT is the #1 MAR driver — every email open/click generates a row. Properties column contains JSON with event-specific data (order total, product ID, etc.). Volume can be enormous for high-traffic stores.' },
      { name: 'PROFILE', whatContains: 'Customer/subscriber profiles — email, phone, name, location, consent status, custom properties, and predictive analytics fields', whyMatters: 'Profiles are the people in the system. Consent status (subscribed, unsubscribed, suppressed) determines who can receive marketing. Custom properties power segmentation.', keyCallouts: 'Klaviyo profiles are created automatically when events are tracked — even anonymous visitors get profiles. Consent fields are critical for compliance (GDPR, CAN-SPAM, TCPA for SMS). Predictive fields (predicted CLV, churn risk) are Klaviyo-calculated.' }
    ],
    knownIssues: [
      { category: 'Syncs', title: 'Event Volume Is the Primary MAR Driver', preview: 'Every email open, click, and e-commerce event generates rows that count toward MAR', rootCause: 'Klaviyo\'s EVENT table records every individual interaction: each email open, each click, each page view, each order. A single campaign sent to 100,000 subscribers with a 30% open rate and 5% click rate generates 100,000 "Received" + 30,000 "Opened" + 5,000 "Clicked" events = 135,000 rows from one campaign. Multiply by daily sends and automated flows.', impact: 'MAR consumption from Klaviyo is often 5-10x higher than customers expect. A mid-size e-commerce brand sending daily emails to 200K subscribers can generate 3-5M events per month. This is the #1 pricing conversation for Klaviyo connectors.', resolution: 'Set expectations during deal sizing: ask about list size, send frequency, and number of active flows. Estimate MAR as (list_size × sends_per_month × 1.5) + (monthly_orders × 3). Consider filtering EVENT to only sync high-value metrics (Placed Order, Started Checkout) and excluding noise metrics (Received Email, Opened Email) if full engagement data isn\'t needed.' },
      { category: 'Data Integrity', title: 'Flow vs Campaign Distinction Is Critical for Attribution', preview: 'Revenue attributed to flows vs campaigns means very different things', rootCause: 'Klaviyo attributes revenue to both flows and campaigns using a click-based and open-based attribution window (typically 5 days for opens, 5 days for clicks). Flow-attributed revenue (e.g., abandoned cart recovery) is often automated recovery of "would-have-been-lost" revenue, while campaign-attributed revenue comes from promotional sends.', impact: 'Mixing flow and campaign revenue inflates marketing ROI. A customer who was going to buy anyway but received an abandoned cart email gets attributed to the flow. Attribution methodology isn\'t always understood by the marketing team.', resolution: 'Separate flow-attributed and campaign-attributed revenue in all dashboards. Build views that distinguish "flow revenue" (retention/recovery) from "campaign revenue" (incremental). Educate stakeholders that Klaviyo\'s attribution is last-touch with a configurable window — it doesn\'t mean the email caused the purchase.' },
      { category: 'Data Integrity', title: 'Profile Custom Properties Stored as JSON', preview: 'Custom profile properties require JSON parsing in the warehouse', rootCause: 'Klaviyo profiles can have unlimited custom properties (e.g., favorite_brand, shoe_size, loyalty_tier). These are stored in a properties JSON column rather than as individual columns. The schema varies per account based on what properties have been set.', impact: 'Analysts need to parse JSON to access business-critical segmentation data. Standard SQL users may struggle with JSON extraction functions. Dashboards can\'t directly reference custom properties without transformation.', resolution: 'Build a dbt model or view that extracts the most commonly used custom properties into dedicated columns. Use your warehouse\'s JSON functions (e.g., JSON_EXTRACT_PATH_TEXT in Redshift, JSON_VALUE in BigQuery). Identify the top 10-15 custom properties with the customer during onboarding and pre-build extractions.' },
      { category: 'Data Integrity', title: 'Metric and Event Relationship Complexity', preview: 'Events reference metrics by ID — human-readable names require joining', rootCause: 'The EVENT table stores a metric_id, not the metric name. To know whether an event is "Placed Order" vs "Viewed Product" vs "Clicked Email," you must join EVENT to METRIC. The METRIC table contains the human-readable name and the integration source.', impact: 'Raw EVENT data is unintelligible without the METRIC join. Analysts who query EVENT alone see only IDs and timestamps without context. Every EVENT query requires a JOIN.', resolution: 'Create a base view or dbt model that pre-joins EVENT with METRIC to include metric_name and integration_name. This should be one of the first transformations built during onboarding. Filter events by metric_name for readability (e.g., WHERE metric_name = \'Placed Order\').' },
      { category: 'Data Integrity', title: 'List and Segment Membership Data', preview: 'Knowing which profiles belong to which lists/segments requires additional tables', rootCause: 'Klaviyo profiles can belong to multiple lists (static) and segments (dynamic, rule-based). List membership is tracked in a LIST_PERSON or similar association table, but segment membership is computed dynamically by Klaviyo and may not be fully represented in the API export.', impact: 'Replicating Klaviyo\'s segmentation logic in the warehouse is difficult. Campaigns targeted to segments can\'t be easily matched to the profiles who received them without list/segment membership data.', resolution: 'Enable list and segment membership tables in the Fivetran schema. For segments, understand that membership is a point-in-time snapshot — it changes as profile data changes. If segment logic needs to be replicated, document the segment rules and rebuild them as warehouse queries.' },
      { category: 'Setup', title: 'API v1 vs v2 Migration Impact', preview: 'Klaviyo\'s API version migration may change available fields and table structures', rootCause: 'Klaviyo has been migrating from API v1/v2 to a new RESTful API. Fivetran\'s connector version determines which API is used. Newer connector versions use the updated API, which may have different field names, pagination behavior, and available endpoints.', impact: 'Customers on older connector versions may see different schemas than documentation describes. Upgrading the connector version may cause schema changes that break existing dashboards and queries.', resolution: 'Check the Fivetran connector version and compare with release notes. If upgrading, review schema changes before applying. Coordinate with the customer\'s analytics team to update downstream queries. Fivetran typically provides migration guides for major connector version changes.' },
      { category: 'Syncs', title: 'Historical Event Data Volume for Established Accounts', preview: 'Initial sync of accounts with years of event history can be extremely large', rootCause: 'E-commerce brands that have used Klaviyo for 3-5+ years accumulate hundreds of millions of events. The initial historical sync must pull all of this data, which can take days and consume significant MAR.', impact: 'Initial sync may take 3-7 days for established accounts. MAR for the first month will be dramatically higher than steady-state due to historical backfill. Warehouse costs spike during initial load.', resolution: 'Warn customers about initial sync duration and MAR impact during deal sizing. Consider limiting historical sync depth (e.g., last 2 years) if older event data isn\'t needed. Phase the sync: start with PROFILE and CAMPAIGN tables, then enable EVENT after the lighter tables are complete.' },
      { category: 'Data Integrity', title: 'Suppressed and Unsubscribed Profile Handling', preview: 'Suppressed profiles still exist in the data but shouldn\'t receive marketing', rootCause: 'When a profile unsubscribes or is suppressed (bounced, spam complaint, manual suppression), Klaviyo keeps the profile record but changes consent fields. The profile\'s event history is preserved. Suppressed profiles can be un-suppressed by the account owner.', impact: 'Profile counts in the warehouse include suppressed/unsubscribed profiles. If analysts count profiles to estimate "marketable audience," they\'ll overstate the reachable list size. Compliance reporting requires accurate suppression tracking.', resolution: 'Always filter on consent status for audience sizing: include only profiles where email consent is "subscribed" (or SMS consent for SMS). Build separate metrics for total profiles vs marketable profiles. Track suppression reasons (unsubscribe, bounce, spam) for deliverability health monitoring.' }
    ]
  },

  pipedrive: {
    name: 'Pipedrive',
    icon: 'P',
    iconClass: 'icon-default',
    description: 'Sales CRM designed for small and mid-size businesses with visual pipeline management',
    whatItDoes: 'Pipedrive is an activity-based selling CRM that emphasizes visual pipeline management, deal tracking, and sales activity logging. Fivetran syncs deals, contacts, organizations, activities, and pipeline configurations for complete sales analytics outside the CRM.',
    usefulFor: 'SMB sales pipeline analytics, deal velocity, sales activity tracking, conversion rate analysis, sales forecasting',
    docsUrl: 'https://fivetran.com/docs/connectors/applications/pipedrive',
    tables: [
      { name: 'DEAL', whatContains: 'All deals with title, value, currency, pipeline, stage, status (open/won/lost), expected close date, owner, and custom fields', whyMatters: 'The core revenue object — every pipeline analysis, forecast, and win/loss review starts here. Pipedrive is deal-centric, making this the most important table.', keyCallouts: 'Status values: open, won, lost, deleted. Won/lost timestamps enable velocity calculations. Custom fields use hash-based column names (see known issues). value field is in the deal\'s currency — multi-currency aggregation requires conversion.' },
      { name: 'PERSON', whatContains: 'Contact records — name, email(s), phone(s), organization link, owner, labels, and custom fields', whyMatters: 'People are linked to deals and activities. Essential for contact-level reporting, communication history, and relationship mapping.', keyCallouts: 'A person can have multiple emails and phones (stored as JSON arrays in some schemas). Linked to ORGANIZATION via org_id. Person can be associated with multiple deals. Labels are Pipedrive\'s tagging system.' },
      { name: 'ORGANIZATION', whatContains: 'Company/account records — name, address, owner, custom fields, and linked people count', whyMatters: 'Groups people and deals by company for account-level analytics, territory management, and firmographic segmentation', keyCallouts: 'Pipedrive organizations are simpler than Salesforce accounts — no parent/child hierarchy by default. Custom fields are the primary way to add industry, size, and other firmographic data.' },
      { name: 'ACTIVITY', whatContains: 'Sales activities — type (call, meeting, email, task, deadline), subject, due date, completion status, duration, and linked deal/person/org', whyMatters: 'Pipedrive\'s philosophy is "activity-based selling" — this table captures every action a rep takes. Rep productivity, activity-to-deal ratios, and coaching insights all come from here.', keyCallouts: 'Activity types are customizable per org — default types include call, meeting, email, task, deadline, lunch. done field (boolean) tracks completion. linked to deal, person, and organization via ID fields.' },
      { name: 'PIPELINE', whatContains: 'Pipeline definitions — name, active/inactive status, deal default visibility, and ordering', whyMatters: 'Companies using multiple pipelines (e.g., new business vs renewals vs partnerships) need pipeline-level filtering for all deal analytics', keyCallouts: 'Each deal belongs to exactly one pipeline. Stages are pipeline-specific — use STAGE table for stage definitions. order_nr determines display sequence in Pipedrive UI.' }
    ],
    knownIssues: [
      { category: 'Data Integrity', title: 'Custom Field Names Use Hash-Based Identifiers', preview: 'Custom fields appear as cryptic column names like "abc123def456"', rootCause: 'Pipedrive assigns internal hash-based IDs to custom fields rather than using human-readable API names (unlike Salesforce\'s "Custom_Field__c" convention). When Fivetran syncs these fields, the destination columns are named with the hash ID, making them unreadable without a mapping reference.', impact: 'Analysts cannot identify custom field columns without consulting a lookup table. Queries are unreadable (e.g., SELECT a1b2c3d4 instead of SELECT industry). Onboarding new analysts is harder because the schema is opaque.', resolution: 'Use Pipedrive\'s API to pull the field definitions (GET /dealFields, /personFields, /organizationFields) which map hash IDs to display names. Build a reference view or dbt seed file that aliases hash columns to readable names. Some teams create a SQL view with column aliases as the first transformation step. This is the #1 usability issue for Pipedrive data — address it proactively during onboarding.' },
      { category: 'Data Integrity', title: 'Deal Stage History Tracking Limitations', preview: 'Historical stage progression requires the DEAL_FLOW table rather than the DEAL table', rootCause: 'The DEAL table shows the current stage only — it doesn\'t track when a deal moved between stages. Stage history (entered/exited timestamps) is in the DEAL_FLOW or STAGE_CHANGE table (depending on connector version). Not all stage transitions are captured if a deal moves quickly through multiple stages in a short time.', impact: 'Deal velocity calculations, stage duration analysis, and pipeline conversion funnels require joining additional tables. Quick stage transitions (e.g., moving through 3 stages in one session) may show as a single jump.', resolution: 'Enable DEAL_FLOW table in the Fivetran schema. Join DEAL → DEAL_FLOW for stage transition timestamps. Build stage duration calculations as: time_in_stage = next_stage_entered_at - current_stage_entered_at. Accept that same-session multi-stage moves may not capture intermediate stages.' },
      { category: 'Data Integrity', title: 'Multiple Pipelines Handling and Filtering', preview: 'Deals from different pipelines mixed together without explicit filtering', rootCause: 'Many Pipedrive orgs use multiple pipelines (e.g., inbound vs outbound, new business vs upsell, different products). All deals are in the same DEAL table with a pipeline_id column. Stages are pipeline-specific — stage_id 1 in Pipeline A is different from stage_id 1 in Pipeline B.', impact: 'Dashboards that don\'t filter by pipeline show blended metrics that are meaningless. Stage-based analysis is wrong if stage names are assumed to be universal across pipelines.', resolution: 'Always join DEAL → PIPELINE and DEAL → STAGE for readable pipeline and stage names. Filter all deal analytics by pipeline_id. Build separate dashboard views per pipeline. When comparing pipelines, normalize stages to a common taxonomy (e.g., Early, Mid, Late, Closed).' },
      { category: 'Data Integrity', title: 'Activity Types Are Custom and Org-Specific', preview: 'Activity type values vary across Pipedrive organizations', rootCause: 'Pipedrive allows orgs to create custom activity types beyond the defaults (call, meeting, email, task, deadline). The activity type field contains string values that differ per org. One org\'s "Site Visit" is another\'s "On-Site Meeting."', impact: 'Cross-org benchmarking is difficult. Dashboards built for one Pipedrive org may break when deployed to another. Activity-type-based metrics require org-specific configuration.', resolution: 'Use the ACTIVITY_TYPE table to get the full list of types per org. Build a mapping layer that normalizes custom types to standard categories (Communication, Meeting, Task, Follow-up). Include activity type configuration in the connector onboarding checklist.' },
      { category: 'Setup', title: 'API Token Authentication (No OAuth)', preview: 'Pipedrive uses API token auth, not OAuth — token management differs', rootCause: 'Pipedrive\'s connector authenticates via an API token (found in Settings → Personal preferences → API in Pipedrive). Unlike OAuth-based connectors, there\'s no refresh token flow — the token is static until regenerated. If the user who generated the token is deactivated, the token stops working.', impact: 'Token is tied to a specific user — their permissions determine what data syncs. If that user is removed from Pipedrive or their role is reduced, sync fails or returns partial data with no clear error.', resolution: 'Create a dedicated "Fivetran Integration" user in Pipedrive with admin permissions. Generate the API token from that user. Document this in the customer\'s integration runbook. If the token needs to be rotated, update it in Fivetran\'s connector settings before deactivating the old token.' },
      { category: 'Data Integrity', title: 'Multi-Currency Deal Value Handling', preview: 'Deals in different currencies cannot be summed without conversion', rootCause: 'Pipedrive supports multi-currency deals — each deal has a currency field. The value field stores the amount in the deal\'s currency, not a normalized base currency. Pipedrive does not provide exchange rate tables via the API.', impact: 'Summing deal values across currencies produces nonsensical pipeline totals (e.g., 50,000 USD + 40,000 EUR ≠ 90,000 anything). Revenue forecasts are wrong for international sales teams.', resolution: 'Always group by currency when aggregating deal values. Build or import an exchange rate table in your warehouse for conversion to a base currency. Pipedrive shows a "weighted value" in its UI using org-level default rates, but this data may not be available via the API. Consider using an external FX rate source (e.g., European Central Bank, Open Exchange Rates).' },
      { category: 'Data Integrity', title: 'Deleted Deal and Contact Handling', preview: 'Permanently deleted items may disappear without trace', rootCause: 'When a user permanently deletes a deal, person, or organization in Pipedrive, it is removed from the API response. Fivetran marks detected deletions with _fivetran_deleted = TRUE, but if the item is deleted between sync cycles, the deletion event may be missed depending on the sync frequency.', impact: 'Deleted deals vanish from pipeline history. Won/lost deal analysis may have gaps. Historical revenue attribution breaks if the deal record disappears.', resolution: 'Increase sync frequency for critical tables. Filter on _fivetran_deleted = FALSE for current-state queries. Educate the Pipedrive admin to use "Mark as Lost" instead of deleting deals — lost deals are preserved with full history. For compliance-driven deletions, accept the data gap but log the deletion event.' },
      { category: 'Data Integrity', title: 'Product and Deal-Product Association Tables', preview: 'Product-level deal data requires joining additional tables', rootCause: 'Pipedrive allows attaching products to deals with quantity, price, and discount. This data lives in a DEAL_PRODUCT (or PRODUCT_ATTACHMENT) table, not on the DEAL table itself. The PRODUCT table contains the product catalog. Without these tables enabled, deal value is a single number with no line-item breakdown.', impact: 'Companies that sell multiple products per deal need product-level revenue attribution. Without the DEAL_PRODUCT table, there\'s no way to answer "how much revenue came from Product X?"', resolution: 'Enable PRODUCT and DEAL_PRODUCT tables in the Fivetran schema. Join DEAL → DEAL_PRODUCT → PRODUCT for line-item analysis. Calculate product-level revenue as DEAL_PRODUCT.item_price × DEAL_PRODUCT.quantity × (1 - DEAL_PRODUCT.discount_percentage / 100). Sum of deal-products should reconcile to DEAL.value.' }
    ]
  }

};

const troubleshootingData = [
  // 4xx Client Errors
  { errorCode: '400', title: 'Bad Request', preview: 'Something the customer entered is wrong or expired', rootCause: 'Credentials (#1)', diagnosis: 'The most common error. Almost always means a credential (API key, password, token) is wrong, expired, or was recently changed by the customer or their source system.', steps: [
    { title: 'Ask the customer', text: 'Has anything changed recently? API keys, passwords, or access tokens may have been rotated or expired.' },
    { title: 'Re-authenticate', text: 'In Fivetran: go to the connection → Setup tab → Edit connection → re-enter credentials or click Re-Authorize.' },
    { title: 'Check the source system', text: 'Log into the source (HubSpot, Salesforce, etc.) and verify the API key or connected app is still active.' },
    { title: 'Still failing?', text: 'Open a support ticket with: connector name, error message, and when it started. The support team can check Fivetran-side logs.' }
  ], escalate: false },
  { errorCode: '401', title: 'Unauthorized', preview: 'Login credentials are missing or no longer valid', rootCause: 'Credentials (#1)', diagnosis: 'The connector tried to authenticate but failed. This usually means the API key or OAuth token expired, was revoked, or the source system regenerated it. Some systems (like Salesforce) can silently expire tokens.', steps: [
    { title: 'For OAuth connectors', text: 'Go to connection Setup → Re-Authorize. The customer may need to log into the source and approve Fivetran again.' },
    { title: 'For API key connectors', text: 'Ask the customer to generate a new API key in their source system, then paste it into Fivetran under Setup → Edit connection.' },
    { title: 'Common cause', text: 'Password changes, SSO policy updates, or admin revoking app access can all trigger this. Ask the customer if anything changed on their end.' },
    { title: 'Still failing?', text: 'Open a support ticket — include the connector type and when the error started.' }
  ], escalate: false },
  { errorCode: '403', title: 'Forbidden', preview: 'Login works, but the account doesn\'t have permission — NOT a password issue', rootCause: 'Permissions (#3)', diagnosis: 'The credentials are valid (the system recognizes the user), but the user doesn\'t have the right permissions to access what Fivetran needs. This is a role/permissions issue, not a credentials issue.', steps: [
    { title: 'Check the user\'s role', text: 'The account used by Fivetran needs admin or read-all access. Ask: "What role does the Fivetran service account have in [source system]?"' },
    { title: 'Common fix', text: 'In most sources, the connected user needs an admin-level role. For HubSpot: Super Admin. For Salesforce: System Administrator or a profile with "API Enabled" + object read access.' },
    { title: 'If they recently changed roles', text: 'Role or permission changes in the source system take effect immediately. Ask if their IT team made any access changes recently.' },
    { title: 'Still failing?', text: 'Open a support ticket with: connector type, the role of the connected user, and which tables are failing.' }
  ], escalate: false },
  { errorCode: '404', title: 'Not Found', preview: 'Fivetran is looking for something that doesn\'t exist in the source', rootCause: 'Configuration (#2)', diagnosis: 'The source system says the requested resource doesn\'t exist. This can mean: a table or object was deleted in the source, a URL or endpoint changed, or the connector configuration points to something that\'s been removed.', steps: [
    { title: 'Ask the customer', text: 'Did they delete or rename any tables, objects, or resources in their source system recently?' },
    { title: 'Check Known Issues', text: 'Some connectors have known issues where specific objects return 404. Check the Known Issues tab for this connector.' },
    { title: 'Open a support ticket', text: 'Include: connector name, the specific table or object returning 404, and any recent changes the customer made in their source system.' }
  ], escalate: true },
  { errorCode: '405', title: 'Method Not Allowed', preview: 'The source system rejected how Fivetran is accessing it', rootCause: 'Configuration (#2)', diagnosis: 'The source system received Fivetran\'s request but rejected the method. This is typically a configuration issue on the Fivetran side or a source API change that requires a connector update.', steps: [
    { title: 'Open a support ticket', text: 'This usually requires investigation by the support team. Include: connector type, full error message, and when it started.' }
  ], escalate: true },
  { errorCode: '409', title: 'Conflict', preview: 'Something in the source is in a conflicting state', rootCause: 'Source conflict', diagnosis: 'The source system says the request conflicts with its current state — for example, trying to sync a resource that\'s being modified, or a schema conflict between source and destination.', steps: [
    { title: 'Try a re-sync', text: 'In Fivetran, go to the affected table → click Re-sync. This forces a fresh pull and often resolves conflicts.' },
    { title: 'If re-sync doesn\'t help', text: 'Open a support ticket with: connector name, the full error message, and whether the customer recently made changes in the source or destination.' }
  ], escalate: true },
  { errorCode: '422', title: 'Unprocessable Entity', preview: 'The data format is wrong — something in the source doesn\'t match what\'s expected', rootCause: 'Data format', diagnosis: 'The source data has something unexpected — like a field with an incompatible format, a required field that\'s empty, or a data type mismatch. Think of it like filling out a form and putting text in a number field.', steps: [
    { title: 'Check for recent source changes', text: 'Ask the customer if they changed any field types, added required fields, or modified their schema recently.' },
    { title: 'Open a support ticket', text: 'Include: connector name, the full error message, and any recent schema changes. The support team can identify which specific field is causing the issue.' }
  ], escalate: true },
  { errorCode: '429', title: 'Too Many Requests', preview: 'The source is rate limiting Fivetran — usually temporary', rootCause: 'Rate limited', diagnosis: 'The source system is saying "slow down" — too many API requests in a short period. This is usually temporary and resolves on its own. If the customer uses other tools hitting the same API (like Zapier, internal scripts, other integrations), they may be competing for the same rate limit.', steps: [
    { title: 'Usually self-resolving', text: 'Fivetran automatically retries. Wait for the next sync — it will likely succeed.' },
    { title: 'If it keeps happening', text: 'Ask the customer: "Do you have other tools or scripts hitting [source] API?" Multiple tools sharing the same API limit is the most common cause.' },
    { title: 'Reduce sync frequency', text: 'If the source has strict limits (like Airtable\'s 5 req/sec), reducing sync frequency in Fivetran can help. Go to connection → Settings → Sync frequency.' },
    { title: 'Persistent issues?', text: 'Open a support ticket — the team can check if the connector needs throttling adjustments.' }
  ], escalate: false },
  // 5xx Server Errors
  { errorCode: '5xx', title: 'Server Error (500, 502, 503, 504)', preview: 'The source system itself is having problems — not a Fivetran issue', rootCause: 'Source-side', diagnosis: 'The source system\'s servers are failing. 500 = generic crash, 502 = upstream failure, 503 = overloaded or maintenance, 504 = timed out. These are almost never a Fivetran problem — the source is down or struggling.', steps: [
    { title: 'Check the source\'s status page', text: 'Most services have a status page (e.g., status.salesforce.com, status.hubspot.com). Check if there\'s a known outage or maintenance window.' },
    { title: 'If there\'s an outage', text: 'Nothing to do — wait for the source to recover. Fivetran will automatically retry and catch up on the next successful sync.' },
    { title: 'If no outage is listed', text: 'Ask the customer to check their source system. Self-hosted databases (Postgres, MySQL) may have resource issues their DBA needs to investigate.' },
    { title: 'Ongoing for 24+ hours?', text: 'Open a support ticket with: connector name, how long it\'s been failing, and whether the source status page shows any issues.' }
  ], escalate: false }
];

const glossaryData = [
  // Pricing
  { term: 'MAR', simple: 'Monthly Active Rows — how Fivetran measures and bills usage', detailed: 'Distinct primary keys that are added, updated, or deleted in your source and synced to your destination in a calendar month. A row updated 10 times in a month counts as 1 MAR. MAR resets at the start of each month.', whyMatters: 'MAR is now calculated per connection (not per account as of March 2025). Each connection follows its own cost curve — higher volume = lower cost per MAR.', example: 'A customer syncs 500k HubSpot contacts. If all are touched in January, that\'s 500k MAR on that connection. Each connection has a $5/month minimum charge.', category: 'Pricing' },
  { term: 'Free MAR', simple: 'MAR that doesn\'t count toward your bill', detailed: 'Initial/historical syncs, re-synced identical rows, Fivetran Platform Connector usage, and the first 14 days of any new connection are all free. Re-syncs triggered by Fivetran for maintenance also count as free.', whyMatters: 'Knowing what\'s free helps set customer expectations about initial costs. The first sync is always free.', example: 'Customer sets up a new Salesforce connection — the initial historical load of 2M rows is free MAR. The 14-day trial starts when the first incremental sync detects data.', category: 'Pricing' },
  { term: 'Connection', simple: 'A unique instance of a connector linking a specific source to a destination', detailed: 'Each connection is an independent pipeline. Syncing two Salesforce accounts to one Snowflake = two connections. One Salesforce to two destinations = also two connections. Each connection has its own MAR count and cost curve.', whyMatters: 'Billing is per connection. More connections = more $5 base charges. Each connection\'s MAR is calculated independently.', example: 'Customer has HubSpot → Snowflake and Salesforce → Snowflake. That\'s 2 connections, each billed separately.', category: 'Pricing' },
  { term: 'Re-Sync', simple: 'Re-fetching all data from source, overwriting existing rows', detailed: 'Invalidates incremental sync cursors and re-fetches all original records. Like an initial sync but overwrites instead of creating. Re-synced identical rows are now free (no MAR charge). Customer-triggered re-syncs are unlimited and free.', whyMatters: 'Common fix for data issues. Used after pausing connectors, schema changes, or data corruption. Free for identical rows under current pricing.', example: 'Customer pauses Salesforce connector for 20 days. On resume, re-sync each affected table to capture deletes missed while paused.', category: 'Pricing' },
  { term: 'Plans', simple: 'Free, Standard, Enterprise, and Business Critical', detailed: 'Free: up to 500k MAR, all Standard features, 5k model runs. Standard: unlimited users, 15-min syncs, 700+ connectors, REST API, RBAC. Enterprise: 1-min syncs, enterprise DB connectors, custom roles, VPN, cloud provider choice, hybrid deployment. Business Critical: specific cloud region selection, strictest compliance.', whyMatters: 'AEs need to know which features require which plan — sync frequency, deployment options, and security features vary.', example: 'Customer wants 1-minute sync frequency → needs Enterprise plan. Customer wants to choose AWS us-east-1 → needs Business Critical.', category: 'Pricing' },
  // Core Concepts
  { term: 'Connector', simple: 'A pre-built integration that syncs data from a specific source', detailed: 'Software that enables automated, fully managed data replication from a source to a destination. Each connector is tailored for a specific source (like Salesforce or HubSpot). Two types: pull connectors (Fivetran requests data) and push connectors (source sends data to Fivetran).', whyMatters: '700+ connectors available. Each has unique behaviors, sync strategies, known issues, and table schemas.', example: 'The HubSpot connector pulls data via HubSpot API. A webhook connector receives pushed data from the source.', category: 'Core' },
  { term: 'Destination', simple: 'The data warehouse or lake where Fivetran loads your data', detailed: 'Supported destinations include Snowflake, BigQuery, Redshift, Databricks, and others. Each connection targets one destination. Data processing location is set when configuring the destination.', whyMatters: 'Destination choice affects query performance, cost, and schema management. Enterprise+ plans can choose cloud provider.', example: 'Customer uses Snowflake as their destination — all HubSpot and Salesforce data lands in separate schemas there.', category: 'Core' },
  { term: 'ELT', simple: 'Extract, Load, Transform — Fivetran\'s approach to data integration', detailed: 'Extract raw data from source, Load it into the destination, then Transform it post-load. Unlike traditional ETL, raw data is always available alongside transformed data. Fivetran handles E and L; customer handles T (with dbt, SQL, etc).', whyMatters: 'Key selling point — Fivetran doesn\'t pre-aggregate or filter data. Analysts get the full raw dataset and transform it to their needs.', example: 'Fivetran loads raw HubSpot data into Snowflake. The analytics team uses dbt to build models on top of it.', category: 'Core' },
  { term: 'Schema', simple: 'The structure of tables, columns, and relationships that Fivetran creates', detailed: 'Each connector creates and manages its own schema in the destination. Fivetran aims to provide a correct, easy-to-query schema at the lowest level of aggregation. Schema name is customizable during connection setup.', whyMatters: 'Fivetran\'s responsibility: deliver accurate, normalized schema. Customer\'s responsibility: transform and model it for their needs.', example: 'HubSpot connector creates a schema with CONTACT, COMPANY, DEAL, ENGAGEMENT tables and their relationships.', category: 'Core' },
  { term: 'Sync Frequency', simple: 'How often Fivetran checks for and syncs new data', detailed: 'Configurable per connector — ranges from 1 minute (Enterprise+) to 24 hours. More frequent = fresher data but doesn\'t increase MAR (MAR is based on what changed, not how often you check). Standard plan minimum: 15 minutes.', whyMatters: 'Sync frequency does NOT affect MAR — only actual data changes count. But it does affect API rate limit consumption at the source.', example: 'HubSpot set to 15-min sync = data is at most 15 minutes behind. Switching to 5-min won\'t increase MAR if the same rows are changing.', category: 'Core' },
  { term: 'Incremental Sync', simple: 'Only syncing new or changed data since last sync', detailed: 'Fivetran compares timestamps or change tokens to identify what\'s new or modified, then syncs only those records. Most connectors use incremental sync after the initial historical load.', whyMatters: 'Dramatically reduces sync time and MAR compared to full-table re-imports.', example: 'A 1M-row table with 1,000 changes since yesterday — incremental sync touches 1,000 rows instead of 1M.', category: 'Core' },
  { term: 'Historical Sync', simple: 'The initial full load of all existing data from a source', detailed: 'When a connector is first set up, Fivetran loads all available historical data. This counts as free MAR. Some connectors support configuring a Historical Sync Time Frame to limit how far back data is loaded.', whyMatters: 'First sync is free but can be large and slow. Set expectations with customers. Historical sync time frame can speed up initial load.', example: 'Connecting Salesforce with 5 years of data — first sync pulls all 2M historical opportunities (free MAR).', category: 'Core' },
  // Technical
  { term: 'CDC', simple: 'Change Data Capture — syncing only what changed at the database level', detailed: 'CDC tracks inserts, updates, and deletes using database logs (like MySQL binlog or Postgres WAL) instead of scanning entire tables. Much more efficient for large databases.', whyMatters: 'CDC-enabled connectors sync faster, use fewer source resources, and reduce MAR.', example: 'Instead of re-scanning 1M Salesforce records, CDC only syncs the 500 records that changed since last sync.', category: 'Technical' },
  { term: 'Schema Drift', simple: 'When your source data structure changes unexpectedly', detailed: 'Columns added/removed, data types changed, or table structures modified in the source. Fivetran automatically detects and handles most schema drift — promoting column types losslessly.', whyMatters: 'Can cause unexpected new columns or data type promotions. Fivetran handles it automatically but customers should be aware.', example: 'Customer adds a custom field "Account_Tier" to HubSpot Contacts — new column appears in warehouse on next sync.', category: 'Technical' },
  { term: '_fivetran_deleted', simple: 'A column Fivetran adds to flag records deleted in the source', detailed: 'When a record is removed from the source, Fivetran sets this column to TRUE instead of deleting the warehouse row (soft delete). Some tables use hard deletes instead — check connector docs.', whyMatters: 'Critical for accurate reporting — always filter WHERE _fivetran_deleted = FALSE unless analyzing deletions.', example: 'A HubSpot contact is deleted. The warehouse row stays but _fivetran_deleted becomes TRUE.', category: 'Technical' },
  { term: '_fivetran_synced', simple: 'Timestamp column showing when Fivetran last synced each row', detailed: 'Added to every table. Stores the sync end time for every record. This is Fivetran\'s timestamp, not the source system\'s timestamp.', whyMatters: 'Use this to understand data freshness and troubleshoot sync delays. Different from source system timestamps like SystemModStamp.', example: 'A row shows _fivetran_synced = 2026-04-07 14:30:00. That\'s when Fivetran loaded it, not when it was created in HubSpot.', category: 'Technical' },
  { term: 'History Mode', simple: 'Tracks every change to a record as a new row instead of updating in place', detailed: 'When enabled, every time a record\'s value changes, Fivetran inserts a new row in the destination. Creates a full audit trail but significantly increases MAR.', whyMatters: 'Powerful for trend analysis but expensive. Each change = new row = more MAR. Disable for tables where you only need current state.', example: 'A contact\'s lifecycle stage changes 5 times in a month. Without history mode: 1 MAR. With history mode: 5 MAR (one per change).', category: 'Technical' },
  { term: 'Primary Key', simple: 'Unique identifier for each row — how Fivetran tracks changes', detailed: 'Fivetran uses primary keys to determine if a row is new (insert) or existing (update). If no primary key exists, Fivetran creates a synthetic (hashed) primary key. A row is counted once per month regardless of how many updates.', whyMatters: 'Primary keys drive MAR counting. One distinct primary key = one MAR per month max. Synthetic keys for tables without PKs may behave differently.', example: 'HubSpot CONTACT table uses contact_id as PK. If contact_id 12345 is updated 10 times in January, it\'s still just 1 MAR.', category: 'Technical' },
  { term: 'Type Inference', simple: 'How Fivetran automatically determines column data types', detailed: 'When a source doesn\'t specify data types (like CSV files), Fivetran analyzes values to infer the most specific type. Uses a hierarchy: BOOLEAN → SHORT → INT → LONG → DOUBLE → DECIMAL → STRING. If types conflict, promotes to the supertype.', whyMatters: 'Explains why columns sometimes appear as STRING when you expected INT — Fivetran plays it safe to avoid data loss.', example: 'A CSV column has values "9", "10.5", "hello". Fivetran infers STRING because it\'s the only type that holds all three.', category: 'Technical' },
  // Deployment
  { term: 'SaaS Deployment', simple: 'Fivetran manages everything in the cloud — the default option', detailed: 'Fully managed, cloud-based data integration. Fivetran hosts both the control plane (configuration, monitoring) and data plane (actual data movement). Supports all connector types. Hands-off approach — minimal internal resource investment.', whyMatters: 'Default for most customers. Simplest setup. All connectors supported. No infrastructure to manage.', example: 'Customer signs up, connects HubSpot, picks Snowflake as destination. Fivetran handles everything.', category: 'Deployment' },
  { term: 'Hybrid Deployment', simple: 'Data stays in your network; Fivetran orchestrates from the cloud', detailed: 'Data processing happens locally via a Hybrid Deployment Agent you install (Docker/Kubernetes). Fivetran\'s cloud handles configuration and monitoring only — no customer data leaves your network. Requires Enterprise or Business Critical plan.', whyMatters: 'Key for regulated industries (healthcare, finance) with strict data sovereignty requirements. Only metadata goes to Fivetran. Supports up to 10 connections per agent.', example: 'Hospital needs to sync patient data but can\'t send it through third-party cloud. They install a Hybrid Agent on-premises.', category: 'Deployment' },
  { term: 'Self-Hosted (HVR)', simple: 'Fully on-premises — customer controls everything', detailed: 'Uses Fivetran\'s HVR solution for database and file replication. Hosted entirely on customer infrastructure. Complete control over orchestration, configuration, credentials, and code deployment. Distributed architecture for large-scale environments.', whyMatters: 'For enterprises with the strictest compliance and data sovereignty requirements who need full control. Most complex to set up and maintain.', example: 'Large bank needs to replicate Oracle databases with zero data leaving their data center. They deploy HVR on-premises.', category: 'Deployment' },
  { term: 'Data Plane vs Control Plane', simple: 'Where data moves vs where you manage it', detailed: 'Data Plane: where actual data movement occurs between sources and destinations. Control Plane: manages configuration, monitoring, orchestration, security settings. In SaaS, both are in Fivetran\'s cloud. In Hybrid, data plane is local and control plane is Fivetran\'s cloud.', whyMatters: 'This is the key differentiator between deployment models. Hybrid = your data plane, Fivetran\'s control plane. Important for security conversations.', example: 'A Hybrid Deployment customer: their data never leaves their VPC (data plane), but they configure and monitor everything via fivetran.com (control plane).', category: 'Deployment' },
  { term: 'Transformations', simple: 'Post-load data modeling using dbt or SQL in the destination', detailed: 'Fivetran loads raw data (E+L), then supports transformations in the destination (T). Uses dbt Core-compatible data models. Fivetran orchestrates transformation runs. Charged per successful model run (5,000 free/month on Free plan).', whyMatters: 'Fivetran provides pre-built dbt packages for popular connectors (HubSpot, Salesforce, Stripe). Customers can also write custom SQL/dbt models.', example: 'Fivetran loads raw HubSpot data. The dbt HubSpot package transforms it into analytics-ready tables like hubspot__contacts with enriched metrics.', category: 'Core' },
  { term: 'Activations', simple: 'Reverse ETL — push warehouse data back to business tools (powered by Census acquisition)', detailed: 'Move data from your warehouse/lake back to operational tools like Salesforce, HubSpot, Braze. Powered by Fivetran\'s acquisition of Census (2024), the leading Reverse ETL platform. Priced on MAR separately from connections. Each activation has its own cost curve and a 14-day free trial. Census is NOT a competitor — it is now native Fivetran functionality.', whyMatters: 'Enables the "data loop" — sync data in with connectors, model it, then push insights back to the tools teams use daily. With Census integrated, Fivetran now owns the full data movement lifecycle: sources → warehouse → destinations.', example: 'Customer builds a lead score model in Snowflake, then uses Activations to push scores back to Salesforce Contact records.', category: 'Core' },

  // Data Ecosystem
  { term: 'ODI (Open Data Infrastructure)', simple: 'Fivetran\'s vision for a modern data stack built on open standards, not vendor lock-in', detailed: 'Open Data Infrastructure is a concept Fivetran is championing — the idea that the modern data stack should be built on open, interoperable standards rather than proprietary, locked-in platforms. Key principles: open table formats (Apache Iceberg, Delta Lake), open APIs for integration, portable data that isn\'t trapped in a single vendor\'s ecosystem, and the freedom to swap components (warehouse, transformation tool, BI layer) without rebuilding pipelines. Fivetran positions itself as the open, vendor-neutral data movement layer that works with any destination and any transformation tool.', whyMatters: 'ODI is Fivetran\'s strategic narrative. It positions Fivetran against proprietary all-in-one platforms that lock customers into a single ecosystem. When talking to prospects evaluating end-to-end platforms (like Databricks, Informatica, or legacy ETL suites), ODI is the argument for best-of-breed, open, interoperable tools.', example: 'Prospect says "we\'re considering an all-in-one platform from Vendor X." The ODI pitch: "Your data should be portable. Fivetran delivers data to any destination using open formats like Iceberg — you\'re never locked into one vendor. Swap your warehouse, your BI tool, or your transformation layer without touching your pipelines."', category: 'Core' },
  { term: 'ETL', simple: 'Extract, Transform, Load — the legacy approach Fivetran replaced', detailed: 'The traditional data integration pattern where data is extracted from source, transformed (cleaned, filtered, aggregated) before loading, then loaded into the destination. ETL tools include Informatica, Talend, Oracle Data Integrator, SSIS, and Pentaho. Unlike ELT, raw data is lost — only the pre-transformed version lands in the warehouse.', whyMatters: 'When customers say "we do ETL" or name a legacy tool, that\'s a migration opportunity. Fivetran\'s ELT approach is superior: raw data is preserved, transformations are flexible, and no infrastructure is needed.', example: 'Customer uses Informatica to filter and aggregate Salesforce data before loading to Teradata. Migrating to Fivetran means raw data in Snowflake, with dbt handling transformations — far more flexible.', category: 'Competitive' },
  { term: 'Informatica', simple: 'Legacy ETL platform — a common competitor in enterprise accounts', detailed: 'Informatica is one of the oldest and most widely deployed ETL/data integration platforms, common in large enterprises. It\'s on-premises or private cloud, expensive to license and maintain, and requires specialized Informatica developers. Informatica IICS is their cloud product but still follows ETL patterns.', whyMatters: 'Frequently mentioned by enterprise prospects. Fivetran positioning: fully managed, no code, faster time-to-value, modern ELT vs Informatica\'s complex ETL. Informatica licenses can cost hundreds of thousands per year.', example: 'Fortune 500 prospect says "we have an Informatica team of 8." That signals high data maturity but also high maintenance cost — frame Fivetran as replacing that overhead.', category: 'Competitive' },
  { term: 'Data Warehouse', simple: 'The structured database where Fivetran loads all your data', detailed: 'A centralized repository optimized for analytical queries across large datasets. Modern cloud warehouses (Snowflake, BigQuery, Redshift, Databricks) are columnar, massively scalable, and separation of storage from compute. Different from operational databases (MySQL, Postgres) which are optimized for transactions, not analytics.', whyMatters: 'The destination in every Fivetran deal. Understanding which warehouse a customer uses shapes the conversation — each has different pricing, performance, and integration nuances.', example: 'Customer uses Snowflake as their warehouse. Fivetran loads HubSpot, Salesforce, and Stripe data into separate schemas. Analysts query across all sources in one place.', category: 'Data Ecosystem' },
  { term: 'Data Lake', simple: 'A storage layer for raw, unstructured, or semi-structured data at massive scale', detailed: 'A data lake stores data in its raw format — files, JSON, Parquet, Avro, images, logs — at very low cost (typically object storage like S3, GCS, or ADLS). Unlike a warehouse, a data lake doesn\'t enforce schema on write. Data is stored first, queried later. Often used for ML training data, logs, and event streams alongside a warehouse.', whyMatters: 'Customers using S3, GCS, or Azure Data Lake as a destination use Fivetran\'s file-based connectors. Understanding lakes vs warehouses helps position the right solution — a lake is cheap storage, a warehouse is fast querying.', example: 'Customer stores clickstream events (billions of rows) in S3 at low cost, while keeping CRM and billing data in Snowflake for fast SQL queries. Fivetran can write to both.', category: 'Data Ecosystem' },
  { term: 'Data Lakehouse', simple: 'A hybrid — stores data like a lake, queries it like a warehouse', detailed: 'Pioneered by Databricks (Delta Lake) and Apache Iceberg. Combines low-cost lake storage with warehouse-quality SQL performance using open table formats. Customers get the economics of object storage with ACID transactions and fast analytics. Databricks, Snowflake (Iceberg), and BigQuery all support lakehouse patterns.', whyMatters: 'Databricks is a major Fivetran destination. Customers saying "we\'re going lakehouse" often means Databricks + Delta Lake. Fivetran has native Databricks support. This architecture is growing fast.', example: 'Customer migrates from Redshift to Databricks Delta Lake. Fivetran connectors stay the same — just change the destination to Databricks and data flows into Delta tables.', category: 'Data Ecosystem' },
  { term: 'dbt', simple: 'The transformation tool most Fivetran customers use to model data after it\'s loaded', detailed: 'dbt (data build tool) is the standard for the T in ELT. It lets data teams write SQL models that transform raw warehouse data into analytics-ready tables, with version control, testing, and documentation. Fivetran orchestrates dbt runs after each sync. Fivetran also maintains free open-source dbt packages for 20+ connectors (HubSpot, Salesforce, Stripe, etc).', whyMatters: 'When a customer asks "how do we transform the raw data Fivetran loads?" — the answer is dbt. Fivetran\'s free dbt packages are a key differentiator: pre-built models for common connectors, working out of the box.', example: 'Fivetran loads raw HubSpot data. Customer runs Fivetran\'s open-source dbt HubSpot package — in 10 minutes they have clean, joined tables like hubspot__contacts and hubspot__deals with enriched metrics.', category: 'Data Ecosystem' },
  { term: 'Medallion Architecture', simple: 'A data organization pattern: Bronze (raw) → Silver (cleaned) → Gold (ready to use)', detailed: 'A layered data modeling pattern common in Databricks and modern warehouses. Bronze: raw data as Fivetran loads it. Silver: cleaned, deduplicated, joined data (usually dbt models). Gold: business-ready aggregations and metrics for dashboards and reporting. Fivetran always feeds the Bronze layer.', whyMatters: 'When customers talk about Bronze/Silver/Gold layers, they\'re describing this pattern. Fivetran\'s role is clear: we deliver the Bronze layer reliably. dbt handles Silver and Gold.', example: 'Bronze layer: raw Salesforce OPPORTUNITY table from Fivetran. Silver: cleaned opps with NULL fields handled, currency normalized. Gold: win_rate_by_rep dashboard-ready model.', category: 'Data Ecosystem' },
  { term: 'Orchestration', simple: 'Scheduling and coordinating when pipelines run and in what order', detailed: 'Orchestration tools (Airflow, Prefect, Dagster, dbt Cloud) manage the sequence and timing of data pipeline steps. Fivetran handles orchestration for its own syncs — you set a frequency and it runs. For complex multi-step pipelines (sync → transform → activate), customers may use orchestration tools to coordinate Fivetran alongside other tools.', whyMatters: 'Prospects may already use Airflow or Prefect. Fivetran has API and webhook hooks that work with any orchestration tool. For many customers, Fivetran\'s built-in scheduling is sufficient.', example: 'Customer uses Airflow: trigger Fivetran sync via API, wait for completion, then trigger dbt run, then send Slack notification. Fivetran is a node in their Airflow DAG.', category: 'Data Ecosystem' },
  { term: 'Data Pipeline', simple: 'The end-to-end flow of data from source to destination', detailed: 'A data pipeline is the full chain: source system → extraction → transformation → loading → destination. Fivetran manages the extraction and loading steps (EL). The pipeline also includes the transformation step (T), typically handled by dbt or SQL in the destination.', whyMatters: 'When customers say "our data pipeline is broken," they may mean the Fivetran sync failed, or a downstream transformation broke, or the destination has an issue. Understanding the full chain helps narrow down where the problem is.', example: 'Salesforce → Fivetran (extract + load) → Snowflake → dbt (transform) → Tableau (visualize). If Tableau shows wrong numbers, the issue could be at any step in the pipeline.', category: 'Data Ecosystem' },
  { term: 'Reverse ETL', simple: 'Moving data from your warehouse back into business tools — now native to Fivetran via Census acquisition', detailed: 'The opposite of what connectors do. Instead of pulling data into a warehouse, Reverse ETL pushes data from the warehouse back to operational tools like Salesforce, HubSpot, or Marketo. Fivetran acquired Census (the market-leading Reverse ETL platform) and rebranded it as "Activations." Census is NOT a competitor — it\'s now part of Fivetran. Common use cases: syncing lead scores to CRM, pushing cohort labels to marketing tools, or updating customer health scores.', whyMatters: 'A growing need. When a customer has already built models in their warehouse and wants to operationalize them, Activations is the answer. With Census now integrated, Fivetran owns the complete data loop. Priced separately from connections.', example: 'Customer built an ML churn score in BigQuery. They use Activations to push that score into HubSpot on every contact record, so CS can see it without logging into BigQuery.', category: 'Data Ecosystem' },
  { term: 'API Connector', simple: 'Fivetran pulls data from a cloud app using its published API', detailed: 'The most common connector type. Fivetran makes authenticated API calls to the source system on a schedule, requests records, paginates through results, and loads them into the destination. Rate limits, authentication, and schema are all managed by Fivetran. Examples: HubSpot, Salesforce, Stripe, Shopify.', whyMatters: 'The bread and butter of Fivetran. Most SaaS connectors work this way. Common issues: API rate limits slowing syncs, token expiration, and API version changes.', example: 'Fivetran calls HubSpot\'s Contacts API every 15 minutes, fetching contacts updated since the last cursor. New and changed contacts are upserted to Snowflake.', category: 'Technical' },
  { term: 'Webhook Connector', simple: 'The source pushes data to Fivetran in real-time as events happen', detailed: 'Instead of Fivetran polling the source, the source sends data to Fivetran whenever an event occurs. Near real-time data delivery. Common for: payments (Stripe), e-commerce (Shopify), and custom apps. Requires the customer to configure the webhook endpoint in the source system.', whyMatters: 'Much faster than polling — data arrives seconds after the event. Useful when customers need sub-minute freshness. Fivetran also has a generic Webhooks connector for custom event streams.', example: 'Stripe sends a webhook to Fivetran every time a payment succeeds or fails. Events land in Snowflake within seconds — no polling delay.', category: 'Technical' },
  { term: 'RBAC', simple: 'Role-Based Access Control — who can see and change what in Fivetran', detailed: 'Fivetran\'s permission system lets admins control who can view connections, modify schemas, access billing, or manage users. Standard plan: basic RBAC. Enterprise: custom roles and granular permissions. Common roles: Account Administrator, Destination Administrator, Analyst.', whyMatters: 'Enterprise customers require RBAC for security compliance. The ability to give read-only access to analysts vs full access to admins is often a requirement.', example: 'Company gives their analytics team "Analyst" role — they can view schemas and run queries but can\'t change connector settings or see credentials.', category: 'Core' },
  { term: 'SSO / SAML', simple: 'Single sign-on — log into Fivetran with your company\'s identity provider', detailed: 'Fivetran supports SAML 2.0 SSO via Okta, Azure AD, Google Workspace, and other identity providers. Enterprise feature. Allows companies to enforce MFA, control access centrally, and auto-provision/deprovision users via their IdP.', whyMatters: 'Required by most enterprise IT and security teams. A common procurement checkbox item. Available on Enterprise and Business Critical plans.', example: 'Customer uses Okta for all SaaS tools. They configure Fivetran as an Okta app — employees log in with their Okta credentials, access controlled by Okta groups.', category: 'Core' }
];

// ─── CATEGORY CONFIG ──────────────────────────────────────
const categoryConfig = {
  'Data Integrity': { dot: 'dot-data-integrity', css: '', badgeBg: '#fef3c7', badgeColor: '#92400e' },
  'Errors':         { dot: 'dot-errors', css: 'cat-errors', badgeBg: '#fef2f2', badgeColor: '#991b1b' },
  'FAQ':            { dot: 'dot-faq', css: 'cat-faq', badgeBg: '#EBF1FD', badgeColor: '#1A4FBF' },
  'How To':         { dot: 'dot-howto', css: 'cat-howto', badgeBg: '#f0fdf4', badgeColor: '#166534' },
  'Setup':          { dot: 'dot-setup', css: 'cat-setup', badgeBg: '#f5f3ff', badgeColor: '#5b21b6' },
  'Syncs':          { dot: 'dot-syncs', css: 'cat-syncs', badgeBg: '#fdf2f8', badgeColor: '#9d174d' }
};
// ─── BATTLE CARDS ──────────────────────────────────────
const battleCardData = [
  {
    competitor: 'Airbyte',
    type: 'Open-source ELT',
    summary: 'Open-source data integration platform. Self-hosted (free) or Airbyte Cloud (managed). Growing fast in developer-led organizations.',
    pricing: 'Open-source: free but you pay for infrastructure + engineering time to maintain. Cloud: usage-based per row synced (credits model).',
    strengths: [
      '300+ connectors, many community-built',
      'Free self-hosted option appeals to engineering teams with budget constraints',
      'Connector Development Kit (CDK) lets engineers build custom connectors',
      'Strong developer community and GitHub presence'
    ],
    weaknesses: [
      'Self-hosted = you own the infrastructure, monitoring, upgrades, and on-call',
      'Connector quality varies widely — community connectors may break without warning',
      'No SLA on open-source. Cloud SLAs are weaker than Fivetran',
      'Limited enterprise features: no hybrid deployment, weaker RBAC, no SOC 2 Type II on self-hosted',
      'Schema handling and error recovery less mature than Fivetran'
    ],
    positioning: 'Airbyte is a good engineering project, not a good business decision. The "free" self-hosted option costs 1-2 engineers to maintain — that\'s $200-400k/year in salary. Fivetran is fully managed: zero infrastructure, enterprise SLAs, and 99.9% uptime guarantee.',
    objections: [
      { q: '"Airbyte is free and open-source"', a: 'The software is free but running it isn\'t. Self-hosted Airbyte needs servers, monitoring, upgrades, and someone on-call when syncs break at 2am. Most teams spend 15-20 hrs/week maintaining it. At $150/hr engineering cost, that\'s $10k+/month — more than Fivetran.' },
      { q: '"We already use Airbyte and it works fine"', a: 'It works until it doesn\'t — connector updates break syncs, schema changes aren\'t handled automatically, and there\'s no support to call. How much engineering time goes to keeping it running vs building features?' },
      { q: '"Airbyte Cloud is managed too"', a: 'Airbyte Cloud is newer and less mature. Fivetran has 10+ years of production hardening, 700+ connectors maintained by full-time engineering teams, and enterprise features (hybrid deployment, SOC 2, HIPAA) that Airbyte Cloud doesn\'t match.' }
    ]
  },
  {
    competitor: 'Stitch (Talend/Qlik)',
    type: 'Managed ELT',
    summary: 'Acquired by Talend (now Qlik). Originally a simple, developer-friendly ELT tool. Has been deprioritized since the Talend acquisition — limited investment and connector updates.',
    pricing: 'Row-based pricing. Standard plan starts around $100/month for 5M rows. Volume discounts at higher tiers.',
    strengths: [
      'Simple setup — historically one of the easiest tools to get started with',
      'Low entry price point for small volumes',
      'Singer open-source tap ecosystem'
    ],
    weaknesses: [
      'Effectively end-of-life — minimal product investment since Talend/Qlik acquisition',
      'Connector catalog is stagnant: ~130 connectors vs Fivetran\'s 700+',
      'No hybrid deployment, limited security features',
      'Support quality has declined significantly',
      'No transformation layer, no dbt integration',
      'Row-based pricing gets expensive at scale'
    ],
    positioning: 'Stitch was a solid tool 5 years ago. Since the Talend acquisition, it\'s been deprioritized — connector updates are rare, support is slow, and there\'s no product roadmap. Customers on Stitch are on a sinking ship. Migration to Fivetran is straightforward.',
    objections: [
      { q: '"Stitch is cheaper"', a: 'Stitch is cheaper at small volumes but more expensive at scale due to row-based pricing. And you get what you pay for — fewer connectors, no transformations, no hybrid deployment, and declining support.' },
      { q: '"We\'re already on Stitch and it works"', a: 'It works today, but Stitch hasn\'t shipped a meaningful product update in years. When you need a new connector, better security, or faster support — it won\'t be there. Better to migrate now on your timeline than be forced to later.' }
    ]
  },
  {
    competitor: 'Informatica',
    type: 'Enterprise ETL/iPaaS',
    summary: 'The legacy giant of data integration. On-premises ETL (PowerCenter) and cloud (IICS/IDMC). Deeply embedded in Fortune 500 companies. Expensive and complex.',
    pricing: 'Enterprise licensing — typically $200k-$1M+/year depending on volume and modules. IPU (Informatica Processing Unit) based pricing on cloud. Complex, opaque pricing.',
    strengths: [
      'Deeply embedded in large enterprises — hard to rip out',
      'Broad platform: ETL, MDM, data quality, data governance, API management',
      'Mature enterprise features: SOC 2, HIPAA, FedRAMP',
      'Large partner and consultant ecosystem',
      'Handles complex transformations that pure ELT tools don\'t'
    ],
    weaknesses: [
      'Extremely expensive — 5-10x Fivetran cost for equivalent data movement',
      'Requires specialized Informatica developers ($150-200k/year each)',
      'Slow to set up new connectors — weeks vs minutes with Fivetran',
      'ETL approach = data is transformed before loading, losing raw data',
      'Cloud product (IDMC) is still catching up to cloud-native tools',
      'Vendor lock-in: proprietary mappings and workflows'
    ],
    positioning: 'Informatica is a powerful platform but it\'s a 2005 solution to a 2025 problem. Fivetran replaces the data movement piece — the E and L — at a fraction of the cost, in minutes instead of weeks, with zero infrastructure. Customers keep Informatica for data quality/MDM if needed, but move data integration to Fivetran.',
    objections: [
      { q: '"We have a whole Informatica team — we can\'t just switch"', a: 'You don\'t have to switch overnight. Start by running Fivetran alongside Informatica for new connectors. Your Informatica team can focus on complex transformations and data quality instead of maintaining basic data pipelines.' },
      { q: '"Informatica handles our complex transformations"', a: 'Fivetran handles the E and L. Use dbt for the T. For truly complex transformations, keep Informatica for those specific workflows. Most data movement doesn\'t need Informatica\'s complexity — it\'s like using a semi-truck to deliver a pizza.' },
      { q: '"Our compliance team requires Informatica"', a: 'Fivetran is SOC 2 Type II, HIPAA, and GDPR compliant. Our Hybrid Deployment option keeps data in your network. We meet the same compliance requirements at a fraction of the cost.' }
    ]
  },
  {
    competitor: 'Matillion',
    type: 'Cloud-native ELT',
    summary: 'Cloud-native data integration and transformation platform. Runs inside the customer\'s cloud warehouse (Snowflake, BigQuery, Redshift). Combines extraction and transformation in one tool.',
    pricing: 'Credit-based pricing. Virtual Edition (self-hosted in your cloud) or SaaS. Pricing varies significantly by deployment model and volume.',
    strengths: [
      'Transformation built in — don\'t need a separate dbt layer',
      'Runs inside your warehouse — no data leaves your environment',
      'Good for teams that want one tool for E, L, and T',
      'Strong Snowflake partnership'
    ],
    weaknesses: [
      'Fewer connectors than Fivetran (~100 vs 700+)',
      'Transformation UI can be complex — not as clean as dbt',
      'Running in your warehouse means you pay warehouse compute costs for extraction',
      'Less mature connector maintenance — updates are slower',
      'Customer owns more of the operational burden'
    ],
    positioning: 'Matillion tries to be everything — extract, load, and transform in one tool. Fivetran is best-of-breed for the E and L, and pairs with dbt for the T. Specialization wins: Fivetran has 7x more connectors and dedicated connector engineering teams.',
    objections: [
      { q: '"Matillion does ETL and transformations in one tool"', a: 'All-in-one sounds appealing but means compromises everywhere. Fivetran + dbt gives you best-of-breed at each step. And with 700+ connectors vs Matillion\'s ~100, you won\'t hit a wall when you need a new source.' },
      { q: '"Matillion runs in our Snowflake — data never leaves"', a: 'Fivetran\'s Hybrid Deployment does the same thing — data stays in your network. Plus you get Fivetran\'s fully managed connectors without paying Snowflake compute costs for extraction.' }
    ]
  },
  {
    competitor: 'Hevo Data',
    type: 'Managed ELT',
    summary: 'Managed ELT platform popular in mid-market and APAC. Positioned as a simpler, cheaper alternative to Fivetran. Growing but smaller scale.',
    pricing: 'Event-based pricing. Free tier: 1M events/month. Starter ~$239/month. Pricing generally lower than Fivetran for small-medium volumes.',
    strengths: [
      'Lower price point — attractive for cost-sensitive mid-market',
      'Simple UI and fast setup',
      'Built-in transformations (Python and drag-and-drop)',
      'Good APAC presence and support'
    ],
    weaknesses: [
      'Fewer connectors (~150 vs Fivetran 700+)',
      'Less mature enterprise features — weaker RBAC, no hybrid deployment',
      'Smaller engineering team = slower connector updates and bug fixes',
      'Less battle-tested at enterprise scale',
      'Event-based pricing can be unpredictable for high-volume sources'
    ],
    positioning: 'Hevo is a good product for small teams with simple needs. But as data volume and complexity grow, customers hit limitations — fewer connectors, weaker enterprise features, and a smaller support team. Fivetran scales from startup to Fortune 500.',
    objections: [
      { q: '"Hevo is cheaper"', a: 'Hevo is cheaper at the entry level. But event-based pricing gets expensive at scale, and you\'ll pay more in engineering time working around connector gaps and limitations. Total cost of ownership favors Fivetran as you grow.' },
      { q: '"We don\'t need 700 connectors"', a: 'You don\'t today. But every customer\'s source count grows over time. With Fivetran, the connector is ready when you need it. With Hevo, you may be waiting or building a workaround.' }
    ]
  },
  {
    competitor: 'Custom Scripts / DIY',
    type: 'In-house pipelines',
    summary: 'Engineering team builds and maintains custom data pipelines using Python scripts, Airflow DAGs, AWS Glue, cron jobs, or similar. The most common "competitor" — especially in engineering-led organizations.',
    pricing: 'Free software, expensive people. 1-2 engineers spending 30-50% of their time maintaining pipelines = $100-200k/year in loaded cost. Plus infrastructure costs.',
    strengths: [
      'Full control over every aspect of the pipeline',
      'No vendor dependency — own the code',
      'Can handle truly custom or niche data sources',
      'No licensing cost (just people and infrastructure)'
    ],
    weaknesses: [
      'Expensive: engineering time is the most costly resource in any company',
      'Fragile: custom scripts break when APIs change, schemas drift, or tokens expire',
      'No monitoring, alerting, or error recovery unless you build it yourself',
      'Key-person risk: if the engineer who built it leaves, nobody can maintain it',
      'Doesn\'t scale: 3 sources = manageable, 30 sources = a full-time job',
      'Opportunity cost: engineers maintaining pipelines aren\'t building product'
    ],
    positioning: 'DIY pipelines are technical debt disguised as a cost saving. Every hour an engineer spends fixing a broken API script is an hour not spent building product. Fivetran costs a fraction of one engineer\'s salary and handles 700+ sources with zero maintenance.',
    objections: [
      { q: '"We already built it — switching has a migration cost"', a: 'The migration cost is a one-time investment. The ongoing cost of maintaining custom pipelines is forever. How many hours per week does your team spend on pipeline maintenance right now? Multiply that by $150/hr.' },
      { q: '"Our engineers can build anything Fivetran does"', a: 'They can — but should they? Fivetran has 500+ engineers maintaining connectors full-time. When Salesforce changes their API, we update the connector in hours. Your team would spend days debugging. Let engineers build features, not plumbing.' },
      { q: '"We only have 3 data sources — it\'s simple"', a: 'It\'s simple today. Every company\'s source count grows. And even 3 sources need monitoring, error handling, schema change detection, and on-call coverage. That\'s not simple — it\'s invisible work that scales poorly.' }
    ]
  },
  {
    competitor: 'Talend',
    type: 'Enterprise ETL/ELT',
    summary: 'Open-source ETL tool (Talend Open Studio) with a commercial enterprise version. Acquired by Qlik in 2023. Java-based, code-heavy approach to data integration.',
    pricing: 'Open Studio: free. Talend Cloud: enterprise pricing, typically $50-200k+/year. Qlik acquisition has changed pricing structures.',
    strengths: [
      'Free open-source version for basic use',
      'Handles complex transformations with Java/code-based approach',
      'Broad integration capabilities beyond just data movement',
      'Part of Qlik ecosystem — bundled with analytics'
    ],
    weaknesses: [
      'Java-based — requires developer skills to build and maintain jobs',
      'Open-source version has no support, no monitoring, no scheduling',
      'Enterprise version is expensive and complex to deploy',
      'Product direction uncertain after Qlik acquisition (also owns Stitch)',
      'Slower setup than modern ELT tools — building a Talend job takes hours vs minutes in Fivetran',
      'ETL approach loses raw data'
    ],
    positioning: 'Talend is a powerful tool in the hands of a skilled developer. But most companies don\'t need that power for data movement — they need reliability, speed, and zero maintenance. Fivetran replaces weeks of Talend job development with minutes of connector setup.',
    objections: [
      { q: '"Talend is free and we already know it"', a: 'Talend Open Studio is free software with expensive operations. Every connector is a custom Java job that someone has to build, test, deploy, monitor, and maintain. Fivetran gives you a production-ready connector in 5 minutes.' },
      { q: '"Talend handles our complex ETL workflows"', a: 'Keep Talend for the truly complex workflows that need custom code. Move the standard data extraction to Fivetran — your Talend developers can focus on the hard problems instead of maintaining basic API pulls.' }
    ]
  }
];

function getCatCSS(cat) { return categoryConfig[cat]?.css || ''; }
function getCatDot(cat) { return categoryConfig[cat]?.dot || 'dot-data-integrity'; }
function getCatBadge(cat) { const c = categoryConfig[cat] || categoryConfig['Data Integrity']; return `background:${c.badgeBg};color:${c.badgeColor}`; }

// ─── TAB SWITCHING ──────────────────────────────────────
function switchTab(tab, btn) {
  document.querySelectorAll('.section').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.toolbar button').forEach(el => el.classList.remove('active'));
  document.getElementById(tab).classList.add('active');
  btn.classList.add('active');
  closeDetails();
  if (tab === 'troubleshoot') {
    loadErrorCodes();
    if (scannedConnectors.length > 0) {
      switchTroubleshootTab('known-issues', document.querySelectorAll('.troubleshoot-tab')[1]);
    }
  }
  if (tab === 'battlecards') {
    loadBattleCards();
  }
  if (tab === 'search') {
    renderRecentItems();
  }
}

function switchTroubleshootTab(tabName, btn) {
  document.getElementById('errors-tab').style.display = 'none';
  document.getElementById('known-issues-tab').style.display = 'none';
  document.querySelectorAll('.troubleshoot-tab').forEach(el => el.classList.remove('active'));
  btn.classList.add('active');
  if (tabName === 'errors') {
    document.getElementById('errors-tab').style.display = 'block';
  } else {
    document.getElementById('known-issues-tab').style.display = 'block';
    loadKnownIssuesTab();
  }
}

// ─── SCAN ──────────────────────────────────────
function scanDashboard() {
  const r = document.getElementById('scan-results');
  const scanBtn = document.querySelector('.scan-button');
  scanBtn.textContent = '⏳ Scanning...';
  scanBtn.disabled = true;

  // In Chrome extension mode, send message to content script
  if (typeof chrome !== 'undefined' && chrome.tabs) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];

      // Check if we're on fivetran.com
      if (!tab.url || !tab.url.includes('fivetran.com')) {
        r.innerHTML = `<div style="text-align:center;padding:20px;color:var(--ft-text-light);">
          <div style="font-size:28px;margin-bottom:8px;">🌐</div>
          <p style="font-size:13px;margin-bottom:8px;">Navigate to <strong>fivetran.com/dashboard</strong> to scan</p>
          <p style="font-size:11px;color:var(--ft-text-light);">Current page: ${tab.url?.split('/')[2] || 'unknown'}</p>
        </div>`;
        scanBtn.textContent = '⚡ Scan Fivetran Dashboard';
        scanBtn.disabled = false;
        return;
      }

      chrome.tabs.sendMessage(tab.id, { action: 'scan' }, (response) => {
        if (chrome.runtime.lastError || !response) {
          r.innerHTML = `<div style="text-align:center;padding:20px;color:var(--ft-text-light);">
            <div style="font-size:28px;margin-bottom:8px;">⚠️</div>
            <p style="font-size:13px;">Could not scan this page. Try refreshing.</p>
          </div>`;
          scanBtn.textContent = '⚡ Scan Fivetran Dashboard';
          scanBtn.disabled = false;
          return;
        }

        handleScanResults(response);
        scanBtn.textContent = '⚡ Scan Fivetran Dashboard';
        scanBtn.disabled = false;
      });
    });
  } else {
    // Prototype/JSFiddle simulation mode
    setTimeout(() => {
      const simulatedResults = {
        page: 'connections-list',
        count: 4,
        connections: [
          { connectionName: 'raw_salesforce', sourceType: 'Salesforce', destination: 'apollo_warehouse', status: 'Active' },
          { connectionName: 'raw_stripe', sourceType: 'Stripe', destination: 'apollo_warehouse', status: 'Active' },
          { connectionName: 'raw_hubspot', sourceType: 'HubSpot', destination: 'apollo_warehouse', status: 'Active' },
          { connectionName: 'raw_marketo', sourceType: 'Marketo', destination: 'apollo_warehouse', status: 'Paused' }
        ],
        timestamp: new Date().toISOString()
      };
      handleScanResults(simulatedResults);
      scanBtn.textContent = '⚡ Scan Fivetran Dashboard';
      scanBtn.disabled = false;
    }, 800);
  }
}

// Maps a scanned source-type string (e.g. "Google Analytics", "Amazon S3",
// "MongoDB") to the canonical connector id we use in Supabase / connectorData
// (e.g. "google_analytics", "s3", "mongo"). Returns null if no match.
function mapSourceTypeToKey(sourceType) {
  if (!sourceType) return null;
  const norm = String(sourceType).toLowerCase().trim();
  const underscored = norm.replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  if (!underscored) return null;

  if (connectorData[underscored]) return underscored;

  const stripped = underscored.replace(/^(amazon|google|microsoft|azure)_/, '');
  if (connectorData[stripped]) return stripped;

  // Explicit aliases for display-names that diverge from connector ids.
  const aliases = {
    mongodb: 'mongo',
    amazon_s3: 's3',
    amazon_dynamodb: 'dynamodb',
    amazon_aurora_mysql: 'aurora',
    aurora_mysql: 'aurora',
    amazon_aurora_postgresql: 'aurora_postgres',
    aurora_postgresql: 'aurora_postgres',
    azure_sql_database: 'azure_sql_db',
    azure_sql: 'azure_sql_db',
    postgresql: 'postgres_rds',
    postgres: 'postgres_rds',
    sqlserver: 'sql_server',
    ga4: 'google_analytics',
    google_analytics_4: 'google_analytics'
  };
  if (aliases[underscored]) return aliases[underscored];
  if (aliases[stripped]) return aliases[stripped];

  // Last-resort: match by display name on any loaded connector.
  for (const [id, data] of Object.entries(connectorData)) {
    const dataName = (data.name || '').toLowerCase().replace(/\s+/g, '_');
    if (dataName === underscored || dataName === stripped) return id;
  }
  return null;
}

function handleScanResults(response) {
  const r = document.getElementById('scan-results');

  if (response.page === 'connections-list' && response.connections?.length > 0) {
    // Match scanned connectors to our knowledge base. Dedupe by resolved
    // connector id so the same source type across multiple connections only
    // renders one card.
    scannedConnectors = [];
    const matchedByKey = new Map();
    const unmatchedSet = new Map();

    response.connections.forEach(conn => {
      const key = mapSourceTypeToKey(conn.sourceType);
      if (key && connectorData[key]) {
        if (!matchedByKey.has(key)) {
          scannedConnectors.push(key);
          matchedByKey.set(key, conn);
        }
      } else {
        const label = conn.sourceType || conn.connectionName || 'Unknown';
        if (!unmatchedSet.has(label)) unmatchedSet.set(label, conn);
      }
    });

    const matchedConnections = Array.from(matchedByKey.entries()).map(([key, conn]) => ({ ...conn, key }));
    const unmatchedConnections = Array.from(unmatchedSet.values());

    const totalUnique = matchedConnections.length + unmatchedConnections.length;
    const totalConns = response.totalConnections || totalUnique;
    r.innerHTML = `<div class="scan-status"><div class="check">✓</div><span>Found <strong>${totalUnique} connector type${totalUnique === 1 ? '' : 's'}</strong>${totalConns > totalUnique ? ` across ${totalConns} connections` : ''}</span></div>`;

    // Matched: we have a Supabase knowledge-base entry for this source type.
    if (matchedConnections.length > 0) {
      r.innerHTML += matchedConnections.map(conn => {
        const c = connectorData[conn.key];
        const issueCount = (c.knownIssues || []).length;
        const instanceCount = conn.instanceCount || 1;
        const countBadge = instanceCount > 1
          ? `<span style="font-size:10px;color:var(--ft-text-light);margin-left:4px;">×${instanceCount}</span>`
          : '';
        const issueBadge = issueCount
          ? `<span style="margin-left:auto;font-size:10px;font-weight:600;color:var(--ft-blue);background:#E8EEFC;padding:2px 8px;border-radius:4px;">${issueCount} known issue${issueCount === 1 ? '' : 's'}</span>`
          : '';
        return `<div class="detected-item" data-action="showConnectorDetails" data-key="${conn.key}">
          <div class="detected-name">
            <div class="connector-icon ${c.iconClass}">${c.icon}</div>
            ${c.name}${countBadge}
            ${issueBadge}
          </div>
        </div>`;
      }).join('');
    }

    // Unmatched: source type detected but no knowledge-base entry yet.
    if (unmatchedConnections.length > 0) {
      r.innerHTML += `<div class="category-header" style="margin-top:14px;">No knowledge base entry yet</div>`;
      r.innerHTML += unmatchedConnections.map(conn => {
        const label = conn.sourceType || conn.connectionName || 'Unknown';
        const instanceCount = conn.instanceCount || 1;
        const countBadge = instanceCount > 1
          ? `<span style="font-size:10px;color:var(--ft-text-light);margin-left:4px;">×${instanceCount}</span>`
          : '';
        return `<div class="detected-item" style="opacity:0.65;cursor:default;">
          <div class="detected-name">
            <div class="connector-icon" style="background:var(--ft-text-light);">?</div>
            ${label}${countBadge}
          </div>
        </div>`;
      }).join('');
    }

    // Recommendations based on scanned connectors
    const recoHtml = renderRecommendations(scannedConnectors);
    if (recoHtml) {
      r.innerHTML += `<div style="margin-top:14px;">${recoHtml}</div>`;
    }

    // Export scan briefing button
    r.innerHTML += `<div style="margin-top:12px;"><span class="export-btn" data-action="exportScanBriefing">📋 Copy scan briefing to clipboard</span></div>`;

  } else if (response.page === 'connector-detail') {
    // Single connector detail view
    const key = response.sourceType?.toLowerCase().replace(/\s+/g, '');
    if (key && connectorData[key]) {
      scannedConnectors = [key];
      const c = connectorData[key];
      r.innerHTML = `<div class="scan-status"><div class="check">✓</div><span>Viewing <strong>${c.name}</strong> connector</span></div>`;

      if (response.tables?.length > 0) {
        r.innerHTML += `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--ft-text-light);margin:12px 0 8px;">Tables detected (${response.tables.length})</div>`;
        r.innerHTML += response.tables.slice(0, 10).map(t => {
          const marInfo = t.totalMAR ? ` · ${t.totalMAR.toLocaleString()} MAR` : '';
          const enabledInfo = t.source === 'schema' ? (t.enabled ? ' ✅' : ' ⬜') : '';
          return `<div style="padding:6px 0;font-size:12px;color:var(--ft-text-mid);border-bottom:1px solid #F1F3F8;">
            ${t.name}${enabledInfo}<span style="float:right;color:var(--ft-text-light);">${marInfo}</span>
          </div>`;
        }).join('');
        if (response.tables.length > 10) {
          r.innerHTML += `<div style="font-size:11px;color:var(--ft-blue);font-weight:600;margin-top:8px;">+ ${response.tables.length - 10} more tables</div>`;
        }
      }

      r.innerHTML += `<div class="detected-item" style="margin-top:12px;" data-action="showConnectorDetails" data-key="${key}">
        <div class="detected-name"><div class="connector-icon ${c.iconClass}">${c.icon}</div>View ${c.name} details & known issues →</div>
      </div>`;
    }
  } else {
    r.innerHTML = `<div class="empty-state">
      <div class="icon">📡</div>
      <p>${response.message || 'No connectors detected on this page'}</p>
    </div>`;
  }
}

// ─── ERROR ANALYSIS (paste-based) ──────────────────────────────────────
function setupConnectorAutocomplete() {
  const input = document.getElementById('error-connector-input');
  const hidden = document.getElementById('error-connector-key');
  const dropdown = document.getElementById('error-connector-dropdown');
  if (!input || !dropdown || !hidden) return;

  function renderDropdown(query) {
    const q = query.toLowerCase();
    const matches = Object.entries(connectorData)
      .filter(([k, c]) => k.includes(q) || c.name.toLowerCase().includes(q))
      .sort((a, b) => a[1].name.localeCompare(b[1].name))
      .slice(0, 8);

    if (!q || matches.length === 0) {
      dropdown.style.display = 'none';
      return;
    }

    dropdown.style.display = 'block';
    dropdown.innerHTML = matches.map(([key, c]) =>
      `<div class="error-connector-option" data-key="${key}" style="display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:pointer;font-size:12px;border-bottom:1px solid #F1F3F8;">
        <div class="connector-icon ${c.iconClass}" style="width:20px;height:20px;font-size:10px;flex-shrink:0;">${c.icon}</div>
        <span>${c.name}</span>
        <span style="margin-left:auto;font-size:10px;color:var(--ft-text-light);">${(c.knownIssues || []).length} issues</span>
      </div>`
    ).join('');
  }

  input.addEventListener('input', () => {
    hidden.value = '';
    renderDropdown(input.value);
  });

  input.addEventListener('focus', () => {
    if (input.value) renderDropdown(input.value);
  });

  dropdown.addEventListener('click', (e) => {
    const opt = e.target.closest('.error-connector-option');
    if (!opt) return;
    const key = opt.dataset.key;
    const c = connectorData[key];
    if (!c) return;
    input.value = c.name;
    hidden.value = key;
    dropdown.style.display = 'none';
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#error-connector-input') && !e.target.closest('#error-connector-dropdown')) {
      dropdown.style.display = 'none';
    }
  });
}

function analyzeError() {
  const input = document.getElementById('error-paste-input');
  const text = (input?.value || '').trim();
  const selectedKey = document.getElementById('error-connector-key')?.value || '';
  const r = document.getElementById('error-analysis-results');

  if (!text) {
    r.innerHTML = `<p style="color:var(--ft-text-light);font-size:12px;">Paste an error message above to get troubleshooting guidance.</p>`;
    return;
  }

  const errLower = text.toLowerCase();
  let html = '';

  // 1. Match against HTTP error codes in troubleshootingData.
  const matchedCodes = [];
  for (let i = 0; i < troubleshootingData.length; i++) {
    const ts = troubleshootingData[i];
    const code = (ts.errorCode || '').toString();
    if (code && errLower.includes(code)) {
      matchedCodes.push({ idx: i, ...ts });
    }
  }

  if (matchedCodes.length === 0) {
    for (let i = 0; i < troubleshootingData.length; i++) {
      const ts = troubleshootingData[i];
      const keywords = (ts.title || '').toLowerCase().split(/[\s–-]+/).filter(w => w.length > 4);
      if (keywords.some(w => errLower.includes(w))) {
        matchedCodes.push({ idx: i, ...ts });
      }
    }
  }

  if (matchedCodes.length > 0) {
    html += `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--ft-text-light);margin-bottom:8px;">Error Code Match</div>`;
    html += matchedCodes.map(mc => `<div style="padding:10px 12px;margin-bottom:8px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;cursor:pointer;" data-action="showTroubleshootingDetails" data-idx="${mc.idx}">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
        <span style="font-size:14px;font-weight:800;color:#92400e;">${mc.errorCode}</span>
        <span style="font-size:13px;font-weight:700;color:var(--ft-text-dark);">${mc.title}</span>
      </div>
      <div style="font-size:11px;color:var(--ft-text-mid);">${mc.diagnosis?.substring(0, 150) || mc.preview}...</div>
      <div style="font-size:11px;color:var(--ft-blue);font-weight:600;margin-top:4px;">View full troubleshooting guide →</div>
    </div>`).join('');
  }

  // 2. If a connector is selected, search its known issues for keyword matches.
  if (selectedKey && connectorData[selectedKey]?.knownIssues) {
    const c = connectorData[selectedKey];
    const errWords = errLower.split(/\s+/).filter(w => w.length > 3);
    const scored = c.knownIssues.map((issue, idx) => {
      const fields = [issue.title, issue.preview, issue.rootCause, issue.resolution].join(' ').toLowerCase();
      let score = 0;
      for (const w of errWords) { if (fields.includes(w)) score++; }
      return { issue, idx, score };
    }).filter(s => s.score >= 2).sort((a, b) => b.score - a.score);

    if (scored.length > 0) {
      html += `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--ft-text-light);margin:12px 0 8px;">${c.name} Known Issues</div>`;
      html += scored.map(({ issue, idx }) => `<div style="padding:10px 12px;margin-bottom:8px;background:#F0F4FF;border:1px solid #C7D7FE;border-radius:8px;cursor:pointer;" data-action="showKnownIssueDetails" data-key="${selectedKey}" data-idx="${idx}">
        <div style="font-weight:700;font-size:12px;color:var(--ft-text-dark);margin-bottom:4px;">${issue.title}</div>
        <div style="font-size:11px;color:var(--ft-text-mid);">${issue.preview}</div>
        <div style="font-size:11px;color:var(--ft-blue);font-weight:600;margin-top:4px;">View details →</div>
      </div>`).join('');
    }
  }

  if (!html) {
    html = `<div style="padding:12px;background:#F9FAFB;border:1px solid var(--ft-border);border-radius:8px;font-size:12px;">
      <div style="font-weight:700;color:var(--ft-text-dark);margin-bottom:6px;">No matches found</div>
      <div style="color:var(--ft-text-mid);">Try selecting a connector above, or browse the error codes and <strong>Known Issues</strong> tab.</div>
    </div>`;
  }

  r.innerHTML = html;
}

// ─── ERROR CODES ──────────────────────────────────────
function loadErrorCodes() {
  document.getElementById('error-codes').innerHTML = troubleshootingData.map((item, idx) => `
    <div class="error-code-item" data-action="showTroubleshootingDetails" data-idx="${idx}">
      <div class="error-code-number">${item.errorCode}</div>
      <div class="error-code-label">${item.title.split('–')[1]?.trim() || item.title}</div>
    </div>
  `).join('');
}

// ─── BATTLE CARDS ──────────────────────────────────────
function loadBattleCards() {
  const list = document.getElementById('battlecard-list');
  if (!list) return;
  list.innerHTML = battleCardData.map((card, idx) => `
    <div class="battlecard-item" data-action="showBattleCardDetails" data-idx="${idx}">
      <div style="display:flex;align-items:center;gap:8px;">
        <div style="font-size:15px;font-weight:800;color:var(--ft-text);">${card.competitor}</div>
        <span style="font-size:10px;font-weight:600;color:var(--ft-text-light);background:var(--ft-bg);padding:2px 8px;border-radius:4px;">${card.type}</span>
      </div>
      <div style="font-size:12px;color:var(--ft-text-mid);margin-top:4px;line-height:1.5;">${card.summary}</div>
    </div>
  `).join('');
}

function showBattleCardDetails(idx) {
  const card = battleCardData[idx];
  const d = document.getElementById('details');
  addRecentItem('battlecard', idx, card.competitor);
  d.innerHTML = `
    <div class="close" data-action="closeDetails">← Back</div>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
      <div class="detail-title" style="margin-bottom:0;">${card.competitor}</div>
      <span style="font-size:11px;font-weight:600;color:var(--ft-blue);background:var(--ft-blue-light);padding:3px 10px;border-radius:5px;">${card.type}</span>
    </div>
    <div style="font-size:12px;color:var(--ft-text-mid);margin:8px 0 16px;line-height:1.6;">${card.summary}</div>

    <div class="detail-section">
      <div class="detail-label">Their Pricing</div>
      <div class="detail-text">${card.pricing}</div>
    </div>

    <div class="detail-section">
      <div class="detail-label" style="color:#16a34a;">Their Strengths (know these)</div>
      <div style="margin-top:6px;">${card.strengths.map(s => `<div style="font-size:12px;color:var(--ft-text-mid);padding:4px 0 4px 12px;border-left:3px solid #86efac;margin-bottom:4px;line-height:1.5;">${s}</div>`).join('')}</div>
    </div>

    <div class="detail-section">
      <div class="detail-label" style="color:#dc2626;">Their Weaknesses (exploit these)</div>
      <div style="margin-top:6px;">${card.weaknesses.map(w => `<div style="font-size:12px;color:var(--ft-text-mid);padding:4px 0 4px 12px;border-left:3px solid #fca5a5;margin-bottom:4px;line-height:1.5;">${w}</div>`).join('')}</div>
    </div>

    <div class="detail-section">
      <div class="detail-label" style="color:var(--ft-blue);">How to Position Fivetran</div>
      <div style="font-size:12px;color:var(--ft-text-mid);line-height:1.7;padding:10px 12px;background:var(--ft-blue-light);border-radius:8px;border:1px solid var(--ft-blue-mid);margin-top:6px;">${card.positioning}</div>
      <div style="margin-top:6px;text-align:right;"><span class="copy-btn" data-action="copyText" data-text="${card.positioning.replace(/"/g, '&quot;')}">Copy positioning</span></div>
    </div>

    <div class="detail-section">
      <div class="detail-label">Handle Their Objections</div>
      ${card.objections.map(obj => `
        <div style="margin-top:8px;padding:10px 12px;background:#FAFBFE;border:1.5px solid var(--ft-border);border-radius:8px;">
          <div style="font-size:12px;font-weight:700;color:var(--ft-text);margin-bottom:6px;">${obj.q}</div>
          <div style="font-size:12px;color:var(--ft-text-mid);line-height:1.6;">${obj.a}</div>
          <div style="margin-top:6px;text-align:right;"><span class="copy-btn" data-action="copyText" data-text="${obj.a.replace(/"/g, '&quot;')}">Copy response</span></div>
        </div>
      `).join('')}
    </div>`;
  openDetails();
}

// ─── KNOWN ISSUES ──────────────────────────────────────
function loadKnownIssuesTab() {
  const filterDiv = document.getElementById('known-issue-filter');
  const pickerDiv = document.getElementById('known-issue-connector-picker');
  const resultsDiv = document.getElementById('known-issue-results');

  // If scanned connectors exist, show filter badge and auto-limit to scanned
  const connectorsToShow = scannedConnectors.length > 0 ? scannedConnectors : Object.keys(connectorData);

  if (scannedConnectors.length > 0) {
    filterDiv.innerHTML = `<div class="filter-badge"><div class="dot"></div> Showing connectors detected on dashboard</div>`;
  } else {
    filterDiv.innerHTML = '';
  }

  // Build connector picker buttons
  pickerDiv.innerHTML = `<div class="connector-picker">
    ${connectorsToShow.map(key => {
      const c = connectorData[key];
      return `<button class="connector-pick-btn" data-action="selectConnectorIssues" data-key="${key}">
        <div class="connector-icon ${c.iconClass}">${c.icon}</div>
        <span class="connector-pick-name">${c.name}</span>
        <span class="connector-pick-count">${c.knownIssues.length} issues</span>
      </button>`;
    }).join('')}
  </div>`;

  resultsDiv.innerHTML = '';

  if (connectorsToShow.length > 0) {
    const firstBtn = pickerDiv.querySelector('.connector-pick-btn');
    if (firstBtn) selectConnectorIssues(connectorsToShow[0], firstBtn);
  }
}

function selectConnectorIssues(connectorKey, btn) {
  // Highlight selected button
  document.querySelectorAll('.connector-pick-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  const connector = connectorData[connectorKey];
  const resultsDiv = document.getElementById('known-issue-results');

  // Group issues by category
  const grouped = {};
  connector.knownIssues.forEach(issue => { const cat = issue.category || 'General'; if (!grouped[cat]) grouped[cat] = []; grouped[cat].push(issue); });

  let html = `<div style="margin-top:12px;">
    <div class="connector-section-header">
      <div class="connector-icon ${connector.iconClass}">${connector.icon}</div>
      <h3>${connector.name}</h3>
      <span style="font-size:11px;color:var(--ft-text-light);margin-left:auto;">${connector.knownIssues.length} issues</span>
    </div>`;

  ['Data Integrity','Errors','FAQ','How To','Setup','Syncs'].forEach(cat => {
    if (!grouped[cat]) return;
    html += `<div class="category-header"><div class="category-dot ${getCatDot(cat)}"></div>${cat}</div>`;
    grouped[cat].forEach(issue => {
      const globalIdx = connector.knownIssues.indexOf(issue);
      html += `<div class="known-issue-item ${getCatCSS(cat)}" data-action="showKnownIssueDetails" data-key="${connectorKey}" data-idx="${globalIdx}">
        <div class="issue-title">${issue.title}</div>
        <div class="issue-preview">${issue.preview}</div>
      </div>`;
    });
  });

  html += `<div style="margin-top:10px;"><a href="${connector.docsUrl}/troubleshooting" target="_blank" style="display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:var(--ft-blue);text-decoration:none;padding:8px 12px;background:var(--ft-blue-light);border-radius:6px;border:1.5px solid var(--ft-border);width:100%;justify-content:center;">📄 View full ${connector.name} troubleshooting docs →</a></div>`;
  html += '</div>';
  resultsDiv.innerHTML = html;
}

// ─── FAVORITES (localStorage) ──────────────────────────────────────
function getFavorites() {
  try { return JSON.parse(localStorage.getItem('ft-scout-favorites') || '[]'); } catch { return []; }
}
function toggleFavorite(key) {
  let favs = getFavorites();
  if (favs.includes(key)) { favs = favs.filter(f => f !== key); }
  else { favs.push(key); }
  localStorage.setItem('ft-scout-favorites', JSON.stringify(favs));
  return favs.includes(key);
}
function isFavorite(key) { return getFavorites().includes(key); }

// ─── RECENT ITEMS (localStorage) ──────────────────────────────────────
function getRecentItems() {
  try { return JSON.parse(localStorage.getItem('ft-scout-recent') || '[]'); } catch { return []; }
}
function addRecentItem(type, id, label) {
  const recents = getRecentItems().filter(r => !(r.type === type && r.id === id));
  recents.unshift({ type, id, label, ts: Date.now() });
  localStorage.setItem('ft-scout-recent', JSON.stringify(recents.slice(0, 10)));
}
function renderRecentItems() {
  const section = document.getElementById('recent-section');
  if (!section) return;
  let html = '';

  // Favorites
  const favs = getFavorites();
  if (favs.length > 0) {
    html += `<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--ft-text-light);margin-bottom:6px;">★ Favorites</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">
        ${favs.map(key => {
          const c = connectorData[key];
          if (!c) return '';
          return `<div class="recent-chip fav-chip" data-action="showConnectorDetails" data-key="${key}">
            <span class="connector-icon ${c.iconClass}" style="width:16px;height:16px;font-size:9px;">${c.icon}</span> ${c.name}
          </div>`;
        }).join('')}
      </div>`;
  }

  // Recents
  const recents = getRecentItems();
  if (recents.length > 0) {
    html += `<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--ft-text-light);margin-bottom:6px;">Recently Viewed</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;">
        ${recents.slice(0, 6).map(r => {
          const icon = r.type === 'connector' ? '🔌' : r.type === 'glossary' ? '📚' : r.type === 'battlecard' ? '⚔️' : '📋';
          const action = r.type === 'connector' ? `data-action="showConnectorDetails" data-key="${r.id}"` :
                         r.type === 'glossary' ? `data-action="showGlossaryDetails" data-idx="${r.id}"` :
                         r.type === 'battlecard' ? `data-action="showBattleCardDetails" data-idx="${r.id}"` : '';
          return `<div class="recent-chip" ${action}>${icon} ${r.label}</div>`;
        }).join('')}
      </div>`;
  }

  section.innerHTML = html;
}

// ─── UNIVERSAL SEARCH ──────────────────────────────────────
document.getElementById('search-input')?.addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase().trim();
  const r = document.getElementById('universal-results');
  const recentSection = document.getElementById('recent-section');

  if (!q) {
    r.innerHTML = '<div class="empty-state"><div class="icon">🔍</div><p>Search across connectors, known issues,<br/>glossary terms, error codes & competitors</p></div>';
    if (recentSection) recentSection.style.display = '';
    renderRecentItems();
    return;
  }
  if (recentSection) recentSection.style.display = 'none';

  let html = '';
  const maxPerSection = 3;

  // 1. Connectors
  const connMatches = Object.entries(connectorData).filter(([k, c]) => k.includes(q) || c.name.toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q));
  if (connMatches.length > 0) {
    html += `<div class="search-section-label">Connectors (${connMatches.length})</div>`;
    html += connMatches.slice(0, maxPerSection).map(([k, c]) => `<div class="connector-card" data-action="showConnectorDetails" data-key="${k}">
        <div class="connector-name" style="display:flex;align-items:center;gap:6px;">
          <div class="connector-icon ${c.iconClass}" style="width:20px;height:20px;font-size:11px;">${c.icon}</div>${c.name}
        </div>
        <div class="connector-description">${c.description}</div>
      </div>`).join('');
    if (connMatches.length > maxPerSection) html += `<div class="search-more">+ ${connMatches.length - maxPerSection} more connectors</div>`;
  }

  // 2. Known Issues (across all connectors)
  const issueMatches = [];
  Object.entries(connectorData).forEach(([key, c]) => {
    (c.knownIssues || []).forEach((issue, idx) => {
      const fields = [issue.title, issue.preview, issue.rootCause || '', issue.resolution || ''].join(' ').toLowerCase();
      if (fields.includes(q)) issueMatches.push({ key, idx, issue, connName: c.name });
    });
  });
  if (issueMatches.length > 0) {
    html += `<div class="search-section-label">Known Issues (${issueMatches.length})</div>`;
    html += issueMatches.slice(0, maxPerSection).map(m => `<div class="known-issue-item" style="margin-bottom:8px;" data-action="showKnownIssueDetails" data-key="${m.key}" data-idx="${m.idx}">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;"><span style="font-size:10px;font-weight:600;color:var(--ft-blue);background:var(--ft-blue-light);padding:1px 6px;border-radius:3px;">${m.connName}</span></div>
        <div class="issue-title">${m.issue.title}</div>
        <div class="issue-preview">${m.issue.preview}</div>
      </div>`).join('');
    if (issueMatches.length > maxPerSection) html += `<div class="search-more">+ ${issueMatches.length - maxPerSection} more issues</div>`;
  }

  // 3. Glossary
  const glossMatches = glossaryData.map((item, idx) => ({ item, idx })).filter(({ item }) => item.term.toLowerCase().includes(q) || item.simple.toLowerCase().includes(q) || item.detailed.toLowerCase().includes(q));
  if (glossMatches.length > 0) {
    html += `<div class="search-section-label">Glossary (${glossMatches.length})</div>`;
    html += glossMatches.slice(0, maxPerSection).map(({ item, idx }) => `<div class="glossary-item" data-action="showGlossaryDetails" data-idx="${idx}"><div class="glossary-term">${item.term}</div><div class="glossary-simple">${item.simple}</div></div>`).join('');
    if (glossMatches.length > maxPerSection) html += `<div class="search-more">+ ${glossMatches.length - maxPerSection} more terms</div>`;
  }

  // 4. Error Codes
  const errMatches = troubleshootingData.map((item, idx) => ({ item, idx })).filter(({ item }) => item.errorCode.includes(q) || item.title.toLowerCase().includes(q) || item.diagnosis.toLowerCase().includes(q));
  if (errMatches.length > 0) {
    html += `<div class="search-section-label">Error Codes (${errMatches.length})</div>`;
    html += errMatches.slice(0, maxPerSection).map(({ item, idx }) => `<div class="error-code-item" style="text-align:left;padding:10px 12px;display:flex;align-items:center;gap:10px;" data-action="showTroubleshootingDetails" data-idx="${idx}">
        <div class="error-code-number">${item.errorCode}</div>
        <div><div style="font-size:12px;font-weight:600;color:var(--ft-text);">${item.title}</div><div style="font-size:11px;color:var(--ft-text-light);">${item.preview}</div></div>
      </div>`).join('');
  }

  // 5. Battle Cards
  const battleMatches = battleCardData.map((card, idx) => ({ card, idx })).filter(({ card }) => card.competitor.toLowerCase().includes(q) || card.type.toLowerCase().includes(q) || card.summary.toLowerCase().includes(q));
  if (battleMatches.length > 0) {
    html += `<div class="search-section-label">Competitors (${battleMatches.length})</div>`;
    html += battleMatches.slice(0, maxPerSection).map(({ card, idx }) => `<div class="battlecard-item" data-action="showBattleCardDetails" data-idx="${idx}">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="font-size:14px;font-weight:800;color:var(--ft-text);">⚔️ ${card.competitor}</div>
          <span style="font-size:10px;font-weight:600;color:var(--ft-text-light);background:var(--ft-bg);padding:2px 8px;border-radius:4px;">${card.type}</span>
        </div>
      </div>`).join('');
  }

  if (!html) {
    html = '<p style="color:var(--ft-text-light);font-size:13px;padding:12px 0;text-align:center;">No results found for "' + e.target.value + '"</p>';
  }
  r.innerHTML = html;
});

document.getElementById('error-paste-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); analyzeError(); }
});

document.getElementById('glossary-input')?.addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  const r = document.getElementById('glossary-results');
  if (!q) { r.innerHTML = '<div class="empty-state"><div class="icon">📚</div><p>Type a term to search the glossary</p></div>'; return; }
  const m = glossaryData.filter(i => i.term.toLowerCase().includes(q) || i.simple.toLowerCase().includes(q) || i.category.toLowerCase().includes(q));
  r.innerHTML = m.length === 0 ? '<p style="color:var(--ft-text-light);font-size:13px;">No terms found</p>'
    : m.map(item => { const idx = glossaryData.indexOf(item); return `<div class="glossary-item" data-action="showGlossaryDetails" data-idx="${idx}"><div class="glossary-term">${item.term}</div><div class="glossary-simple">${item.simple}</div><div class="glossary-category">${item.category}</div></div>`; }).join('');
});

// ─── DETAIL VIEWS ──────────────────────────────────────
function showConnectorDetails(key) {
  const c = connectorData[key]; if (!c) return; const d = document.getElementById('details');
  addRecentItem('connector', key, c.name);
  const starred = isFavorite(key);
  d.innerHTML = `
    <div class="close" data-action="closeDetails">← Back</div>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
      <div class="connector-icon ${c.iconClass}" style="width:32px;height:32px;font-size:16px;">${c.icon}</div>
      <div class="detail-title" style="margin-bottom:0;">${c.name}</div>
      <span class="fav-star ${starred ? 'active' : ''}" data-action="toggleFavorite" data-key="${key}">${starred ? '★' : '☆'}</span>
    </div>
    <div class="detail-section"><div class="detail-label">What it does</div><div class="detail-text">${c.whatItDoes}</div></div>
    <div class="detail-section"><div class="detail-label">Useful for</div><div class="detail-text">${c.usefulFor}</div></div>
    <div class="detail-section"><div class="detail-label">Tables (${c.tables.length})</div>
      ${c.tables.map((t, i) => `<div class="table-detail-row"><div class="table-name-link"><span>${t.name}</span><a class="learn-more" data-action="showTableDetails" data-key="${key}" data-idx="${i}">Details →</a></div></div>`).join('')}
    </div>
    <div class="detail-section"><div class="detail-label">Known Issues (${c.knownIssues.length})</div>
      ${c.knownIssues.slice(0, 3).map((issue, i) => `<div class="known-issue-item ${getCatCSS(issue.category)}" style="margin-top:6px;" data-action="showKnownIssueDetails" data-key="${key}" data-idx="${i}"><div class="issue-title">${issue.title}</div><div class="issue-preview">${issue.preview}</div></div>`).join('')}
      ${c.knownIssues.length > 3 ? `<div style="text-align:center;margin-top:8px;"><a class="learn-more" data-action="viewAllIssues" data-key="${key}">View all ${c.knownIssues.length} issues →</a></div>` : ''}
    </div>
    ${c.docsUrl ? `<div class="detail-section" style="margin-top:4px;"><a href="${c.docsUrl}" target="_blank" style="display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:var(--ft-blue);text-decoration:none;padding:10px 14px;background:var(--ft-blue-light);border-radius:8px;border:1.5px solid var(--ft-border);width:100%;justify-content:center;">📄 View full Fivetran docs →</a></div>` : ''}
    <div class="detail-section"><span class="export-btn" data-action="exportBriefing" data-key="${key}">📋 Copy briefing to clipboard</span></div>`;
  openDetails();
}

function showTableDetails(key, idx) {
  const c = connectorData[key]; const t = c.tables[idx]; const d = document.getElementById('details');
  d.innerHTML = `
    <div class="close" data-action="showConnectorDetails" data-key="${key}">← Back to ${c.name}</div>
    <div class="detail-title">${c.name} → ${t.name}</div>
    <div class="detail-section"><div class="detail-label">What it contains</div><div class="detail-text">${t.whatContains}</div></div>
    <div class="detail-section"><div class="detail-label">Why it matters</div><div class="detail-text">${t.whyMatters}</div></div>
    ${t.keyCallouts ? `<div class="detail-section"><div class="detail-label">Key callouts</div><div class="detail-text" style="color:#b45309;background:#fffbeb;padding:10px 12px;border-radius:8px;border:1px solid #fde68a;">⚡ ${t.keyCallouts}</div></div>` : ''}`;
  openDetails();
}

function showKnownIssueDetails(key, idx) {
  const c = connectorData[key]; const issue = c.knownIssues[idx]; const d = document.getElementById('details');
  const cat = issue.category || 'General';
  const isDeepNav = d.classList.contains('active');
  const backHtml = isDeepNav
    ? `<div class="close" data-action="showConnectorDetails" data-key="${key}">← Back to ${c.name}</div>`
    : `<div class="close" data-action="closeDetails">← Back</div>`;
  let html = `
    ${backHtml}
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
      <div class="connector-icon ${c.iconClass}" style="width:20px;height:20px;font-size:10px;">${c.icon}</div>
      <span style="font-size:12px;color:var(--ft-text-mid);">${c.name}</span>
      <span class="issue-cat-badge" style="${getCatBadge(cat)}">${cat}</span>
    </div>
    <div class="detail-title" style="margin-top:8px;">${issue.title}</div>`;
  if (issue.rootCause) html += `<div class="detail-section"><div class="detail-label">Root Cause</div><div class="detail-text">${issue.rootCause}</div></div>`;
  if (issue.impact) html += `<div class="detail-section"><div class="detail-label">Impact</div><div class="detail-text">${issue.impact}</div></div>`;
  if (issue.resolution) html += `<div class="detail-section"><div class="detail-label">Resolution</div><div class="detail-text">${issue.resolution}</div><div style="margin-top:6px;text-align:right;"><span class="copy-btn" data-action="copyText" data-text="${issue.resolution.replace(/"/g, '&quot;')}">Copy resolution</span></div></div>`;
  if (issue.subIssues?.length) {
    html += `<div class="detail-section"><div class="detail-label">Sub-Issues (${issue.subIssues.length})</div>`;
    issue.subIssues.forEach(s => { html += `<div class="sub-issue"><div class="sub-issue-title">${s.title}</div><div class="sub-issue-text">${s.explanation}</div></div>`; });
    html += '</div>';
  }
  d.innerHTML = html; openDetails();
}

function showTroubleshootingDetails(idx) {
  const item = troubleshootingData[idx]; const d = document.getElementById('details');
  const rootCauseColors = {
    'Credentials (#1)': { bg: '#FEF3C7', color: '#92400E', label: '🔑 Big 3: Credentials' },
    'Address (#2)': { bg: '#DBEAFE', color: '#1E40AF', label: '🔗 Big 3: Address/Endpoint' },
    'Permissions (#3)': { bg: '#FCE7F3', color: '#9D174D', label: '🔒 Big 3: Permissions' },
    'Rate Limited': { bg: '#FEF3C7', color: '#92400E', label: '⏱️ Rate Limited' },
    'Escalate': { bg: '#FEF2F2', color: '#991B1B', label: '⬆️ Escalate' },
    'Server-side': { bg: '#FEF2F2', color: '#991B1B', label: '🖥️ Server-side' }
  };
  const rc = rootCauseColors[item.rootCause] || { bg: '#F3F4F6', color: '#374151', label: item.rootCause };
  d.innerHTML = `
    <div class="close" data-action="closeDetails">← Back</div>
    <div class="detail-title">${item.errorCode} — ${item.title}</div>
    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">
      <div class="error-badge">${item.errorCode}</div>
      <div style="display:inline-block;font-size:10px;font-weight:700;padding:3px 8px;border-radius:5px;background:${rc.bg};color:${rc.color};">${rc.label}</div>
    </div>
    <div class="detail-section"><div class="detail-label">Diagnosis</div><div class="detail-text">${item.diagnosis}</div></div>
    <div class="detail-section"><div class="detail-label">Action</div>
      ${item.steps.map(s => `<div class="solution-step"><div class="step-title">${s.title}</div><div class="step-text">${s.text}</div></div>`).join('')}
      <div style="margin-top:8px;text-align:right;"><span class="copy-btn" data-action="copyText" data-text="${item.steps.map(s => s.title + ': ' + s.text).join('\n\n').replace(/"/g, '&quot;')}">Copy all steps</span></div>
    </div>
    ${item.escalate ? '<div style="margin-top:12px;padding:10px 14px;background:#fef2f2;border-radius:8px;font-size:12px;color:#991b1b;font-weight:600;border:1px solid #FECACA;">⬆️ Escalate to support team</div>' : '<div style="margin-top:12px;padding:10px 14px;background:#F0FDF4;border-radius:8px;font-size:12px;color:#166534;font-weight:600;border:1px solid #BBF7D0;">✅ Try to resolve — check Big 3 first</div>'}`;
  openDetails();
}

function showGlossaryDetails(idx) {
  const item = glossaryData[idx]; const d = document.getElementById('details');
  addRecentItem('glossary', idx, item.term);
  d.innerHTML = `
    <div class="close" data-action="closeDetails">← Back</div>
    <div class="detail-title">${item.term}</div>
    <div class="glossary-category" style="margin-bottom:14px;">${item.category}</div>
    <div class="detail-section"><div class="detail-label">Simple Definition</div><div class="detail-text">${item.simple}</div></div>
    <div class="detail-section"><div class="detail-label">Detailed Explanation</div><div class="detail-text">${item.detailed}</div><div style="margin-top:6px;text-align:right;"><span class="copy-btn" data-action="copyText" data-text="${item.detailed.replace(/"/g, '&quot;')}">Copy explanation</span></div></div>
    <div class="detail-section"><div class="detail-label">Why It Matters</div><div class="detail-text">${item.whyMatters}</div></div>
    <div class="detail-section"><div class="detail-label">Example</div><div class="detail-text" style="background:#f0fdf4;padding:10px 12px;border-radius:8px;border:1px solid #bbf7d0;">💡 ${item.example}</div></div>`;
  openDetails();
}

function closeDetails() {
  document.getElementById('details').classList.remove('active');
  document.querySelector('.content').classList.remove('showing-details');
}

function openDetails() {
  const content = document.querySelector('.content');
  const details = document.getElementById('details');
  content.classList.add('showing-details');
  details.classList.add('active');
  content.scrollTop = 0;
}

// ─── COPY TO CLIPBOARD ──────────────────────────────────────
function copyToClipboard(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    btn.style.color = '#16a34a';
    setTimeout(() => { btn.textContent = original; btn.style.color = ''; }, 1500);
  });
}

// ─── EVENT DELEGATION ──────────────────────────────────────
// MV3 CSP blocks inline onclick handlers. Every interactive element uses
// data-action (+ optional data-* payload) and is dispatched here.
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  if (el.dataset.stop === '1') e.stopPropagation();

  const action = el.dataset.action;
  const key = el.dataset.key;
  const idx = el.dataset.idx !== undefined ? parseInt(el.dataset.idx, 10) : undefined;

  switch (action) {
    case 'switchTab':
      switchTab(el.dataset.tab, el);
      break;
    case 'switchTroubleshootTab':
      switchTroubleshootTab(el.dataset.tsTab, el);
      break;
    case 'scanDashboard':
      scanDashboard();
      break;
    case 'analyzeError':
      analyzeError();
      break;
    case 'showConnectorDetails':
      showConnectorDetails(key);
      break;
    case 'showTableDetails':
      showTableDetails(key, idx);
      break;
    case 'selectConnectorIssues':
      selectConnectorIssues(key, el);
      break;
    case 'showKnownIssueDetails':
      showKnownIssueDetails(key, idx);
      break;
    case 'showTroubleshootingDetails':
      showTroubleshootingDetails(idx);
      break;
    case 'showGlossaryDetails':
      showGlossaryDetails(idx);
      break;
    case 'showBattleCardDetails':
      showBattleCardDetails(idx);
      break;
    case 'copyText':
      copyToClipboard(el.dataset.text, el);
      break;
    case 'toggleFavorite':
      toggleFavorite(key);
      showConnectorDetails(key);
      break;
    case 'toggleDarkMode':
      toggleDarkMode();
      break;
    case 'toggleRecoWhy':
      { const whyEl = document.getElementById('reco-why-' + el.dataset.recoIdx);
        if (whyEl) {
          const open = whyEl.style.display !== 'none';
          whyEl.style.display = open ? 'none' : 'block';
          el.textContent = open ? 'Why add this? ▸' : 'Why add this? ▾';
        } }
      break;
    case 'exportBriefing':
      { const briefing = exportConnectorBriefing(key);
        if (briefing) copyToClipboard(briefing, el); }
      break;
    case 'exportScanBriefing':
      { const scanBrief = exportScanBriefing();
        if (scanBrief) copyToClipboard(scanBrief, el); }
      break;
    case 'closeDetails':
      closeDetails();
      break;
    case 'viewAllIssues':
      closeDetails();
      switchTab('troubleshoot', document.querySelectorAll('.toolbar button')[2]);
      setTimeout(() => {
        switchTroubleshootTab('known-issues', document.querySelectorAll('.troubleshoot-tab')[1]);
        if (key) {
          const btn = document.querySelector(`.connector-pick-btn[data-key="${key}"]`);
          if (btn) selectConnectorIssues(key, btn);
        }
      }, 50);
      break;
  }
});

// Known-issue search input (filters the connector picker)
document.getElementById('known-issue-input')?.addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  document.querySelectorAll('.connector-pick-btn').forEach(btn => {
    const name = btn.querySelector('.connector-pick-name')?.textContent.toLowerCase() || '';
    btn.style.display = name.includes(q) ? '' : 'none';
  });
});

loadErrorCodes();
setupConnectorAutocomplete();
renderRecentItems();
renderQuickStats();
initDarkMode();

// ─── DARK MODE ──────────────────────────────────────
function initDarkMode() {
  if (localStorage.getItem('ft-scout-dark') === '1') {
    document.body.classList.add('dark-mode');
    const toggle = document.querySelector('.dark-toggle');
    if (toggle) toggle.textContent = '☀️';
  }
}
function toggleDarkMode() {
  const isDark = document.body.classList.toggle('dark-mode');
  localStorage.setItem('ft-scout-dark', isDark ? '1' : '0');
  const toggle = document.querySelector('.dark-toggle');
  if (toggle) toggle.textContent = isDark ? '☀️' : '🌙';
}

// ─── CONNECTOR RECOMMENDATIONS ──────────────────────────────────────
const connectorRecommendations = {
  hubspot: [
    { key: 'salesforce', reason: 'Blend CRM data — compare HubSpot marketing leads with Salesforce pipeline',
      why: 'Most companies using HubSpot for marketing also have a sales team in Salesforce. Without both connected, marketing can\'t prove which campaigns drive revenue and sales can\'t see which leads are marketing-qualified. Connecting both gives you a full funnel view from first touch to closed-won.' },
    { key: 'google_ads', reason: 'Attribute marketing spend to HubSpot leads and deals',
      why: 'HubSpot tracks leads but doesn\'t know what ad brought them in. Google Ads has the spend and click data but doesn\'t know what happened after the click. Connecting both lets the team calculate true cost-per-lead and cost-per-deal — the #1 question every CMO asks.' },
    { key: 'stripe', reason: 'Connect HubSpot deals to actual Stripe payments for revenue attribution',
      why: 'HubSpot says a deal is "closed-won" but that doesn\'t mean the customer actually paid. Stripe has the real payment data. Connecting both reveals the gap between booked revenue and collected revenue, helps track failed payments, and enables true customer lifetime value calculations.' },
    { key: 'facebook_ads', reason: 'Track Facebook ad performance alongside HubSpot contact acquisition',
      why: 'Facebook Ads drives awareness and leads, but without connecting it to HubSpot, the marketing team is optimizing on clicks and impressions instead of actual lead quality. This connection lets them see which Facebook campaigns produce leads that actually convert to customers.' }
  ],
  salesforce: [
    { key: 'hubspot', reason: 'Combine Salesforce pipeline with HubSpot marketing engagement data',
      why: 'Sales reps in Salesforce don\'t see the marketing journey — which emails the prospect opened, which webinars they attended, which pages they visited. Connecting HubSpot gives sales context on buyer intent and helps prioritize the hottest leads based on actual engagement, not just lead score.' },
    { key: 'stripe', reason: 'Match Salesforce opportunities to Stripe payments for closed-won validation',
      why: 'Finance teams constantly question pipeline accuracy. By connecting Stripe payment data to Salesforce opportunities, you can validate that "closed-won" deals actually collected payment, identify revenue leakage, and build accurate ARR/MRR dashboards that finance trusts.' },
    { key: 'netsuite', reason: 'Bridge sales pipeline to ERP financials for order-to-cash analytics',
      why: 'Salesforce owns the front of the deal, NetSuite owns the back. Without connecting them, there\'s a black hole between "closed-won" and "invoice paid." This connection enables order-to-cash analytics, revenue recognition reporting, and helps identify bottlenecks where deals close but invoices stall.' },
    { key: 'linkedin_ads', reason: 'Tie LinkedIn ad engagement to Salesforce lead conversion',
      why: 'For B2B companies, LinkedIn is often the highest-quality ad channel. Connecting LinkedIn Ads to Salesforce lets the team see which LinkedIn campaigns, audiences, and creatives generate leads that actually close — not just leads that fill out a form and ghost.' }
  ],
  stripe: [
    { key: 'hubspot', reason: 'Link payments to CRM contacts for customer lifetime value analysis',
      why: 'Stripe knows who paid and how much, but it doesn\'t know the customer relationship context — their industry, company size, or how they were acquired. Connecting to HubSpot enables true CLV analysis segmented by acquisition channel, customer segment, and lifecycle stage.' },
    { key: 'salesforce', reason: 'Validate closed-won deals against actual Stripe revenue',
      why: 'Sales leaders need to know: are we actually collecting what we\'re booking? Connecting Stripe to Salesforce reveals the delta between pipeline and payments, tracks payment failures tied to specific accounts, and gives finance a single source of truth for revenue reporting.' },
    { key: 'shopify', reason: 'Combine e-commerce orders with payment processing data',
      why: 'Shopify tracks orders and products, Stripe tracks the actual money movement. Together you get a complete picture: which products have the highest refund rates, where payment failures are costing revenue, and how shipping and fulfillment timing affects payment success.' },
    { key: 'netsuite', reason: 'Reconcile Stripe transactions with ERP accounting records',
      why: 'Finance teams spend hours manually reconciling Stripe payouts with NetSuite journal entries. Automating this connection eliminates that manual work, ensures every Stripe fee and payout maps to the right GL account, and speeds up monthly close from weeks to days.' }
  ],
  shopify: [
    { key: 'stripe', reason: 'Reconcile Shopify orders with Stripe payment processing',
      why: 'Shopify shows an order was placed, but Stripe shows whether the payment actually cleared, what fees were charged, and if there were chargebacks. This connection is essential for accurate gross margin calculations and understanding the true cost of each transaction.' },
    { key: 'google_ads', reason: 'Calculate true ROAS by connecting ad spend to Shopify revenue',
      why: 'Google Ads shows clicks and cost, Shopify shows purchases and revenue. Without connecting them, the marketing team is flying blind on actual return on ad spend. This connection enables true ROAS by product, by campaign, and by customer segment — the metrics that drive profitable growth.' },
    { key: 'facebook_ads', reason: 'Track social ad performance to actual purchases',
      why: 'After iOS privacy changes, Facebook\'s own attribution is unreliable. Connecting Facebook Ads to Shopify via your warehouse gives you a server-side attribution model that\'s more accurate than pixel-based tracking. It\'s the only way to get trustworthy ROAS from Facebook in 2025+.' },
    { key: 'hubspot', reason: 'Sync customer purchase data to CRM for retention marketing',
      why: 'Most e-commerce brands treat every customer the same. Connecting Shopify purchase history to HubSpot enables segmented retention campaigns: VIP customers get different treatment than one-time buyers, lapsed customers get win-back sequences, and high-AOV customers get early access to new products.' }
  ],
  netsuite: [
    { key: 'salesforce', reason: 'Bridge CRM pipeline to ERP financials for full order-to-cash visibility',
      why: 'CFOs want to see the full revenue journey: from pipeline to invoice to cash collection. Salesforce has the pipeline, NetSuite has the invoices and payments. Connecting both eliminates the manual spreadsheet reconciliation between sales and finance and gives leadership a real-time view of the business.' },
    { key: 'hubspot', reason: 'Connect marketing leads to ERP customer and revenue records',
      why: 'Marketing teams struggle to prove ROI because they can\'t connect their leads to actual revenue. By linking HubSpot campaigns to NetSuite customer records and transactions, marketing can finally answer: "Which campaigns brought in our most profitable customers?"' },
    { key: 'stripe', reason: 'Reconcile online payments with NetSuite accounting',
      why: 'Every Stripe charge, refund, and fee needs to land in the right NetSuite GL account. Doing this manually is error-prone and delays monthly close. This connection automates the reconciliation and gives the accounting team confidence that the books match reality.' }
  ],
  google_ads: [
    { key: 'facebook_ads', reason: 'Cross-channel ad attribution — compare Google vs Facebook ROAS',
      why: 'Every ad platform claims credit for conversions. By pulling both Google and Facebook data into the warehouse, the marketing team can build a unified attribution model that fairly distributes credit across channels and identifies which platform actually drives incremental revenue vs. just retargeting existing intent.' },
    { key: 'hubspot', reason: 'Attribute Google Ads clicks to CRM leads and deals',
      why: 'Google Ads optimizes for conversions, but a "conversion" might be a junk form fill. Connecting to HubSpot lets the team feed back actual lead quality — which keywords and campaigns produce SQLs, not just MQLs. Some teams even push this data back to Google to optimize for revenue, not clicks.' },
    { key: 'salesforce', reason: 'Track ad spend through to closed-won revenue in Salesforce',
      why: 'B2B sales cycles are long — a Google Ad click in January might not close until June. Without connecting Google Ads to Salesforce, the team has no idea which campaigns drive actual revenue. This connection enables true pipeline-based ROAS that accounts for the full sales cycle.' },
    { key: 'shopify', reason: 'Calculate true ROAS by matching ad clicks to purchases',
      why: 'Google\'s reported ROAS uses its own attribution model, which often overcounts. Pulling Google Ads and Shopify data into the warehouse lets the team calculate ROAS using their own attribution logic — first-touch, last-touch, or multi-touch — giving them numbers they can actually trust for budget decisions.' }
  ],
  facebook_ads: [
    { key: 'google_ads', reason: 'Cross-channel comparison — unified view of ad performance',
      why: 'Facebook and Google both take credit for the same conversions. The only way to get an honest picture is to pull both into the warehouse and build a deduplicated attribution model. Teams that do this typically find they can shift 15-25% of budget from overcredited channels to undercredited ones.' },
    { key: 'hubspot', reason: 'Connect Facebook leads to CRM pipeline and engagement',
      why: 'Facebook Lead Ads generate form fills, but how many actually become customers? Connecting to HubSpot reveals the lead-to-customer conversion rate by campaign, audience, and creative — so the team stops optimizing for cheap leads and starts optimizing for leads that actually buy.' },
    { key: 'shopify', reason: 'Attribute Facebook ad spend to actual e-commerce revenue',
      why: 'Post-iOS 14, Facebook\'s pixel-based attribution underreports by 20-40%. Server-side attribution via the warehouse is the fix. Connecting Facebook Ads to Shopify through Fivetran gives e-commerce teams accurate ROAS they can make real budget decisions on.' }
  ],
  postgres: [
    { key: 'hubspot', reason: 'Join product usage data with CRM records for product-led growth insights',
      why: 'Product teams track feature usage in PostgreSQL. Sales teams track deals in HubSpot. Connecting both reveals which product actions predict conversion — turning product analytics into a sales weapon.' },
    { key: 'stripe', reason: 'Connect application database to payment data for revenue analytics',
      why: 'PostgreSQL has the product data (users, plans, features used). Stripe has the payment data (who paid, how much, when). Together you can calculate unit economics, churn by feature adoption, and true customer acquisition cost.' },
    { key: 'salesforce', reason: 'Sync product data to CRM pipeline for data-driven sales',
      why: 'When sales reps can see which prospects are actively using the product (from PostgreSQL) alongside their deal stage (from Salesforce), they know exactly who to prioritize. Product-qualified leads close at 2-3x the rate of marketing-qualified leads.' }
  ],
  mysql: [
    { key: 'hubspot', reason: 'Connect application data with marketing engagement for full-funnel visibility',
      why: 'MySQL often powers the product backend. HubSpot tracks the marketing journey. Connecting both lets you see which marketing channels bring users who actually stick around and use the product — not just sign up.' },
    { key: 'stripe', reason: 'Link application database to billing for subscription analytics',
      why: 'MySQL stores what users do. Stripe stores what they pay. Together you get the full picture: which features drive upgrades, which user behaviors predict churn, and where to focus product investment.' }
  ],
  mongodb: [
    { key: 'hubspot', reason: 'Connect product event data with CRM for product-led growth',
      why: 'MongoDB often stores product events and user behavior. Connecting to HubSpot lets marketing and sales see which product actions (stored as documents) correlate with deal progression and customer expansion.' },
    { key: 'stripe', reason: 'Join document-based usage data with payment records',
      why: 'MongoDB\'s flexible documents capture rich usage data. Stripe captures payments. Joining them in the warehouse reveals which usage patterns drive revenue growth.' }
  ],
  sql_server: [
    { key: 'salesforce', reason: 'Bridge ERP/LOB data with CRM for enterprise analytics',
      why: 'SQL Server often runs enterprise ERP, finance, or line-of-business applications. Salesforce tracks customer relationships. Connecting both gives leadership a unified view from prospect to customer to revenue.' },
    { key: 'netsuite', reason: 'Consolidate legacy SQL Server data with cloud ERP',
      why: 'Many companies migrating to NetSuite still have critical historical data in SQL Server. Connecting both ensures continuity of reporting during the transition and provides a complete financial picture.' }
  ],
  linkedin_ads: [
    { key: 'salesforce', reason: 'Tie LinkedIn B2B ad engagement to CRM pipeline and revenue',
      why: 'LinkedIn is the premier B2B ad platform. Sales cycles are long. Without connecting LinkedIn Ads to Salesforce, marketing can\'t see which LinkedIn campaigns ultimately drive closed-won revenue — they\'re optimizing on leads, not revenue.' },
    { key: 'hubspot', reason: 'Connect LinkedIn lead gen with CRM for lead quality analysis',
      why: 'LinkedIn Lead Gen Forms capture high-quality B2B leads, but how many become customers? Connecting to HubSpot reveals which LinkedIn audiences, creatives, and campaigns produce leads that actually convert.' },
    { key: 'google_ads', reason: 'Cross-channel B2B attribution — LinkedIn vs Google for pipeline generation',
      why: 'B2B marketers split budget between LinkedIn and Google. Without unified data, each platform claims credit. Connecting both lets you build an honest attribution model that shows where pipeline actually comes from.' }
  ],
  google_analytics_4: [
    { key: 'google_ads', reason: 'Connect website behavior to ad performance for full-funnel attribution',
      why: 'Google Ads shows what people clicked. GA4 shows what they did on the website. Connecting both in the warehouse lets you attribute revenue to specific campaigns based on actual user behavior, not just last-click.' },
    { key: 'hubspot', reason: 'Link website analytics to CRM for lead behavior insights',
      why: 'GA4 tracks every page view and event. HubSpot tracks who the person is and their deal stage. Connecting both reveals the website behavior patterns that predict conversion — which pages do future customers visit?' },
    { key: 'facebook_ads', reason: 'Unified web analytics across paid social and organic traffic',
      why: 'GA4 captures all website traffic regardless of source. Facebook Ads only sees its own campaigns. Combining both gives a complete picture of how paid social drives website engagement compared to other channels.' }
  ],
  marketo: [
    { key: 'salesforce', reason: 'Complete marketing-to-sales pipeline visibility',
      why: 'Marketo scores and nurtures leads. Salesforce closes deals. Without connecting them in the warehouse, marketing can\'t prove which campaigns and nurture sequences actually produce revenue. This is the #1 request from CMOs.' },
    { key: 'google_ads', reason: 'Attribute paid search spend to Marketo-tracked lead progression',
      why: 'Google Ads drives clicks. Marketo tracks what happens next — did the lead engage, get scored, get nurtured? Connecting both reveals the true cost-per-MQL and cost-per-SQL from paid search.' },
    { key: 'linkedin_ads', reason: 'Connect B2B ad campaigns to marketing automation pipeline',
      why: 'LinkedIn Ads generate B2B leads. Marketo nurtures them through the funnel. Connecting both shows which LinkedIn campaigns produce leads that actually progress through the nurture and become sales-ready.' }
  ],
  zendesk: [
    { key: 'salesforce', reason: 'Unify support tickets with CRM for complete customer health',
      why: 'Salesforce knows the account value and renewal date. Zendesk knows how many tickets they\'ve filed and their CSAT score. Together, customer success teams can spot at-risk accounts before they churn — the accounts filing the most tickets with the lowest CSAT are your biggest churn risk.' },
    { key: 'hubspot', reason: 'Connect support interactions to customer lifecycle for retention insights',
      why: 'HubSpot tracks the customer journey from lead to customer. Zendesk tracks what happens after — support quality directly impacts retention. Connecting both reveals which customer segments need more support investment.' },
    { key: 'stripe', reason: 'Link support tickets to billing data for revenue-at-risk analysis',
      why: 'When a customer filing angry support tickets is also your highest-paying account, that\'s a priority. Connecting Zendesk to Stripe lets you weight support issues by revenue impact and prioritize accordingly.' }
  ],
  quickbooks: [
    { key: 'salesforce', reason: 'Connect accounting to CRM for order-to-cash and revenue reconciliation',
      why: 'Salesforce says the deal closed. QuickBooks says whether the invoice was sent and paid. Connecting both closes the loop between sales and finance — no more spreadsheet reconciliation at month end.' },
    { key: 'stripe', reason: 'Reconcile QuickBooks entries with Stripe payment transactions',
      why: 'Stripe processes the payment. QuickBooks records it in the general ledger. Connecting both automates reconciliation, ensures every fee and payout maps to the right account, and cuts days off monthly close.' },
    { key: 'shopify', reason: 'Link e-commerce orders to accounting for automated revenue tracking',
      why: 'Shopify creates orders. QuickBooks records revenue. Without automated sync, someone is manually entering every order into QBO. This connection automates that and gives real-time gross margin visibility.' }
  ],
  xero: [
    { key: 'stripe', reason: 'Reconcile Xero accounting with Stripe payment processing',
      why: 'Xero needs every Stripe transaction categorized correctly. This connection automates bank reconciliation and ensures Stripe fees, refunds, and payouts land in the right Xero accounts.' },
    { key: 'salesforce', reason: 'Bridge CRM deals to Xero invoicing for revenue visibility',
      why: 'Sales closes deals in Salesforce. Finance invoices in Xero. Connecting both gives leadership a real-time view from pipeline to payment without manual data entry between systems.' },
    { key: 'shopify', reason: 'Automate e-commerce revenue tracking in Xero',
      why: 'Shopify brands using Xero need every order, refund, and fee recorded in the books. This connection replaces manual bookkeeping with automated, reconciled financial data.' }
  ],
  workday: [
    { key: 'salesforce', reason: 'Connect HR data to CRM for headcount-to-revenue analysis',
      why: 'Salesforce tracks revenue. Workday tracks the people generating it. Connecting both lets leadership see revenue per employee, quota attainment by role, and hiring impact on pipeline.' },
    { key: 'netsuite', reason: 'Unify HR and finance for compensation and budget analysis',
      why: 'Workday manages people and payroll. NetSuite manages the budget. Connecting both gives finance a unified view of compensation costs against departmental budgets without manual spreadsheet merging.' }
  ],
  bamboohr: [
    { key: 'salesforce', reason: 'Correlate headcount changes with sales performance',
      why: 'When the sales team grows, does revenue follow? BambooHR tracks hiring and attrition. Salesforce tracks revenue. Connecting both reveals the ROI of each new hire and the revenue impact of attrition.' },
    { key: 'workday', reason: 'Consolidate HR data for companies transitioning between systems',
      why: 'Many companies outgrow BambooHR and migrate to Workday. Having both in the warehouse ensures continuity of people analytics during the transition.' }
  ],
  amplitude: [
    { key: 'salesforce', reason: 'Connect product analytics to CRM for product-led sales',
      why: 'Amplitude shows who\'s using the product and how. Salesforce shows the deal. When sales reps can see a prospect\'s product usage, they know exactly when to reach out and what to pitch — product-qualified leads close at 3x the rate.' },
    { key: 'stripe', reason: 'Link product behavior to payment data for conversion analysis',
      why: 'Amplitude tracks what users do. Stripe tracks what they pay. Together you can see which product actions predict upgrades, which features drive expansion revenue, and where to invest in the product.' },
    { key: 'hubspot', reason: 'Feed product usage data into marketing automation for lifecycle campaigns',
      why: 'Amplitude knows when a user hits an activation milestone. HubSpot can trigger a campaign. Connecting both enables product-triggered marketing — the most effective form of lifecycle engagement.' }
  ],
  mixpanel: [
    { key: 'salesforce', reason: 'Connect product analytics to CRM for data-driven sales prioritization',
      why: 'Mixpanel tracks product engagement. Salesforce tracks deals. When sales sees which trial users are most engaged, they stop wasting time on tire-kickers and focus on the users who are already loving the product.' },
    { key: 'stripe', reason: 'Attribute product engagement to revenue outcomes',
      why: 'Mixpanel shows what users do. Stripe shows what they pay. Connecting both reveals the product behaviors that predict upgrades and churn — essential for product-led growth companies.' }
  ],
  segment: [
    { key: 'amplitude', reason: 'Route Segment event data to Amplitude for unified product analytics',
      why: 'Segment collects events from everywhere (web, mobile, server). Amplitude analyzes them. Having both in the warehouse ensures the raw event stream and the analyzed output are available for cross-validation.' },
    { key: 'hubspot', reason: 'Feed behavioral data from Segment into CRM for personalized outreach',
      why: 'Segment captures every user interaction. HubSpot manages the relationship. Connecting both means sales and marketing see the full behavioral picture alongside the CRM context.' },
    { key: 'salesforce', reason: 'Enrich CRM records with Segment behavioral data for sales intelligence',
      why: 'Segment captures cross-platform behavior. Salesforce manages the deal. Connecting both gives sales reps a 360-degree view of prospect engagement before every call.' }
  ],
  braze: [
    { key: 'amplitude', reason: 'Connect messaging engagement to product analytics for lifecycle optimization',
      why: 'Braze sends the message. Amplitude tracks what the user does next. Connecting both reveals which messages actually drive product engagement — not just opens and clicks, but actual feature adoption.' },
    { key: 'shopify', reason: 'Link marketing campaigns to e-commerce purchase behavior',
      why: 'Braze powers the lifecycle campaigns. Shopify captures the purchases. Connecting both shows true campaign ROI by tying push notifications, emails, and in-app messages to actual orders and revenue.' },
    { key: 'segment', reason: 'Feed Segment event data into Braze for behavioral targeting analysis',
      why: 'Segment captures events from every touchpoint. Braze uses them for targeting. Having both in the warehouse lets you audit which behavioral triggers drive the most effective campaigns.' }
  ],
  outreach: [
    { key: 'salesforce', reason: 'Connect sales engagement to CRM pipeline for outbound attribution',
      why: 'Outreach tracks every email and call. Salesforce tracks the deals. Connecting both reveals which sequences, templates, and reps drive the most pipeline — the key question every VP of Sales asks.' },
    { key: 'hubspot', reason: 'Link outbound activity to marketing engagement for full-funnel visibility',
      why: 'Marketing warms leads in HubSpot. SDRs work them in Outreach. Connecting both shows which marketing touches make outbound more effective — warm leads from webinars vs. cold lists.' },
    { key: 'salesloft', reason: 'Consolidate sales engagement data if migrating between platforms',
      why: 'Some teams use both or are migrating. Having both in the warehouse ensures continuity of activity and performance data during the transition.' }
  ],
  salesloft: [
    { key: 'salesforce', reason: 'Attribute sales engagement activities to CRM pipeline and revenue',
      why: 'Salesloft tracks the outbound grind — emails, calls, cadences. Salesforce tracks the deals. Connecting both proves which sales activities actually generate pipeline, enabling data-driven coaching and capacity planning.' },
    { key: 'hubspot', reason: 'Connect outbound engagement to marketing lifecycle for lead quality analysis',
      why: 'Marketing generates leads in HubSpot. SDRs work them in Salesloft. Connecting both shows which marketing sources produce leads that actually respond to outreach — so marketing can optimize for reply-worthy leads, not just MQLs.' }
  ],
  klaviyo: [
    { key: 'shopify', reason: 'Connect email/SMS marketing to e-commerce transactions for revenue attribution',
      why: 'Klaviyo sends the campaigns and flows. Shopify captures the orders. While Klaviyo has its own attribution, having both in the warehouse lets you build custom attribution models and validate Klaviyo\'s claimed revenue against actual Shopify orders.' },
    { key: 'facebook_ads', reason: 'Unify paid acquisition with lifecycle marketing for full customer journey',
      why: 'Facebook Ads acquires the customer. Klaviyo retains them. Connecting both shows the true cost of a customer: acquisition cost (Facebook) + lifetime value driven by retention marketing (Klaviyo).' },
    { key: 'google_ads', reason: 'Connect paid search to email marketing for cross-channel attribution',
      why: 'Google Ads drives the first visit. Klaviyo nurtures the relationship. Together you can see which ad keywords produce subscribers who actually engage with email and purchase — not just one-time clickers.' }
  ],
  pipedrive: [
    { key: 'hubspot', reason: 'Connect CRM pipeline to marketing engagement for SMB full-funnel analytics',
      why: 'Pipedrive tracks the deals. HubSpot tracks the marketing journey. For SMBs using both, this connection reveals which marketing activities drive the best-quality pipeline in Pipedrive.' },
    { key: 'stripe', reason: 'Validate Pipedrive won deals against actual Stripe payments',
      why: 'Pipedrive says the deal is won. Stripe says whether the customer actually paid. This connection eliminates the gap between CRM reporting and financial reality.' },
    { key: 'quickbooks', reason: 'Bridge CRM to accounting for SMB revenue visibility',
      why: 'SMBs typically use Pipedrive for sales and QuickBooks for accounting. Connecting both automates the handoff from closed deal to invoiced revenue, eliminating double data entry and reconciliation headaches.' }
  ]
};

function getRecommendations(scannedKeys) {
  const existing = new Set(scannedKeys);
  const recoMap = new Map();
  for (const key of scannedKeys) {
    const recos = connectorRecommendations[key] || [];
    for (const r of recos) {
      if (existing.has(r.key)) continue;
      if (!connectorData[r.key]) continue;
      if (!recoMap.has(r.key)) {
        recoMap.set(r.key, { key: r.key, reasons: [r.reason], whys: [r.why], fromConnectors: [key] });
      } else {
        const entry = recoMap.get(r.key);
        entry.reasons.push(r.reason);
        entry.whys.push(r.why);
        entry.fromConnectors.push(key);
      }
    }
  }
  return Array.from(recoMap.values()).sort((a, b) => b.fromConnectors.length - a.fromConnectors.length).slice(0, 4);
}

function renderRecommendations(scannedKeys) {
  const recos = getRecommendations(scannedKeys);
  if (recos.length === 0) return '';
  let html = `<div class="reco-label">💡 Recommended Connectors</div>`;
  html += recos.map((r, idx) => {
    const c = connectorData[r.key];
    const pairLabel = r.fromConnectors.length > 1
      ? r.fromConnectors.length + ' connectors link here'
      : 'Pairs with ' + (connectorData[r.fromConnectors[0]]?.name || '');
    const whyText = r.whys.filter(Boolean).join(' ');
    return `<div class="reco-card">
      <div class="reco-name" data-action="showConnectorDetails" data-key="${r.key}" style="display:flex;align-items:center;gap:6px;">
        <div class="connector-icon ${c.iconClass}" style="width:18px;height:18px;font-size:10px;">${c.icon}</div>
        ${c.name}
        <span style="margin-left:auto;font-size:10px;font-weight:600;color:var(--ft-blue);background:var(--ft-blue-light);padding:2px 8px;border-radius:4px;">${pairLabel}</span>
      </div>
      <div class="reco-reason">${r.reasons[0]}</div>
      ${whyText ? `<div class="reco-why" data-action="toggleRecoWhy" data-reco-idx="${idx}">Why add this? ▸</div>
      <div class="reco-why-detail" id="reco-why-${idx}" style="display:none;">
        <div style="font-size:12px;color:var(--ft-text-mid);line-height:1.6;">${whyText}</div>
        <div style="margin-top:6px;text-align:right;"><span class="copy-btn" data-action="copyText" data-text="${whyText.replace(/"/g, '&quot;')}">Copy pitch</span></div>
      </div>` : ''}
    </div>`;
  }).join('');
  return html;
}

// ─── EXPORT BRIEFING ──────────────────────────────────────
function exportConnectorBriefing(key) {
  const c = connectorData[key];
  if (!c) return;
  const issuesByCategory = {};
  (c.knownIssues || []).forEach(i => {
    const cat = i.category || 'General';
    if (!issuesByCategory[cat]) issuesByCategory[cat] = [];
    issuesByCategory[cat].push(i);
  });

  let text = `📋 ${c.name} — Connector Briefing\n`;
  text += `${'═'.repeat(40)}\n\n`;
  text += `What it does: ${c.whatItDoes}\n\n`;
  text += `Useful for: ${c.usefulFor}\n\n`;
  text += `Key Tables (${c.tables.length}):\n`;
  c.tables.forEach(t => {
    text += `  • ${t.name} — ${t.whatContains}\n`;
    if (t.keyCallouts) text += `    ⚡ ${t.keyCallouts}\n`;
  });
  text += `\nKnown Issues (${c.knownIssues.length}):\n`;
  Object.entries(issuesByCategory).forEach(([cat, issues]) => {
    text += `\n  [${cat}]\n`;
    issues.forEach(i => {
      text += `  • ${i.title}\n`;
      text += `    ${i.preview}\n`;
    });
  });
  if (c.docsUrl) text += `\nDocs: ${c.docsUrl}\n`;
  text += `\n— Generated by Fivetran Connector Scout v0.4.0`;
  return text;
}

function exportScanBriefing() {
  if (scannedConnectors.length === 0) return;
  let text = `📡 Fivetran Dashboard Scan — Briefing\n`;
  text += `${'═'.repeat(40)}\n`;
  text += `Connectors detected: ${scannedConnectors.length}\n`;
  text += `Date: ${new Date().toLocaleDateString()}\n\n`;

  scannedConnectors.forEach(key => {
    const c = connectorData[key];
    if (!c) return;
    text += `▸ ${c.name}\n`;
    text += `  ${c.description}\n`;
    text += `  Tables: ${c.tables.length} | Known Issues: ${(c.knownIssues || []).length}\n\n`;
  });

  const recos = getRecommendations(scannedConnectors);
  if (recos.length > 0) {
    text += `💡 Recommended Connectors to Add:\n`;
    recos.forEach(r => {
      const c = connectorData[r.key];
      text += `  • ${c.name} — ${r.reasons[0]}\n`;
    });
  }
  text += `\n— Generated by Fivetran Connector Scout v0.4.0`;
  return text;
}

// ─── KEYBOARD SHORTCUTS ──────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    switchTab('search', document.querySelectorAll('.toolbar button')[1]);
    setTimeout(() => document.getElementById('search-input')?.focus(), 50);
  }
  if (e.key === 'Escape') {
    const details = document.getElementById('details');
    if (details?.classList.contains('active')) {
      closeDetails();
    }
  }
});


// ─── QUICK STATS ──────────────────────────────────────
function renderQuickStats() {
  const el = document.getElementById('quick-stats');
  if (!el) return;
  const totalConnectors = Object.keys(connectorData).length;
  const totalIssues = Object.values(connectorData).reduce((sum, c) => sum + (c.knownIssues || []).length, 0);
  const totalGlossary = glossaryData.length;
  const totalCompetitors = battleCardData.length;
  el.innerHTML = `<div class="quick-stats-grid">
    <div class="stat-card"><div class="stat-num">${totalConnectors}</div><div class="stat-label">Connectors</div></div>
    <div class="stat-card"><div class="stat-num">${totalIssues}</div><div class="stat-label">Known Issues</div></div>
    <div class="stat-card"><div class="stat-num">${totalGlossary}</div><div class="stat-label">Glossary Terms</div></div>
    <div class="stat-card"><div class="stat-num">${totalCompetitors}</div><div class="stat-label">Battle Cards</div></div>
  </div>`;
}

// ─── STATUS BAR HELPERS ──────────────────────────────────────
function setStatus(state, text, count) {
  const dot = document.getElementById('status-dot');
  const txt = document.getElementById('status-text');
  const cnt = document.getElementById('status-count');
  if (dot) { dot.className = 'status-dot status-' + state; }
  if (txt) { txt.textContent = text; }
  if (cnt) { cnt.textContent = count || ''; }
}

// ─── BOOTSTRAP FROM SUPABASE ──────────────────────────────────────
// Merge Supabase data with hardcoded fallback. Supabase adds connectors
// not in the hardcoded set. For connectors that exist in both, keep the
// richer version (more known issues wins). On failure, hardcoded stays.
(async () => {
  if (typeof loadConnectorDataFromSupabase !== 'function') {
    setStatus('fallback', 'Offline — using built-in data', Object.keys(connectorData).length + ' connectors');
    return;
  }
  try {
    const fresh = await loadConnectorDataFromSupabase();
    if (!fresh || Object.keys(fresh).length === 0) {
      console.warn('Supabase returned no connectors — keeping hardcoded fallback.');
      setStatus('fallback', 'Supabase empty — using built-in data', Object.keys(connectorData).length + ' connectors');
      return;
    }
    let supaCount = 0;
    let mergedFromSupa = 0;
    for (const [id, sup] of Object.entries(fresh)) {
      supaCount++;
      const local = connectorData[id];
      if (!local) {
        connectorData[id] = sup;
        mergedFromSupa++;
      } else {
        const supIssues = (sup.knownIssues || []).length;
        const localIssues = (local.knownIssues || []).length;
        if (supIssues > localIssues) {
          connectorData[id] = { ...sup, icon: local.icon, iconClass: local.iconClass, docsUrl: local.docsUrl || sup.docsUrl };
          mergedFromSupa++;
        } else {
          connectorData[id] = { ...local, description: sup.description && sup.description.length > (local.description || '').length ? sup.description : local.description, whatItDoes: sup.whatItDoes && sup.whatItDoes.length > (local.whatItDoes || '').length ? sup.whatItDoes : local.whatItDoes };
        }
      }
    }
    const total = Object.keys(connectorData).length;
    const totalIssues = Object.values(connectorData).reduce((sum, c) => sum + (c.knownIssues || []).length, 0);
    console.log(`Merged ${supaCount} Supabase connectors (${mergedFromSupa} used) with ${total} total.`);
    setStatus('ok', `Supabase synced — ${supaCount} from DB, ${total} total`, totalIssues + ' issues');
    setupConnectorAutocomplete();
    renderQuickStats();

    if (document.getElementById('known-issues-tab').style.display === 'block') {
      loadKnownIssuesTab();
    }
  } catch (err) {
    console.warn('Supabase load failed — using hardcoded fallback:', err);
    setStatus('error', 'Supabase error — using built-in data', Object.keys(connectorData).length + ' connectors');
  }
})();
