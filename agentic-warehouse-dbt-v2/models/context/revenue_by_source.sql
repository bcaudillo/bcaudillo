with salesforce as (
    select
        fiscal_quarter,
        sum(amount_dollars) as metric_value
    from {{ ref('stg_salesforce_opportunity') }}
    where is_closed_won
    group by 1
),
stripe as (
    select
        activity_quarter as fiscal_quarter,
        sum(amount_dollars) as metric_value
    from {{ ref('stg_stripe_charge') }}
    where is_successful
    group by 1
),
warehouse as (
    select
        fiscal_quarter,
        sum(net_revenue_dollars) as metric_value
    from {{ ref('stg_reconciled_revenue') }}
    group by 1
)

select fiscal_quarter, 'salesforce' as source, metric_value from salesforce
union all
select fiscal_quarter, 'warehouse', metric_value from warehouse
union all
select fiscal_quarter, 'stripe', metric_value from stripe

