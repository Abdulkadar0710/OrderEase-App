# OrderRevise — Complete App Overview & Functional Specifications

> **Official Specification & Engineering Manual**  
> **Platform:** Shopify Embedded App (Shopify App Bridge React + Polaris)  
> **Customer Touchpoints:** New Customer Accounts UI Extension & Post-Checkout Order Status UI Extension  
> **Technology Stack:** React Router (Remix-based), Node.js, Prisma ORM, Shopify Admin GraphQL API, Shopify Fulfillment Orders API  

---

## 01. Customer-Facing Functionalities: Item Management

### 1.1 Line Item Quantity Adjustments
* **Concept:** Allows customers to increase or decrease quantities of line items currently in their unfulfilled order without contacting customer service or canceling the entire transaction.
* **Mechanics:** The customer clicks "Adjust item quantities" in the order portal. Stepper controls (+ / -) allow incrementing or decrementing counts. When increasing, OrderRevise verifies real-time stock levels. If stock is confirmed, the line item count is updated in Shopify Admin.
* **Validation Rules:** Verifies real-time SKU inventory; prohibits negative quantities; blocks updates if order is fulfilled or cancelled.
* **Financial Impact:** If quantity increases, triggers Automatic Fulfillment Hold on the balance due. If decreased, prepares credit or refund.
* **Practical Example:** A customer ordered 1 bottle of vitamins, realizes they want 3 bottles to get through the quarter, taps (+) twice, and pays the difference via invoice.

### 1.2 Product Variant Swapping (Size, Color, Style)
* **Concept:** Enables customers to switch product options (e.g. changing size from Medium to Large, or color from Navy to Black) on an item they have already purchased.
* **Mechanics:** OrderRevise fetches all active variants for the product via Shopify GraphQL. The customer selects the new variant options from a dropdown. The system validates inventory for the target SKU and updates the line item in place.
* **Validation Rules:** Target variant must be active, published, and currently in stock.
* **Financial Impact:** If the new variant has a different price (e.g. Size XXL costs $3 more), subtotal and taxes are dynamically updated.
* **Practical Example:** A buyer orders a Medium running jacket, realizes after reading the size guide that they need a Large, and swaps the variant instantly without reordering.

### 1.3 Item Replacement / Product Exchange
* **Concept:** Allows customers to substitute an ordered product with a completely different catalog product before the parcel is packaged.
* **Mechanics:** The customer selects an item to replace, searches the merchant's catalog for the replacement item, selects options, and submits. The old item is removed and the new SKU is appended to the order.
* **Validation Rules:** Ensures replacement item has sufficient inventory; old item must be unfulfilled.
* **Financial Impact:** Price delta calculated automatically; higher price triggers fulfillment hold, lower price creates refund delta.
* **Practical Example:** A customer bought an iPhone 14 case by mistake instead of an iPhone 15 case. They swap to the correct model before warehouse packaging.

### 1.4 Adding New Products to Placed Orders
* **Concept:** Transforms the order confirmation screen into a post-purchase shopping channel, enabling buyers to add brand-new products to an unfulfilled order with combined shipping.
* **Mechanics:** Shoppers open the catalog browser modal, select products/variants, and add them. OrderRevise appends the line items, updates taxes, applies an automatic fulfillment hold, and emails a balance due invoice.
* **Validation Rules:** Validates inventory availability; verifies order is unfulfilled and within merchant edit cutoff window.
* **Financial Impact:** Generates positive balance due ($); immediately engages `fulfillmentOrderHold` until invoice payment.
* **Practical Example:** A customer orders coffee beans, realizes they also need paper filters, and adds them to the existing order without paying separate shipping.

---

## 02. Customer-Facing Functionalities: Shipping & Delivery

### 2.1 Shipping Address Updates & Delivery Corrections
* **Concept:** Allows customers to correct delivery address mistakes (e.g. missing apartment or suite numbers, wrong house number, or postal code typos) before shipping.
* **Mechanics:** Customers access the "Change address" dialog in the order portal. They edit street lines, apartment number, city, state, postal code, and country. Once confirmed, OrderRevise updates both the order record and the open fulfillment orders in Shopify.
* **Validation Rules:** Requires Address1, City, Country, and Postal Code; verifies country matches available store shipping zones.
* **Warehouse Sync:** Immediately updates destination on Shopify fulfillment orders, ensuring shipping label apps print the correct address.
* **Practical Example:** A customer auto-filled their old apartment address. Within 15 minutes of checkout, they update the address to their new home.

