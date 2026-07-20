with pivoted as (
    select
        fiscal_quarter,
        max(case when source = 'salesforce' then metric_value end) as bookings,
        max(case when source = 'stripe' then metric_value end) as cash_collected,
        max(case when source = 'warehouse' then metric_value end) as reconciled_revenue
    from {{ ref('revenue_by_source') }}
    group by 1
)

select
    fiscal_quarter,
    bookings,
    cash_collected,
    reconciled_revenue,
    round(100 * (bookings - cash_collected) / nullif(bookings, 0), 2) as booking_to_cash_gap_pct,
    round(100 * (reconciled_revenue - cash_collected) / nullif(reconciled_revenue, 0), 2) as reconciliation_to_cash_gap_pct
from pivoted

