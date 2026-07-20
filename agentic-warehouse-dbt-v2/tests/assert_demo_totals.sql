-- Synthetic-data contract for the July 30 demonstration.
with actual as (
    select source, round(metric_value, 2) as metric_value
    from {{ ref('revenue_by_source') }}
    where fiscal_quarter = '{{ var("demo_quarter") }}'
),
expected as (
    select * from (values
        ('salesforce', 2100000.00),
        ('warehouse', 1800000.00),
        ('stripe', 1600000.00)
    ) as e(source, metric_value)
)

select e.source, e.metric_value as expected_value, a.metric_value as actual_value
from expected e
left join actual a using (source)
where a.metric_value is null or a.metric_value != e.metric_value