### 2.2 Google Places Address Autocomplete & Verification
* **Concept:** Integrates Google Places API into the address form to suggest real, verified postal addresses as the customer types, eliminating invalid destinations.
* **Mechanics:** As the buyer types in the street address field, Google Places queries return verified address predictions. Selecting a prediction auto-fills street, city, state/province, postal code, and ISO country code with 100% postal accuracy.
* **Validation Rules:** Ensures postal boundary compliance; includes clean manual fallback if the Google API is unreachable.
* **Business Value:** Dramatically cuts Return-to-Sender (RTS) courier penalties, lost packages, and courier address correction surcharges.
* **Practical Example:** A buyer types "742 Everg" and selects "742 Evergreen Terrace, Springfield, OR 97477", auto-populating all postal fields accurately.

### 2.3 Shipping Method & Delivery Speed Upgrades
* **Concept:** Allows customers to upgrade their delivery service level (e.g. changing from Free Standard delivery to Express Overnight).
* **Mechanics:** OrderRevise queries the merchant's active shipping rates for the destination address, displays available delivery speeds and price differences, and updates the shipping line on the order.
* **Financial Impact:** The shipping price difference (e.g. +$15.00) is added to the balance due, holding fulfillment until paid.
* **Practical Example:** A customer orders a gift with standard 5-day shipping, realizes they need it for a weekend party, and upgrades to 2-Day Air.

### 2.4 Customer Contact Information Updates & 2.5 Order Notes
* **Contact Correction:** Updates email and phone number with RFC-5322 and E.164 phone formatting validation so buyers don't miss carrier tracking links.
* **Order Notes:** Special delivery notes and instructions are written directly to Shopify's `order.note` field.
* **Validation Rules:** Rejects invalid email syntax; validates phone digit counts; sanitizes text against code injection.
* **Practical Example:** A buyer writes: "Gate code is #8821. Please leave package behind the pillar on the front porch."

---

## 03. Customer-Facing Functionalities: Retention, Bulk & Exit

### 3.1 Post-Purchase Discount Codes & Promotional Vouchers
* **Concept:** Allows buyers who forgot to apply a promotional coupon code during checkout to apply it after completing the purchase, preventing unnecessary cancellations.
* **Mechanics:** The customer enters the coupon code into the widget. The backend validates the code via Shopify's PriceRule engine. When valid, the discount is applied, subtotal recalculated, and the price difference is prepared for refund or credit.
* **Supported Promos:** Percentage discounts, fixed amount off, Free Shipping promotions, and Buy X Get Y (BXGY) vouchers.
* **Practical Example:** A customer completes checkout, sees a 10% welcome coupon in their email, applies "WELCOME10", and saves $10 instantly.

### 3.2 Product Upsell & Cross-Sell Recommendation Carousel
* **Concept:** Showcases intelligent add-on recommendations directly inside the order portal based on the products the buyer already ordered.
* **Mechanics:** Merchants configure product tag pairings in OrderRevise (e.g. orders containing products tagged `sneakers` show products tagged `sneaker-upsell`). Customers can add the accessory to their existing order with 1 click.
* **Admin Control:** Tag associations managed via Product Tags Section in the admin dashboard (`api.order.upsell-tags.tsx`).
* **Practical Example:** A customer orders a camera; the order page recommends an extra memory card and protective pouch with 1-click addition.

### 3.3 Bulk Order Update Engine (Visual UI & CSV Upload)
* **Concept:** Designed for high-volume B2B merchants and wholesale buyers who need to modify dozens of line items simultaneously on large orders.
* **Mechanics:** Offers two modes: (1) Visual multi-item staging modal where users adjust multiple quantities and items before submitting in a single batch transaction. (2) CSV upload where users upload a spreadsheet with SKU actions.
* **Error Reporting:** Pre-validates all rows; produces automated error logs flagging invalid SKUs, discontinued items, or inventory caps.
* **Built-in Template:** Includes instant sample CSV template download endpoint (`api.order-edit.sample-csv.tsx`).
* **Practical Example:** A wholesale buyer updates a 40-item order by uploading an edited CSV, modifying 8 product quantities in seconds.

### 3.4 Instant PDF Invoice & Receipt Downloads
* **Concept:** Provides immediate on-demand downloadable PDF invoices directly from customer order status pages.
* **Mechanics:** Server-side PDFKit generation (`app/utils/invoice.server.ts`) compiles order items, tax breakdowns, shipping charges, discount codes, merchant address, and payment status into a print-ready document.
* **Practical Example:** A corporate customer downloads an itemized tax receipt for company expense reporting.

