select
    lower(cast(connection_name as varchar)) as source,
    cast(sync_end_time as timestamp) as sync_end_time,
    upper(cast(status as varchar)) as status
from {{ source('metadata', 'sync_log') }}

