-- A passing test returns zero rows. For the demo quarter, collected cash must
-- not exceed reconciled revenue, and reconciled revenue must not exceed bookings.
with values_by_source as (
    select
        max(case when source = 'salesforce' then metric_value end) as bookings,
        max(case when source = 'warehouse' then metric_value end) as reconciled_revenue,
        max(case when source = 'stripe' then metric_value end) as cash_collected
    from {{ ref('revenue_by_source') }}
    where fiscal_quarter = '{{ var("demo_quarter") }}'
)

select *
from values_by_source
where bookings is null
   or reconciled_revenue is null
   or cash_collected is null
   or not (bookings >= reconciled_revenue and reconciled_revenue >= cash_collected)