### 3.5 Self-Service Order Cancellations & Automated Restocking
* **Concept:** Allows buyers to immediately cancel an unfulfilled order within merchant-defined cutoff windows.
* **Mechanics:** Verifies order eligibility (unfulfilled and within time limit). OrderRevise calls Shopify Admin GraphQL to cancel the order, restocks items to inventory, and triggers an automated refund via Shopify Payments.
* **Safety Rules:** Cancellation is blocked once an order is marked fulfilled or after the merchant's cutoff time window expires.
* **Practical Example:** A customer realizes they placed a duplicate order by accident, cancels within 5 minutes, and receives an instant refund.

---

## 04. Financial Safety: Automated Fulfillment Hold Lifecycle

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│ 1. Order Edit   │       │ 2. Balance Due  │       │ 3. Hold Engaged │
│ Item added or   │ ────> │ Positive balance│ ────> │ fulfillmentOrder│
│ variant upgrade │       │ due calculated  │       │ Hold (AWAITING) │
└─────────────────┘       └─────────────────┘       └─────────────────┘
                                                              │
                                                              ▼
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│ 5. Auto-Release │       │ 4. Paid Webhook │       │ 4. Tag & Email  │
│ fulfillmentOrder│ <──── │ orders/paid     │ <──── │ Payment-Pending │
│ ReleaseHold run │       │ event received  │       │ & invoice link  │
└─────────────────┘       └─────────────────┘       └─────────────────┘
```

1. **Balance Detection:** When an edit increases the order total, the backend detects `balanceDue > 0`.
2. **Shopify Fulfillment Hold:** Calls `fulfillmentOrderHold` with official reason `AWAITING_PAYMENT`, locking open fulfillment orders so shipping labels cannot be generated.
3. **Tagging & Invoice Link:** Attaches the `Payment-Pending` tag and sends a Shopify invoice link to the customer.
4. **Account UI Warning Banner:** Renders an urgent warning banner in the customer portal informing the buyer that fulfillment is paused until payment is completed.
5. **Automated Release Webhook:** Upon invoice payment, the `orders/paid` webhook fires `fulfillmentOrderReleaseHold`, removes the `Payment-Pending` tag, and unfreezes the order for warehouse dispatch.

> **Universal Protection:** This automated financial safeguard is active across all order editing operations so every store owner is safe by default.

---

## 05. Security, Integrity & Fraud Guardrails

* **Cryptographic Customer Authentication (JWT):** Decodes and validates Shopify Customer Account JWT tokens (RFC-7519). Matches `sessionToken.sub` strictly against `order.customer.id` to prevent cross-account tampering.
* **Hard Fulfillment Lock:** Edits are permanently blocked if the order has fulfillment status `FULFILLED` or delivery status `DELIVERED`.
* **Configurable Time Cutoff Windows:** Merchants configure cutoff windows (presets: 30m, 1h, 2h, 1d, 2d, or exact custom durations) with live countdown timers.
* **Maximum Allowed Edits Guard:** Caps edit attempts (e.g. max 2 or 3 edits per order) to prevent inventory hoarding and bot cycling.
* **Real-time Stock Reservations:** Validates live inventory levels before committing any item addition or variant swap.

---

## 06. Merchant Admin Control Center & Analytics

| Admin Module | Merchant Management Capabilities | Technical Implementation |
| :--- | :--- | :--- |
| **Active Services Center**<br>`app.active-services.tsx` | 12 independent master toggles. Merchants can enable or disable any functionality with a single click (e.g. allow address edits but disable cancellations). | `ServiceSettings` table in Prisma DB; composite PK `[shop, id]`. |
| **Time Limits & Max Edits** | Configure cutoff windows (presets or custom minutes/hours) and set maximum edit attempts allowed per order. | `OrderEditTimeLimit` model with live timer sync. |
| **Google Places Config** | Manage Google Places API key to enable verified global address suggestions and postal boundary checks. | `GooglePlacesConfig` table; backend proxy endpoint. |
| **Upsell Tag Manager** | Search catalog products and assign tags to establish automated product recommendation pairings for customer checkout. | Shopify Admin GraphQL `tagsAdd` / `tagsRemove` mutations. |
| **Insights & Analytics**<br>`app.insights.tsx` | Track total orders edited, edits count, Customer Account UI vs Checkout UI usage split, and recent customer activity audit logs. | `EditedOrder` table synced with live Shopify Admin queries. |

---

## 07. Summary for Developers & Store Operators

OrderRevise acts as an intelligent, automated bridge between customer self-service and warehouse fulfillment security. Every action is authenticated, inventory-checked, and guarded by automated fulfillment holds so store owners can eliminate support ticket churn without inventory loss.
