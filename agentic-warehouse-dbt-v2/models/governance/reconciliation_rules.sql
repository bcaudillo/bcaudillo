select * from (values
    ('salesforce_to_stripe', 'booking_to_cash_lag', 'Expected', 'Closed bookings lead collection because invoicing and payment occur later.', 'finance'),
    ('stripe_to_warehouse', 'finance_adjustments', 'Expected', 'Reconciled revenue may include timing, refund, dispute, and accounting adjustments.', 'finance'),
    ('salesforce_to_warehouse', 'metric_basis_difference', 'Expected', 'Bookings and reconciled revenue answer different business questions.', 'finance')
) as rules(comparison, rule_name, expected_state, explanation, owner)

