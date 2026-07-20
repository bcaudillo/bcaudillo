select
    cast(quarter as varchar) as fiscal_quarter,
    cast(net_revenue as decimal(18, 2)) as net_revenue_dollars,
    cast(_fivetran_synced as timestamp) as loaded_at
from {{ source('finance', 'fct_revenue_reconciled') }}

