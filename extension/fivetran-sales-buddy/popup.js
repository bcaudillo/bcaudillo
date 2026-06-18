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
