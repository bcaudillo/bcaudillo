with source as (
    select * from {{ source('stripe', 'charge') }}
)

select
    cast(id as varchar) as charge_id,
    cast(amount as bigint) as amount_cents,
    {{ cents_to_dollars('amount') }} as amount_dollars,
    cast(status as varchar) as status,
    cast(created as timestamp) as created_at,
    strftime(cast(created as timestamp), '%Y') || '-Q' || cast(quarter(cast(created as timestamp)) as varchar) as activity_quarter,
    status = 'succeeded' as is_successful,
    cast(_fivetran_synced as timestamp) as loaded_at
from source

