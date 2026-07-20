with source as (
    select * from {{ source('salesforce', 'opportunity') }}
)

select
    cast(id as varchar) as opportunity_id,
    cast(amount as decimal(18, 2)) as amount_dollars,
    cast(stage_name as varchar) as stage_name,
    cast(close_date as date) as close_date,
    strftime(cast(close_date as date), '%Y') || '-Q' || cast(quarter(cast(close_date as date)) as varchar) as fiscal_quarter,
    stage_name = 'Closed Won' as is_closed_won,
    cast(_fivetran_synced as timestamp) as loaded_at
from source

