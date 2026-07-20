select * from (values
    (1, 'raw_data', 35, false, false, false, false, 'Values only; the agent cannot determine metric meaning or authority.'),
    (2, 'semantic_definitions', 62, true, false, false, false, 'Adds governed definitions, intended use, and ownership.'),
    (3, 'freshness_metadata', 78, true, true, false, false, 'Adds sync recency, thresholds, and source history boundaries.'),
    (4, 'full_governance', 94, true, true, true, true, 'Adds authority, reconciliation rules, lineage references, tests, and historical evidence.')
) as layers(layer_number, layer_name, confidence_score, definitions_verified, recency_verified, historical_basis_verified, governance_verified, score_explanation)

