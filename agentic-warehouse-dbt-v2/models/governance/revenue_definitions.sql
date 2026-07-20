select * from (values
    ('salesforce', 'committed_bookings', 'Closed-won contract value; cash may not have been collected.', 'sales_operations', 'forecast_pipeline', false),
    ('warehouse', 'finance_reconciled_revenue', 'Finance-approved revenue after reconciliation adjustments.', 'finance', 'reported_revenue', true),
    ('stripe', 'cash_collected', 'Successful customer payments received, expressed in dollars.', 'payments', 'cash_actuals', true)
) as definitions(source, metric_name, business_definition, owner, authoritative_for, is_governed)

