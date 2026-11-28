# DiziCashier — feature inventory (inspected 2026-11-28)

Source: https://app.dizicashier.com, signed in as the user's company "Mint" (ID 015779, user John Doe, free plan, empty
books). Every sidebar page, every create form, the settings tabs, the role matrix and the app's full route list
(from its Angular `$state` registry) were read in the logged-in session. Nothing was created or changed there.

It is an AngularJS app (hash routes `#!/…`), Bootstrap look, teal header, left sidebar, currency ৳ (BDT).
Everything is per **company** ("Add Company" in the header makes another set of books; the header shows `(ID) Name`).

## Shell

- **Header:** hamburger (collapse sidebar), logo, `(ID: 015779) Mint`, **Add Company** button, user menu
  (Profile, Reset Password, Dashboard Settings, Settings, Log Out).
- **Sidebar top:** **Upgrade** (plans), **+ Add New** dropdown: Make Sale, Create Customer, Make Purchase, Create
  Supplier, Receive Payment (popup), Give Payment (popup), Pay Expense.
- **Sidebar groups** (each a collapsible list):

| Group | Pages |
|---|---|
| Dashboard | — |
| Accounts | Chart of Accounts, Account Statement, Payment Methods |
| Products/ Services | Product List, Service List, Product Categories, Measurement Units, Change Products Price, Import Products, Print Barcode/ Serial No |
| Sales | Sales, Make Sale, Quotation, Make Quotation, Return sold product, Return customer product, Exchange sold product, Customers |
| Purchases | Purchase, Make Purchase, Purchase Order, Make Purchase Order, Purchase Return, Suppliers |
| Payments | Supplier Payment, Customer Payment |
| Traders | Customers, Suppliers, Import Traders |
| Stocks | Warehouse, Stock List, Stock Adjustment, Stock Transfer, Production, Production Template, Production Serial |
| Transactions | Vouchers, Withdraw/Deposit/Transfer/Cash Out, Pay Expense, Incomes, Clearing Cheque |
| Tools | Users, Roles, Taxes, Dashboard Settings, Settings, SMS History, Organization Info |
| Reports | All Reports + 45 reports (below) |

Lists share one shape: filters row on top, colour status tabs (All / Paid / Unpaid / Partial Paid), table, **Action**
column (view / edit / delete / print), "Items per page", **+Add** button, sometimes **Bulk Action** with row
checkboxes. Dates are a "Date Range" picker.

## Dashboard

