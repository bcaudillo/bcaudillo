with demo_values as (
    select *
    from {{ ref('revenue_by_source') }}
    where fiscal_quarter = '{{ var("demo_quarter") }}'
),
prior_comparable_quarter as (
    select *
    from {{ ref('historical_revenue_gaps') }}
    where fiscal_quarter < '{{ var("demo_quarter") }}'
    qualify row_number() over (order by fiscal_quarter desc) = 1
)

select
    v.fiscal_quarter,
    v.source,
    v.metric_value,
    d.metric_name,
    d.business_definition,
    d.owner as metric_owner,
    d.authoritative_for,
    d.is_governed,
    f.last_synced_at,
    f.hours_since_sync,
    f.freshness_status,
    f.earliest_record_at,
    p.fiscal_quarter as comparison_quarter,
    p.booking_to_cash_gap_pct as historical_booking_to_cash_gap_pct,
    case
        when v.source = 'salesforce' then 'Use for pipeline and bookings; not cash actuals.'
        when v.source = 'stripe' then 'Use as the cash-collected actual.'
        when v.source = 'warehouse' then 'Use for finance-approved reported revenue.'
    end as recommended_use,
    'models/context/revenue_by_source -> models/context/forecast_context' as lineage_reference,
    'tests/assert_demo_revenue_waterfall.sql' as validation_reference
from demo_values v
join {{ ref('revenue_definitions') }} d using (source)
join {{ ref('source_freshness') }} f using (source)
cross join prior_comparable_quarter p

