{% macro cents_to_dollars(column_name, scale=2) %}
    round(cast({{ column_name }} as decimal(38, {{ scale }})) / 100, {{ scale }})
{% endmacro %}