Top cards (web + mobile): **Today's Sale** (Paid / Credit), **Today's Expense**, **Total Receivable**, **Total
Payable**, **Cash Balance**, **Bank Balance**.
Charts: **Top 5 Customers** (sales last 30 days, "See Others" → Top Customer report), **Top 5 Sale Items** ("See
Others" → Top Sold Products), **Asset Analysis**, **Sale Analysis** (period switch: `TimePeriodType`), **Profit Loss**
(month / income / expense).
**Dashboard Settings** (`/dashboardsetting`): tick which top cards (Today's Sale, Today's Expense, Total Receivable,
Total Payable, Total Cash, Total Bank) and which charts (Top 5 Customers, Top 5 Sale Items, Asset Analysis, Sale
Analysis, Profit Loss) show → Apply.

## Accounts

### Chart of Accounts (`/accounts`)
Four tabs, each with groups; each group a table (Name, Current Balance, Action) and "+ Add New <group>". Seeded
accounts for a new company:

- **Asset** — Cash: *Petty Cash* · Bank: — · Mobile Bank (Current Balance + **Cash Out Balance**): — · Receivable:
  *Accounts Receivable, Cheque on Clearing* · Equipment: — · Inventory: *Finished Goods, Hire Items, Raw Materials,
  Resale Items*
- **Liability** — Payable: *Accounts Payable, Cheque payble, Hire Liability, Vendor Tax Liability* · Tax: *Tax
  Collected, Tax Deducted Payable, Tax Deducted Receivable, Tax Paid* · Equity: *Current Year Earnings, Opening
  Customer Balance, Opening Stock, Opening Supplier Balance, Owners Equity, Retained Earnings*
- **Income** — Sales: *Sales* · Income: — · Revenue: —
- **Expense** — Expense: *Daily Maintenance, Miscellaneous, Showroom / Office Rent, Staff Salary, Utility Bills* ·
  Purchase: *Purchases* · Cost Of Sales: *Cost of Goods Sold* · Inventory: *Stock Adjustment*

System accounts (receivable, payable, tax, equity, COGS…) are posted to by the engine; users add cash/bank/mobile
bank/expense/income heads. Account create/edit: `/accounts/create/:groupId`.

### Account Statement (`/accounts/detail`)
Filters: Date Range, Account. Columns: Date, Voucher No, Reference, In(৳), Out(৳), Balance(৳) (running).

### Payment Methods (`/paymentmethods`)
Columns: Name, Payment Type, Account, Charge, Action. Form: Payment Type (Cash / Bank / Mobile Banking), Name*,
**Auto Deposit To** (account), **Charge*** (e.g. bKash fee %), Description. Used in the payment rows of a sale.

## Products/ Services

- **Product List** (`/items`): filters Product Name, Barcode, Category, Selling Price from–to. Columns: Bulk Action ☐,
  Product Name, Barcode, Category, Selling Price, Tax, In Stock, Status, Action. Buttons +Add, +Add bulk, Bulk Action.
- **Product form** (`/items/create`): Product Name*, Categories, Measurement Unit*, Buying Tax, Selling Tax, "Do you
  purchase this product?" + Buying Price*, "Do you sale this product?" + Selling Price*, Barcode (+ Generate Barcode),
  extra fields (Color, Brand, Country, Warranty — chosen in settings), Description, Is active?, opening stock: Cost Per
  Unit, Initial Quantity, As Of Date; pictures. Save / Save & New.
- **Add bulk** (`/items/createbulk`): one product × attributes (Color, Size…) → **Generate Bulk** makes the variants.
- **Service List** (`/services`): Service Name, Tax Category, Price. Form: name*, tax category, purchase? + buying price
  (tax inclusive switch, price + tax), sale? + selling price (tax inclusive switch, price + tax), description.
- **Product Categories**: Name, **Sub category of** (tree), Description.
- **Measurement Units**: Unit name*, Symbol*. (Hidden route `/mmunitconversions`: unit conversions.)
- **Change Products Price** (`/changeitemsprice`): grid of Product, Barcode, Category, In Stock, editable *Selling
  Price + Tax* → save all.
- **Import Products** (`/importitems`): Download Template (Excel) → upload → preview grid (Product Name, Buying Price,
  Buying Price + Tax, Selling Price, Selling Price + Tax, Initial Quantity, As Of Date, Minimum Stock Quantity,
  Description) → Import.
- **Print Barcode/ Serial No** (`/barcode`): load by Purchase Slip No (Go) or add products + quantity; Select Printer
  (label sizes), include company name?, include price? → Preview / print.

## Sales

- **Sales list** (`/sales`): filters Customer, Slip No, Contact No, Date Range; tabs All / Paid / Unpaid / Partial Paid;
  columns Bulk ☐, Date, Slip No, Customer, Contact No, Total, Due, Delivery Date, Action (view `/sales/detail/:id`,
  edit, print, delete, return, exchange).
- **Make Sale** (`/sales/create/false`) — the main screen:
  - Date, Customer (search, **New Customer** inline; shows Contact No, Address, balance), "Deliver Products Later?"
    (+ delivery date), Warehouse, Sales Representative (if enabled).
  - Lines: Search Product (name/barcode) → Product, Quantity, Price, Sub Total, Action (remove). **+ Add Frequent
    Products/Services** (quick buttons), + Add Product.
  - Totals: Grand Total, Tax Amount, Discount (amount or %), Round-Up Discount, Shipping charge (if enabled),
    **Net Receivable**, **Due Amount**.
  - Payments: rows of Cash / Bank / Mobile Banking with Amount + Deposit To (payment method), **+ Add Payment**;
    Total Amount paid. Expected payment date (if enabled). Installment plan (if enabled).
  - Note, Upload Picture (attachments). **Save / Save & New / Save & Print / Cancel**.
- **Quotation** (`/salequotation`): Date, Customer, Quotation No, Total. Form like a sale without payments; validity
  (if enabled); **Save & Print / Save & Print Without Price**.
- **Return sold product** (`/salesreturns`): Date, Return Slip #, Customer, Total, Due. New: enter **Sales Slip No** →
  Go → pick lines/quantities to return → refund (cash back if allowed) or reduce due.
- **Return customer product** (`/productReturns`): a return without a slip: Date, Customer, products.
- **Exchange sold product** (`/salereplace`): Date, Customer, Slip No, Exchange Slip No, Total. New: Sale Slip No → Go
  → return lines + new lines, difference paid/refunded.
- Hidden modules (by settings): **Service orders** (`/serviceorder`: slip, customer, service product, total, due,
  delivery date), **Installments** (`/saleinstallemnt`: due date, customer, slip, due amount; Unpaid / Paid / Partial),
  **Sales representatives** (name, designation, contact, email, address, balance), **Customer groups**, **E-commerce
  orders** (`/order`: Pending → Processing → Ready To Ship → Shipped → Delivered / Cancel, delivery partner, location;
  converts to a sale), couriers, membership tiers/members, buy back, hire.

## Purchases

- **Purchase list** (`/purchasesbatchwise`): filters From/To date, Supplier, Slip No; tabs All / Paid / Unpaid /
  Partial Paid; columns Date, Supplier, Slip No, Supplier Invoice No, Total, Due, Action.
- **Make Purchase**: Date, Supplier Invoice No, Supplier (+ Add Supplier), lines (Product Name, Quantity, Price, Sub
  Total) + frequent products, Grand Total, Tax Amount, Discount, **Net Payable**, Paid Amount (+Add payment rows:
  account), **Due Amount**, Note, up to two attachments. Optional: item-wise discount/VAT, set selling price, batch /
  expiry, serials.
- **Purchase Order** (`/purchaseorder`): Date, Supplier, Slip No, Total; form like a purchase without payment;
  converts to a purchase.
- **Purchase Return** (`/purchasereturns`): Date, Return Slip #, Supplier, Total, Due. New: Purchase Slip No → Go →
  lines to return.

## Payments

- **Customer Payment** (`/payments/customer`): Date Range, Customers, Payment Slip No, Slip No; columns Date, Received
  from, Payment Slip No, Slip No (sale), Account, Method, Amount, Note, Action.
- **Supplier Payment** (`/payments/supplier`): same, Paid to (Supplier).
- Form / **Receive Payment** and **Give Payment** popups (from + Add New): Date*, Customer|Supplier*, Account*,
  Amount*, against which slip (or on account / advance), Note. Prints a money receipt.

## Traders

- **Customers** (`/traders/customer`): filters Name, Code, Contact Person, Contact No; tabs All / Active / Inactive /
  **Show with Balance**; columns Name, Contact Person, Contact No, Code, Last Trading Date, Balance, Status, Action.
- **Customer form**: Name*, Code (auto/optional per settings), Contact Person, Contact No, Designation, Email, BIN,
  Address, Shipping Address, (district/area if enabled), **Opening Balance** as **Advance** or **Due** + As of Date,
  documents, Is Active. Customer page also lists products bought (Products/Services, Barcode, Price, Last Sell).
- **Suppliers**: same shape.
- **Import Traders**: template → grid (Name, Code, Contact No, Opening Balance, As of Date, Contact Person,
  Designation, Email, Address, Shipping Address) → import.
- Detail page `/traders/:isSupplier/detail/:id`: ledger, sales/purchases, payments.

## Stocks

- **Warehouse**: Name (default "Main").
- **Stock List** (`/stocks`): filters Product, Barcode, SKU, Category, Warehouse; switches "Show only items in stock /
  Include zero"; columns Product, Barcode, Warehouse, **Stock Value**, **In Hand**, **Weighted Avg Cost**, Action
  (history `/stocks/:id/:warehouse/:batch/history`, batches).
- **Stock Adjustment**: list (Date, Product, Warehouse, Quantity, Reason, Adjusted By, Note). Form: Date, Reason,
  lines (Product, Available In Hand, **New Stock In Hand**, Adjusted Quantity), Note. Posts to *Stock Adjustment*.
- **Stock Transfer**: list (Date, From, To, Transferred By, Note). Form: Date, Warehouse From/To, lines (Product,
  Available, Transferred Quantity), Note.
- **Production Template**: Name*, raw items (Item, Quantity) → finished items (Item, Quantity) (a recipe / BOM).
- **Production**: Production Date, Search Template (or pick items), raw items consumed, finished items made, Note;
  list Date, Production No.
- **Production Serial**: production of serial items: Date, Production No, Finished Item, Finished Item's Serial.

## Transactions

- **Vouchers** (`/vouchers`): Date, Voucher No, Tran. Type, Amount, Note. Form: Date*, **Voucher Type** (journal /
  payment / receipt / contra), debit & credit lines (account, amount), Note. The general journal.
- **Withdraw/Deposit/Transfer/Cash Out** (`/balanceTransfer`): Date, Voucher No, From Account, To Account, Amount,
  Note. Form: Date, From, To, Amount, Note.
- **Pay Expense** (`/expenses`): filters Pay From, Expense, Date Range, Prepared By; columns Date, Voucher No, Expense,
  Pay From, Amount, Prepared By, Note. Form: Date, **Pay from** (cash/bank account), rows (Expense head*, Amount*,
  Note), total, cost centre (if enabled), Note, attachments.
- **Incomes**: Date, Voucher No, Income Account, Deposit To, Amount, Note. Form: Date, **Deposit to**, rows (Income*,
  Amount*, Note).
- **Clearing Cheque** (`/cheque`): tabs Open / Close / Cancel; columns Customer/Supplier, Type (received/issued),
  Cheque Issue Date, Encash Date, Cheque No, Status, Amount, Action (clear → moves from *Cheque on Clearing* / *Cheque
  payable* to the bank; bounce/cancel).
- **Cost centres** (if enabled): Name*, Contact No, Address, Main?; expenses and reports split by cost centre.

## Tools

- **Users**: Name, User Name, Contact No, Email, Role, Status. Form: First*, Last*, Time Zone*, OTP/notification to
  (Phone | Email), Contact No*, Email, User Name*, Password*, Confirm*, Active/Inactive, Role (Mint (Default) /
  SalesPerson / Admin / custom).
- **Roles**: Name* + permission matrix with **Select All** per group. Groups and checks (verbatim keys):
  - Item: create, edit, delete, view, view stock, see cost/buying/wholesale price, print barcode/serial, quick info;
    service create/edit/delete/view
  - Item Category, Measurement Unit: create/edit/delete/view
  - Sales: sale, edit, delete, view; give discount/change unit price; sell below default price; return sale; delete
    return; view installment; sale on installment; quotation create/edit/view; sales rep add/edit/view; view total sale
    and due; buy back / delete buy back
  - Purchase: purchase, edit, delete, view
  - Customer / Supplier: add, edit, delete, view, view balance
  - Voucher: create/edit/delete/view · Expense: pay/edit/delete · Balance Transfer: transfer/edit/delete
  - Supplier Payment: pay/delete/view · Customer Payment: receive/delete/view
  - Account: add/edit/delete/view/view balance · Income: add/edit/delete
  - Organization: edit info · User: add/edit/view · Role: add/edit/delete/view
  - Settings: change settings; **transact on past & future dates**; see dashboard; change dashboard settings; view tools
  - Report: view reports + one check **per report** (≈45)
  - Activity log: view
  - Warehouse/Stock: add/edit/view warehouse, view stock list, adjust, transfer, delete adjust, delete transfer;
    production create/edit/delete/view
  - Order / Courier / Membership: create/edit/view …
- **Taxes** (`/taxcategories`): Name, Percentage (%). Seed: "Tax Free (0%)".
- **Settings** — tabs (all switches unless noted):
  - *Language*: system language (Bangla / English), report font (English / Bangla).
  - *Primary*: currency symbol (৳, $, €, £, SR, د.إ, Nrs, QR, CAD); maintain e-commerce orders?; multiple cost centres?
  - *Account*: allow negative account balance?; resale items as asset (else purchase = expense)?
  - *Manage Inventory*: default warehouse for purchase / for sale; allow negative inventory?; batch expiry dates?;
    manual batch code?; choose batch manually in sale/adjustment?
  - *Item*: quantity decimal places (0–4); default unit; default tax category; prices tax-inclusive by default?;
    minimum stock alert?; barcode?; SKU?; wholesale price?; serial items?; copy item with price?; show buying price /
    average cost / image in item list?; items with attributes?; tester items?; extra item fields (Color, Brand,
    Country, Warranty).
  - *Trader*: customer code?; code mandatory?; supplier code?; auto-generated codes?; contact no mandatory?;
    district/area for customers?; opening balances via income/expense?
  - *Purchase Management*: item-wise discount?; item-wise VAT?; supplier's last price?; update buying price after each
    purchase?; set selling price during purchase?; show creator in purchase list?
  - *Sale Management*: focus next line after picking item?; slip no Automatic + format `S-YY001`; customer's last
    price?; discount on VAT?; selling price VAT-inclusive?; show customer contact/address?; take order & deliver later?;
    item-wise discount?; round-up discount?; expected payment date?; sales representatives?; installments?; export
    invoice to Doc / Excel?; show sales person in list?; shipping charge?; choose supplier during sale?; quotation
    validity?; edit sales up to N days; default payment.
  - *Order Management*: order no Automatic `O-YY001`; show contact/address; shipping charge.
  - *Return/Exchange*: return with cash back?; return exchanged items?; return/exchange up to N days; up to N times;
    buy back?
  - *Invoice*: layout A4 / 3-inch thermal / 58 mm thermal; item-name characters; group bulk items; barcode before name;
    payment details; item-wise tax; item description; customer previous balance; balance on payment receipt;
    authorization signature; header logo + company info; hide organization info; watermark; Paid/Due/COD seal;
    item-wise warranty on quotation; total quantity; QR code; footer + footer text.
- **SMS History** (paid plans; promotional SMS, SMS purchase history).
- **Organization Info**: Name*, Contact Person, Contact No, Email, VAT Registration Number, Address, logo; enable
  online store?; WooCommerce integration?
- **Activity Log** (`/activitylogs`): Activity On, User, Activity Type (Log In/Out, Create/Update/Delete Item, Stock
  Adjustment, Service, Category, Invoice, Sales Return, Purchase, Voucher, Expense, Balance Transfer, Supplier Payment,
  Customer Payment, Account Head, Income), Comment; filters dates, type, user.
- **Upgrade**: plans 600 / 1100 / 2500 BDT per month, 15% off yearly.

## Reports (`/reportdashboard`, searchable list; each page = filters → Generate → Print / Cancel)

| Group | Report | Filters |
|---|---|---|
| Customer/Supplier | Customer Statement | Date Range, Customer |
| | Customer Detail Statement | Date Range, Customer |
| | Supplier Statement | Date Range, Supplier |
| | Supplier Detail Statement | Date Range, Supplier |
| | Customer Collection | Date Range, Is Due Collection? |
| | Aged Accounts Receivable | — (as of today, 0-30/31-60/61-90/90+) |
| | Aged Accounts Payable | — |
| | Customer Ledger | Customer Group, include zero/advance balance? |
| | Supplier Ledger | include zero/advance balance? |
| | Receivable Report | Date Range, include zero/advance? |
| | Payable Report | Date Range, include zero/advance? |
| | Top Customer Report | Date Range |
| Sales | Sales Register | Date Range, Customer; show tax? due? narration? |
| | Month to Date Sales | Month |
| | Sale-wise Profit Loss | Date Range |
| | Product-wise Sales | Date Range, Item, Customer |
| | Representative-wise Sales | Date Range, Group by (Representative / Item) |
| | Supplier-wise Sales | Date Range, Supplier |
| | Product Sale Summary | Date Range, Categories |
| | Warehouse-wise Product Sale Summary | Date Range |
| | Customer-wise Product Profit | Date Range, Customer |
| | Top Sold Products | Date Range |
| | Discount Report | Date Range, membership discount only? |
| Purchase | Purchase Register | Date Range, Supplier; show tax? due? |
| | Supplier-wise Purchase | Date Range, Supplier |
| | Product-wise Purchase | Date Range, Item |
| Financial | Profit Loss Statement | Date Range |
| | Todays Transaction | Date Range |
| | Cash Book | Date Range, Account |
| | Day Closing | Date |
| | Cashier Wise Cash Summary | Date, User |
| | Balance Sheet | Balance On |
| | Trial Balance | Balance On |
| Expense | Expense Detail | Date Range, Expense heads, cost-centre-wise? |
| | Expense Summary | Date Range, cost-centre-wise? |
| Stock | Stock Report | Categories, include zero stock? |
| | Stock Batch Report | Categories, include zero? |
| | Stock Product Summary | Date Range, Categories, include zero? (opening / in / out / closing) |
| | Stock Transaction Report | Date Range, Item |
| | Stock Transfer Report | Date Range, Item |
| Tax | Tax Computation | Date Range (collected − paid) |

Hidden reports in the route list: Ledger (any account), Income Statement, Tax Register, Stock Transaction Summary,
Group-wise Customer Summary, Customer Group Summary, Courier Statement/Register, Upcoming Installments, Order Item
Summary, SR-wise Order Item Summary, Tester Report, Balance Sheet/Stock for all companies.

## Out of scope for the Mint copy (first version)

Upgrade/subscriptions, SMS, online store / WooCommerce, membership tiers, buy back, hire items, tester items,
serial-number production, multi-company "all organization" reports. E-commerce orders + couriers already exist in
Mint's e-commerce type, so they are not copied here.
