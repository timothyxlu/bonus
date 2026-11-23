# Importing account history

Real history is imported **through the app** (Settings → 导入历史, or `POST /api/import`),
never committed to the repository. If you keep a local file, put it under `private/`
(git-ignored) or name it `*.private.json` / `*.private.csv`.

Use **预览 (dry run)** first: it validates every row and reports what would be created.
Re-importing is safe: an account with the same product, open date and last 4 is skipped.

## JSON

```json
{
  "version": 1,
  "accounts": [
    {
      "product": "chase-sapphire-preferred",
      "last4": "1234",
      "appliedAt": "2024-05-28",
      "openedAt": "2024-06-01",
      "status": "open",
      "bonuses": [
        { "amountRequired": 4000, "progress": 4000, "rewardAmount": 60000, "rewardUnit": "points",
          "status": "posted", "earnedAt": "2024-08-10" }
      ],
      "benefits": [{ "name": "DoorDash", "amount": 10, "period": "monthly" }],
      "events": []
    },
    { "product": "My Credit Union Visa", "issuer": "Example Credit Union", "openedAt": "2019-03-01",
      "closedAt": "2023-01-01", "status": "closed" }
  ]
}
```

Account fields:

| Field | Notes |
| --- | --- |
| `product` | Catalog product **id** (see 设置 or `GET /api/products`) or its exact name. Or use `productId`. |
| `issuer` | Needed only when the product is not in the catalog; an institution is created if missing. |
| `kind` | `credit_card` (default), `bank_account`, `gift_card` |
| `ownerType` | `personal` / `business` (defaults to the product's) |
| `last4` | **Exactly 4 digits.** Full numbers are rejected. |
| `status` | `open` (default), `closed`, `denied`, `pending` |
| `appliedAt`, `openedAt`, `closedAt` | `YYYY-MM-DD` |
| `isAuthorizedUser` | `true` for AU cards (they count toward 5/24 by default) |
| `nickname`, `notes`, `details` | free form |
| `events` | `[{ "type": "product_change", "date": "...", "fromProductId": "...", "toProductId": "..." }]`. If omitted, applied/approved/denied/closed events are generated from the dates. |
| `bonuses` | Posted bonuses (`status: "posted"`, `earnedAt`) drive the 24/48-month rules. |
| `benefits` | `period`: `monthly`, `quarterly`, `semiannual`, `annual`, `cardmember_year` |

**Product changes:** import the account with its *current* product and add a `product_change`
event with `fromProductId`, so the once-per-lifetime and family rules still see the old product.
Give bonuses earned on the old product `"productId": "<old product>"`.

## CSV

Header row required, columns in any order (unknown columns are ignored):

```
product,issuer,kind,owner_type,nickname,last4,status,applied_at,opened_at,closed_at,is_authorized_user,bonus_earned_at,notes
chase-sapphire-preferred,,,,,1234,open,2024-05-28,2024-06-01,,,2024-08-10,
amex-gold,,,,,0002,closed,,2019-01-10,2020-01-15,,,
```

`bonus_earned_at` creates a posted bonus with that date.
