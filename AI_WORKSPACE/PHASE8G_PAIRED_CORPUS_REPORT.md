# Phase 8G Paired Corpus Report

## Aggregate Counts
- **Total captures attempted:** 4
- **Total valid pairs:** 3
- **Invalid pairs:** 1
- **Complete coverage count:** 4
- **Partial/Missing/Unknown coverage count:** 0
- **Usable evidence count:** 0
- **Unavailable (No Fills) count:** 4
- **Unavailable (Insufficient Data) count:** 0
- **Unavailable (Missing Mapping) count:** 0
- **Failed SL Evaluation count:** 0

## Corpus Summary Table

| Slug | Strategy | Validity | Coverage | SL Verdict | Replay Ev | L2 Ev (Book/Trade) | Errors/Warnings |
|------|----------|----------|----------|------------|-----------|---------------------|-----------------|
| btc-updown-5m-1779343200 | late-entry | undefined | complete | unavailable_no_fills | 2130 | 182549 (174397/0) | 0 / 0 |
| btc-updown-5m-1779371700 | late-entry | valid | complete | unavailable_no_fills | 1926 | 187475 (171276/0) | 1 / 0 |
| btc-updown-5m-1779372300 | late-entry | valid | complete | unavailable_no_fills | 2638 | 141187 (130092/0) | 1 / 0 |
| btc-updown-5m-1779372900 | late-entry | valid | complete | unavailable_no_fills | 2643 | 119894 (110114/0) | 1 / 0 |

## Interpretation
- **What the corpus proves:** The evaluation plumbing works correctly to pair live shadows with L2 data.
- **What it does not prove:** Any profitability claim. We are still establishing the data foundation.
- **Data missing:** We need to ensure strategies are actually taking trades so we have sufficient usable evidence for markout reporting.

## Next Recommendation
Proceed to run Strategy Lab paired corpus batch over these generated datasets, or capture more if usable evidence is low.