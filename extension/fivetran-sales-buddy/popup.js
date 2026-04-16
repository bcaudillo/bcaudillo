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
  }
};

const troubleshootingData = [
  // 4xx Client Errors
  { errorCode: '400', title: 'Bad Request', preview: 'One of the most common and vague errors you\'ll see', rootCause: 'Credentials (#1)', diagnosis: 'Think of it like accessing www.fivetran.com/user123 — that "user123" is the credential or key entered through the UI. A 400 usually means it\'s expired, incorrect, or not recognized.', steps: [
    { title: 'Check what was entered', text: 'Double-check what was entered in the UI. Has a password, API key, or secret key recently changed?' },
    { title: 'If everything looks right', text: 'Escalate to the data team.' }
  ], escalate: false },
  { errorCode: '401', title: 'Unauthorized', preview: 'Authentication required — either wasn\'t provided or failed', rootCause: 'Credentials (#1)', diagnosis: 'Authentication is required and either wasn\'t provided or failed. Note that API keys and OAuth tokens are sometimes regenerated by the source system without warning.', steps: [
    { title: 'OAuth', text: 'Has the key expired or been regenerated?' },
    { title: 'Basic Auth', text: 'Is the username/password correct?' }
  ], escalate: false },
  { errorCode: '403', title: 'Forbidden', preview: 'Login is valid, but user doesn\'t have access — NOT a credentials problem', rootCause: 'Permissions (#3)', diagnosis: 'This is NOT a credentials problem — the login is valid. The user is recognized but doesn\'t have access to what they\'re requesting. Almost always a role or permissions issue.', steps: [
    { title: 'Check role', text: 'Does the user have the correct role assigned to access or edit this table?' },
    { title: 'Escalate if unsure', text: 'Escalate to review permissions if unsure.' }
  ], escalate: false },
  { errorCode: '404', title: 'Not Found', preview: 'The system couldn\'t find what was requested', rootCause: 'Address (#2)', diagnosis: 'The system couldn\'t find what was requested. Since your team handles endpoint setup, this is generally not something the customer can resolve on their own.', steps: [
    { title: 'Check Known Issues first', text: 'Is this a documented known issue for this connector?' },
    { title: 'Escalate', text: 'Escalate to the data team.' }
  ], escalate: true },
  { errorCode: '405', title: 'Method Not Allowed', preview: 'Request received but the method isn\'t supported — setup-level issue', rootCause: 'Address (#2)', diagnosis: 'The request was received but the way it was sent isn\'t supported. This is a setup-level issue.', steps: [
    { title: 'Escalate directly', text: 'Escalate to the data team directly.' }
  ], escalate: true },
  { errorCode: '409', title: 'Conflict', preview: 'Request conflicts with the current state of the system', rootCause: 'Escalate', diagnosis: 'The request conflicts with the current state of the system. This can be complex and is difficult for non-technical users to diagnose.', steps: [
    { title: 'Escalate', text: 'Escalate to the data team with relevant details.' }
  ], escalate: true },
  { errorCode: '422', title: 'Unprocessable Entity', preview: 'Request understood, but something in the data wasn\'t valid', rootCause: 'Escalate', diagnosis: 'The system received and understood the request, but something in the data itself wasn\'t valid. Think of it like submitting a form where a field is in the wrong format.', steps: [
    { title: 'Escalate', text: 'Escalate to the data team — this is typically a configuration issue.' }
  ], escalate: true },
  { errorCode: '429', title: 'Too Many Requests', preview: 'Rate limited — too many requests in a short period', rootCause: 'Rate Limited', diagnosis: 'The system is temporarily blocking requests because too many were sent in a short period. Usually temporary.', steps: [
    { title: 'Wait and retry', text: 'Wait and try again.' },
    { title: 'If recurring', text: 'If this happens repeatedly, it may indicate a sync frequency issue — flag to the data team.' }
  ], escalate: false },
  // 5xx Server Errors
  { errorCode: '5xx', title: 'Server Error', preview: 'Server failed to fulfill a valid request — generally outside customer control', rootCause: 'Server-side', diagnosis: '500 = Generic server failure. 502 = Upstream service failed. 503 = Server overloaded or down. 504 = Upstream service timed out. These are generally outside the customer\'s control.', steps: [
    { title: 'Check for outage', text: 'Check if the source system is experiencing a known outage. If yes — wait it out.' },
    { title: 'If no outage', text: 'Escalate to Support with the relevant request details.' }
  ], escalate: true }
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
  { term: 'Activations', simple: 'Reverse ETL — push warehouse data back to business tools', detailed: 'Move data from your warehouse/lake back to operational tools like Salesforce, HubSpot, Braze. Priced on MAR separately from connections. Each activation has its own cost curve and a 14-day free trial.', whyMatters: 'Enables the "data loop" — sync data in with connectors, model it, then push insights back to the tools teams use daily.', example: 'Customer builds a lead score model in Snowflake, then uses Activations to push scores back to Salesforce Contact records.', category: 'Core' }
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
function getCatCSS(cat) { return categoryConfig[cat]?.css || ''; }
function getCatDot(cat) { return categoryConfig[cat]?.dot || 'dot-data-integrity'; }
function getCatBadge(cat) { const c = categoryConfig[cat] || categoryConfig['Data Integrity']; return `background:${c.badgeBg};color:${c.badgeColor}`; }

// ─── TAB SWITCHING ──────────────────────────────────────
function switchTab(tab, btn) {
  document.querySelectorAll('.section').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.toolbar button').forEach(el => el.classList.remove('active'));
  document.getElementById(tab).classList.add('active');
  btn.classList.add('active');
  document.getElementById('details').classList.remove('active');
  if (tab === 'troubleshoot') {
    loadErrorCodes();
    if (scannedConnectors.length > 0) {
      switchTroubleshootTab('known-issues', document.querySelectorAll('.troubleshoot-tab')[1]);
    }
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
    r.innerHTML = `<div class="scan-status"><div class="check">✓</div><span>Found <strong>${totalUnique} connector${totalUnique === 1 ? '' : 's'}</strong></span></div>`;

    // Matched: we have a Supabase knowledge-base entry for this source type.
    if (matchedConnections.length > 0) {
      r.innerHTML += matchedConnections.map(conn => {
        const c = connectorData[conn.key];
        const issueCount = (c.knownIssues || []).length;
        const issueBadge = issueCount
          ? `<span style="margin-left:auto;font-size:10px;font-weight:600;color:var(--ft-blue);background:#E8EEFC;padding:2px 8px;border-radius:4px;">${issueCount} known issue${issueCount === 1 ? '' : 's'}</span>`
          : '';
        return `<div class="detected-item" data-action="showConnectorDetails" data-key="${conn.key}">
          <div class="detected-name">
            <div class="connector-icon ${c.iconClass}">${c.icon}</div>
            ${c.name}
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
        return `<div class="detected-item" style="opacity:0.65;cursor:default;">
          <div class="detected-name">
            <div class="connector-icon" style="background:var(--ft-text-light);">?</div>
            ${label}
          </div>
        </div>`;
      }).join('');
    }

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

// ─── ERROR CODES ──────────────────────────────────────
function loadErrorCodes() {
  document.getElementById('error-codes').innerHTML = troubleshootingData.map((item, idx) => `
    <div class="error-code-item" data-action="showTroubleshootingDetails" data-idx="${idx}">
      <div class="error-code-number">${item.errorCode}</div>
      <div class="error-code-label">${item.title.split('–')[1]?.trim() || item.title}</div>
    </div>
  `).join('');
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

  // Clear results — user picks a connector first
  resultsDiv.innerHTML = '';
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

// ─── SEARCH LISTENERS ──────────────────────────────────────
document.getElementById('search-input')?.addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  const r = document.getElementById('search-results');
  if (!q) { r.innerHTML = '<div class="empty-state"><div class="icon">🔍</div><p>Type a connector name to search</p></div>'; return; }
  const m = Object.entries(connectorData).filter(([k, c]) => k.includes(q) || c.name.toLowerCase().includes(q));
  r.innerHTML = m.length === 0 ? '<p style="color:var(--ft-text-light);font-size:13px;padding:12px 0;">No connectors found</p>'
    : m.map(([k, c]) => `<div class="connector-card" data-action="showConnectorDetails" data-key="${k}">
        <div class="connector-name" style="display:flex;align-items:center;gap:6px;">
          <div class="connector-icon ${c.iconClass}" style="width:20px;height:20px;font-size:11px;">${c.icon}</div>${c.name}
        </div>
        <div class="connector-description">${c.description}</div>
      </div>`).join('');
});

document.getElementById('troubleshoot-input')?.addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  const r = document.getElementById('troubleshoot-results');
  if (!q) { r.innerHTML = ''; return; }
  const m = troubleshootingData.filter(i => i.errorCode.includes(q) || i.title.toLowerCase().includes(q) || i.preview.toLowerCase().includes(q));
  r.innerHTML = m.length === 0 ? '<p style="color:var(--ft-text-light);font-size:13px;">No matching errors</p>'
    : m.map(item => { const idx = troubleshootingData.indexOf(item); return `<div class="troubleshooting-item" data-action="showTroubleshootingDetails" data-idx="${idx}"><div class="troubleshooting-title">${item.title}</div><div class="troubleshooting-preview">${item.preview}</div><div class="error-badge">${item.errorCode}</div></div>`; }).join('');
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
  const c = connectorData[key]; const d = document.getElementById('details');
  d.innerHTML = `
    <div class="close" data-action="closeDetails">← Back</div>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
      <div class="connector-icon ${c.iconClass}" style="width:32px;height:32px;font-size:16px;">${c.icon}</div>
      <div class="detail-title" style="margin-bottom:0;">${c.name}</div>
    </div>
    <div class="detail-section"><div class="detail-label">What it does</div><div class="detail-text">${c.whatItDoes}</div></div>
    <div class="detail-section"><div class="detail-label">Useful for</div><div class="detail-text">${c.usefulFor}</div></div>
    <div class="detail-section"><div class="detail-label">Tables (${c.tables.length})</div>
      ${c.tables.map((t, i) => `<div class="table-detail-row"><div class="table-name-link"><span>${t.name}</span><a class="learn-more" data-action="showTableDetails" data-key="${key}" data-idx="${i}">Details →</a></div></div>`).join('')}
    </div>
    <div class="detail-section"><div class="detail-label">Known Issues (${c.knownIssues.length})</div>
      ${c.knownIssues.slice(0, 3).map((issue, i) => `<div class="known-issue-item ${getCatCSS(issue.category)}" style="margin-top:6px;" data-action="showKnownIssueDetails" data-key="${key}" data-idx="${i}"><div class="issue-title">${issue.title}</div><div class="issue-preview">${issue.preview}</div></div>`).join('')}
      ${c.knownIssues.length > 3 ? `<div style="text-align:center;margin-top:8px;"><a class="learn-more" data-action="viewAllIssues">View all ${c.knownIssues.length} issues →</a></div>` : ''}
    </div>
    ${c.docsUrl ? `<div class="detail-section" style="margin-top:4px;"><a href="${c.docsUrl}" target="_blank" style="display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:var(--ft-blue);text-decoration:none;padding:10px 14px;background:var(--ft-blue-light);border-radius:8px;border:1.5px solid var(--ft-border);width:100%;justify-content:center;">📄 View full Fivetran docs →</a></div>` : ''}`;
  d.classList.add('active');
}

function showTableDetails(key, idx) {
  const c = connectorData[key]; const t = c.tables[idx]; const d = document.getElementById('details');
  d.innerHTML = `
    <div class="close" data-action="showConnectorDetails" data-key="${key}">← Back to ${c.name}</div>
    <div class="detail-title">${c.name} → ${t.name}</div>
    <div class="detail-section"><div class="detail-label">What it contains</div><div class="detail-text">${t.whatContains}</div></div>
    <div class="detail-section"><div class="detail-label">Why it matters</div><div class="detail-text">${t.whyMatters}</div></div>
    ${t.keyCallouts ? `<div class="detail-section"><div class="detail-label">Key callouts</div><div class="detail-text" style="color:#b45309;background:#fffbeb;padding:10px 12px;border-radius:8px;border:1px solid #fde68a;">⚡ ${t.keyCallouts}</div></div>` : ''}`;
  d.classList.add('active');
}

function showKnownIssueDetails(key, idx) {
  const c = connectorData[key]; const issue = c.knownIssues[idx]; const d = document.getElementById('details');
  const cat = issue.category || 'General';
  let html = `
    <div class="close" data-action="closeDetails">← Back</div>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
      <div class="connector-icon ${c.iconClass}" style="width:20px;height:20px;font-size:10px;">${c.icon}</div>
      <span style="font-size:12px;color:var(--ft-text-mid);">${c.name}</span>
      <span class="issue-cat-badge" style="${getCatBadge(cat)}">${cat}</span>
    </div>
    <div class="detail-title" style="margin-top:8px;">${issue.title}</div>`;
  if (issue.rootCause) html += `<div class="detail-section"><div class="detail-label">Root Cause</div><div class="detail-text">${issue.rootCause}</div></div>`;
  if (issue.impact) html += `<div class="detail-section"><div class="detail-label">Impact</div><div class="detail-text">${issue.impact}</div></div>`;
  if (issue.resolution) html += `<div class="detail-section"><div class="detail-label">Resolution</div><div class="detail-text">${issue.resolution}</div></div>`;
  if (issue.subIssues?.length) {
    html += `<div class="detail-section"><div class="detail-label">Sub-Issues (${issue.subIssues.length})</div>`;
    issue.subIssues.forEach(s => { html += `<div class="sub-issue"><div class="sub-issue-title">${s.title}</div><div class="sub-issue-text">${s.explanation}</div></div>`; });
    html += '</div>';
  }
  d.innerHTML = html; d.classList.add('active');
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
    </div>
    ${item.escalate ? '<div style="margin-top:12px;padding:10px 14px;background:#fef2f2;border-radius:8px;font-size:12px;color:#991b1b;font-weight:600;border:1px solid #FECACA;">⬆️ Escalate to data team</div>' : '<div style="margin-top:12px;padding:10px 14px;background:#F0FDF4;border-radius:8px;font-size:12px;color:#166534;font-weight:600;border:1px solid #BBF7D0;">✅ Try to resolve — check Big 3 first</div>'}`;
  d.classList.add('active');
}

function showGlossaryDetails(idx) {
  const item = glossaryData[idx]; const d = document.getElementById('details');
  d.innerHTML = `
    <div class="close" data-action="closeDetails">← Back</div>
    <div class="detail-title">${item.term}</div>
    <div class="glossary-category" style="margin-bottom:14px;">${item.category}</div>
    <div class="detail-section"><div class="detail-label">Simple Definition</div><div class="detail-text">${item.simple}</div></div>
    <div class="detail-section"><div class="detail-label">Detailed Explanation</div><div class="detail-text">${item.detailed}</div></div>
    <div class="detail-section"><div class="detail-label">Why It Matters</div><div class="detail-text">${item.whyMatters}</div></div>
    <div class="detail-section"><div class="detail-label">Example</div><div class="detail-text" style="background:#f0fdf4;padding:10px 12px;border-radius:8px;border:1px solid #bbf7d0;">💡 ${item.example}</div></div>`;
  d.classList.add('active');
}

function closeDetails() { document.getElementById('details').classList.remove('active'); }

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
    case 'closeDetails':
      closeDetails();
      break;
    case 'viewAllIssues':
      switchTab('troubleshoot', document.querySelectorAll('.toolbar button')[2]);
      setTimeout(() => switchTroubleshootTab('known-issues', document.querySelectorAll('.troubleshoot-tab')[1]), 50);
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

// ─── BOOTSTRAP FROM SUPABASE ──────────────────────────────────────
// Replace the hardcoded connectorData with the real data from Supabase.
// On failure, the hardcoded fallback (HubSpot/Salesforce/Stripe) stays in place.
(async () => {
  if (typeof loadConnectorDataFromSupabase !== 'function') return;
  try {
    const fresh = await loadConnectorDataFromSupabase();
    if (!fresh || Object.keys(fresh).length === 0) {
      console.warn('Supabase returned no connectors — keeping hardcoded fallback.');
      return;
    }
    // Wipe hardcoded entries, splice in Supabase results.
    for (const k of Object.keys(connectorData)) delete connectorData[k];
    Object.assign(connectorData, fresh);
    console.log(`Loaded ${Object.keys(connectorData).length} connectors from Supabase.`);

    // If the Known Issues tab is currently open, refresh its picker so the
    // newly-loaded connectors show up immediately.
    if (document.getElementById('known-issues-tab').style.display === 'block') {
      loadKnownIssuesTab();
    }
  } catch (err) {
    console.warn('Supabase load failed — using hardcoded fallback:', err);
  }
})();
