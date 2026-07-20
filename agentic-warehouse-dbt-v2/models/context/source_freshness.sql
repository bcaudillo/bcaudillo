with successful_syncs as (
    select source, max(sync_end_time) as last_successful_sync_at
    from {{ ref('stg_sync_log') }}
    where status = 'SUCCESSFUL'
    group by 1
),
boundaries as (
    select 'salesforce' as source, min(close_date) as earliest_record_at, max(loaded_at) as latest_loaded_at
    from {{ ref('stg_salesforce_opportunity') }}
    union all
    select 'stripe', min(created_at), max(loaded_at)
    from {{ ref('stg_stripe_charge') }}
    union all
    select
        'warehouse',
        min(make_date(
            cast(substr(fiscal_quarter, 1, 4) as integer),
            ((cast(substr(fiscal_quarter, 7, 1) as integer) - 1) * 3) + 1,
            1
        )),
        max(loaded_at)
    from {{ ref('stg_reconciled_revenue') }}
),
thresholds as (
    select * from (values
        ('salesforce', {{ var('salesforce_freshness_hours') }}),
        ('stripe', {{ var('stripe_freshness_hours') }}),
        ('warehouse', {{ var('warehouse_freshness_hours') }})
    ) as t(source, max_age_hours)
)

select
    b.source,
    coalesce(s.last_successful_sync_at, b.latest_loaded_at) as last_synced_at,
    date_diff('hour', coalesce(s.last_successful_sync_at, b.latest_loaded_at), current_timestamp) as hours_since_sync,
    t.max_age_hours,
    case
        when coalesce(s.last_successful_sync_at, b.latest_loaded_at) is null then 'unknown'
        when date_diff('hour', coalesce(s.last_successful_sync_at, b.latest_loaded_at), current_timestamp) <= t.max_age_hours then 'pass'
        else 'stale'
    end as freshness_status,
    b.earliest_record_at,
    b.latest_loaded_at
from boundaries b
left join successful_syncs s using (source)
join thresholds t using (source)
