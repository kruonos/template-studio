# Sample Templates

These screenshots are captured from the running studio with the direct preset URL:

```text
http://localhost:3000/?preset=<preset-id>
```

## Samples

| Preset | Direct URL | Screenshot |
| --- | --- | --- |
| Product one-pager | `/?preset=product-one-pager` | [product-one-pager.png](./screenshots/product-one-pager.png) |
| Investor update | `/?preset=investor-update` | [investor-update.png](./screenshots/investor-update.png) |
| Field report | `/?preset=field-report` | [field-report.png](./screenshots/field-report.png) |
| Conference agenda | `/?preset=conference-agenda` | [conference-agenda.png](./screenshots/conference-agenda.png) |

Recreate the screenshots locally:

```bash
mkdir -p samples/screenshots

for preset in product-one-pager investor-update field-report conference-agenda; do
  bunx playwright screenshot \
    --wait-for-selector '.canvas-element' \
    --wait-for-timeout 1200 \
    --viewport-size 1440,1200 \
    "http://127.0.0.1:3000/?preset=$preset" \
    "samples/screenshots/$preset.png"
done
```
