# 30% cumulative exception

For each material-request item:

```
cumulativeApprovedAndCurrent = previouslyApprovedQuantity + currentRequestQuantity
increasePercentage = (cumulativeApprovedAndCurrent / boqQuantity) * 100
```

`increasePercentage > 30` is `EXCEPTION`. `<= 30` is `NORMAL`.

| BOQ | Previously approved | Current | Increase | Result |
| --- | --- | --- | --- | --- |
| 100 | 20 | 15 | 35% | EXCEPTION |
| 100 | 20 | 10 | 30% | NORMAL |
| 100 | 0 | 20 | 20% | NORMAL |
| 100 | 30 | 1 | 31% | EXCEPTION |
| 100 | 20 + 10 | 5 | 35% | EXCEPTION |

Previously approved quantity is the sum of `currentRequestQuantity` on items whose parent request is `APPROVED`. It is not the BOQ quantity plus the requests. A BOQ of 100 with 20 approved and 15 requested is 35%, not 135.

## Who acts

On exception the service notifies MD and Director in-app. They are not approval steps. The workflow task is created for the configured approver. The seeded `MATERIAL_APPROVAL` definition assigns Project Head only. A tenant can replace that definition; the service does not add MD or Director approval steps of its own.

The header `exceptionPercentage` is the highest item percentage. A normal request continues through the same workflow and is not auto-approved.
