# Inside the Agentic Data Warehouse — dbt v2

This project implements the governed context used in the July 30, 2026 Fivetran roundtable demo. It asks the same Q2 2026 reconciliation question in four controlled agent runs while changing only the context available to the agent.

> Salesforce says $2.1M, the warehouse says $1.8M, and Stripe says $1.6M. Which number do you trust?

## What the four runs prove

| Run | dbt relation exposed | Evidence added |
|---|---|---|
| 1 | `revenue_by_source` | Values and source labels only |
| 2 | Run 1 + `revenue_definitions` | Metric meaning, ownership, and intended use |
| 3 | Run 2 + `source_freshness` | Sync recency, thresholds, and history boundaries |
| 4 | `forecast_context` + governance relations | Authority, reconciliation rules, lineage/test references, and historical evidence |

These are four controlled runs of the same agent, not four different models. The displayed confidence values are deterministic evidence-coverage scores from `agent_context_layers`; they are not calibrated model probabilities.

## Lineage

```text
Fivetran sources -> staging -> revenue_by_source -> historical_revenue_gaps
                                |                       |
revenue_definitions ------------+-----------------------+-> forecast_context
source_freshness ----------------+
reconciliation_rules ------------+
```

## Configuration assumptions

Source schemas and the demo quarter are variables in `dbt_project.yml`. Raw tables must expose `_fivetran_synced`. The default relation names are:

- `raw_salesforce.opportunity`
- `raw_stripe.charge`
- `analytics.fct_revenue_reconciled`
- `metadata.sync_log`

Change the schema variables if the MotherDuck landing schemas differ. `stripe.charge.amount` is assumed to be integer cents; Salesforce and finance amounts are dollars.

## Run

```bash
dbt deps
dbt source freshness
dbt build
```

For the live demo, run `dbt build` after the final Fivetran sync and retain the generated `manifest.json`, `run_results.json`, and `sources.json` as evidence. Do not claim a check count from this repository until that build succeeds in the target MotherDuck environment.

## Agent output contract

Each run should use the same prompt and return fewer than 150 words with these fixed sections: Answer, Why numbers differ, How I know, Confidence, and Cost. The agent must cite the relations or artifact references it used and must not treat the evidence-coverage score as a statistical probability.

## Important distinction

Bookings, cash collected, and finance-reconciled revenue are not competing implementations of one metric. They answer different questions. Governance tells the agent which source is authoritative for a stated use case; it does not magically make the three values equal.

