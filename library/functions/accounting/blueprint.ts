/**
 * The books' blueprint (docs/accounting D2; WORK_ORDERS AC-02): every model of a DiziCashier-style book as one
 * feature plan (the shape MCP's build_feature takes; `planFromAi` tidies it), built when an accounting project is made.
 * The same plan built the demo project `thinkcrypt-expense-management` over the connector (2026-11-28). Generated
 * from it — change the models here, raise BOOKS_VERSION, and teach `scripts/upgradeBooks.js` what changed.
 */

export const BOOKS_VERSION = 1;

/** Fields the engine writes (docs/accounting AC-03): read-only in the plain forms. Every field of the engine's own models. */
export const ENGINE_FIELDS: Record<string, string[] | '*'> = {
	accounts: ['balance', 'cashOutBalance'],
	products: ['inStock', 'avgCost'],
	traders: ['balance', 'lastTradingDate'],
	sales: ['status', 'costOfGoods', 'receivedLater'],
	purchases: ['status', 'paidLater'],
	productions: ['totalCost'],
	journal: '*',
	'stock-moves': '*',
	stocks: '*',
};

/** Each step's route (the engine finds models by it). */
export const routeOfStep = (s: any): string => s.route;

export const BOOKS_PLAN: any = {
	"title": "Books",
	"summary": "DiziCashier's books: chart of accounts, products, customers and suppliers, sales, purchases, payments, money, stock, vouchers, journal and settings.",
	"sidebarCategory": "Books",
	"steps": [
		{
			"action": "create",
			"name": "Account",
			"title": "Chart of Accounts",
			"route": "accounts",
			"description": "Every account in the books, by type and group",
			"buttonTitle": "New account",
			"displayField": "name",
			"rationale": "The chart of accounts: every journal line posts to one.",
			"fields": [
				{
					"key": "name",
					"label": "Name",
					"kind": "text",
					"required": true,
					"searchable": true,
					"showInTable": true
				},
				{
					"key": "type",
					"label": "Type",
					"kind": "select",
					"required": true,
					"default": "asset",
					"showInTable": true,
					"options": [
						{
							"value": "asset",
							"label": "Asset"
						},
						{
							"value": "liability",
							"label": "Liability"
						},
						{
							"value": "income",
							"label": "Income"
						},
						{
							"value": "expense",
							"label": "Expense"
						}
					]
				},
				{
					"key": "group",
					"label": "Group",
					"kind": "select",
					"required": true,
					"default": "cash",
					"showInTable": true,
					"options": [
						{
							"value": "cash",
							"label": "Cash"
						},
						{
							"value": "bank",
							"label": "Bank"
						},
						{
							"value": "mobile_bank",
							"label": "Mobile Bank"
						},
						{
							"value": "receivable",
							"label": "Receivable"
						},
						{
							"value": "equipment",
							"label": "Equipment"
						},
						{
							"value": "inventory",
							"label": "Inventory"
						},
						{
							"value": "payable",
							"label": "Payable"
						},
						{
							"value": "tax",
							"label": "Tax"
						},
						{
							"value": "equity",
							"label": "Equity"
						},
						{
							"value": "sales",
							"label": "Sales"
						},
						{
							"value": "income",
							"label": "Income"
						},
						{
							"value": "revenue",
							"label": "Revenue"
						},
						{
							"value": "expense",
							"label": "Expense"
						},
						{
							"value": "purchase",
							"label": "Purchase"
						},
						{
							"value": "cost_of_sales",
							"label": "Cost Of Sales"
						},
						{
							"value": "inventory_expense",
							"label": "Inventory (expense)"
						}
					]
				},
				{
					"key": "systemKey",
					"label": "System key",
					"kind": "text",
					"index": true,
					"helper": "Set for accounts the books post to on their own (accounts_receivable, cogs…). Leave empty for your own accounts."
				},
				{
					"key": "accountNumber",
					"label": "Account number",
					"kind": "text"
				},
				{
					"key": "openingBalance",
					"label": "Opening balance",
					"kind": "number",
					"default": 0
				},
				{
					"key": "openingDate",
					"label": "As of date",
					"kind": "date"
				},
				{
					"key": "balance",
					"label": "Current balance",
					"kind": "number",
					"default": 0,
					"showInTable": true,
					"helper": "Kept by the books"
				},
				{
					"key": "cashOutBalance",
					"label": "Cash out balance",
					"kind": "number",
					"default": 0,
					"helper": "Mobile Bank accounts only"
				},
				{
					"key": "description",
					"label": "Description",
					"kind": "textarea"
				},
				{
					"key": "isActive",
					"label": "Active",
					"kind": "boolean",
					"default": true
				}
			],
			"table": [
				"name",
				"type",
				"group",
				"balance"
			],
			"filters": [
				"type",
				"group",
				"isActive"
			]
		},
		{
			"action": "create",
			"name": "TaxCategory",
			"title": "Taxes",
			"route": "tax-categories",
			"buttonTitle": "New tax",
			"displayField": "name",
			"rationale": "Tax rates picked on products and services.",
			"fields": [
				{
					"key": "name",
					"label": "Name",
					"kind": "text",
					"required": true,
					"searchable": true,
					"showInTable": true
				},
				{
					"key": "percentage",
					"label": "Percentage (%)",
					"kind": "number",
					"required": true,
					"default": 0,
					"min": 0,
					"showInTable": true
				}
			]
		},
		{
			"action": "create",
			"name": "PaymentMethod",
			"title": "Payment Methods",
			"route": "payment-methods",
			"buttonTitle": "New payment method",
			"displayField": "name",
			"rationale": "Methods used in a sale's payment rows; each deposits to an account and may carry a charge.",
			"fields": [
				{
					"key": "paymentType",
					"label": "Payment type",
					"kind": "select",
					"required": true,
					"default": "cash",
					"showInTable": true,
					"options": [
						{
							"value": "cash",
							"label": "Cash"
						},
						{
							"value": "bank",
							"label": "Bank"
						},
						{
							"value": "mobile",
							"label": "Mobile Banking"
						}
					]
				},
				{
					"key": "name",
					"label": "Name",
					"kind": "text",
					"required": true,
					"searchable": true,
					"showInTable": true
				},
				{
					"key": "depositTo",
					"label": "Auto deposit to",
					"kind": "reference",
					"ref": "Account",
					"required": true,
					"showInTable": true
				},
				{
					"key": "charge",
					"label": "Charge (%)",
					"kind": "number",
					"default": 0,
					"showInTable": true
				},
				{
					"key": "description",
					"label": "Description",
					"kind": "textarea"
				},
				{
					"key": "isActive",
					"label": "Active",
					"kind": "boolean",
					"default": true
				}
			],
			"filters": [
				"paymentType",
				"depositTo"
			]
		},
		{
			"action": "create",
			"name": "Unit",
			"title": "Measurement Units",
			"route": "units",
			"buttonTitle": "New unit",
			"displayField": "name",
			"rationale": "Units products are counted in.",
			"fields": [
				{
					"key": "name",
					"label": "Unit name",
					"kind": "text",
					"required": true,
					"searchable": true,
					"showInTable": true
				},
				{
					"key": "symbol",
					"label": "Symbol",
					"kind": "text",
					"required": true,
					"showInTable": true
				}
			]
		},
		{
			"action": "create",
			"name": "ProductCategory",
			"title": "Product Categories",
			"route": "product-categories",
			"buttonTitle": "New category",
			"displayField": "name",
			"rationale": "Product categories as a tree.",
			"fields": [
				{
					"key": "name",
					"label": "Name",
					"kind": "text",
					"required": true,
					"searchable": true,
					"showInTable": true
				},
				{
					"key": "parent",
					"label": "Sub category of",
					"kind": "reference",
					"ref": "__self__",
					"showInTable": true
				},
				{
					"key": "description",
					"label": "Description",
					"kind": "textarea"
				}
			]
		},
		{
			"action": "create",
			"name": "Warehouse",
			"title": "Warehouses",
			"route": "warehouses",
			"buttonTitle": "New warehouse",
			"displayField": "name",
			"rationale": "Where stock is kept.",
			"fields": [
				{
					"key": "name",
					"label": "Name",
					"kind": "text",
					"required": true,
					"searchable": true,
					"showInTable": true
				},
				{
					"key": "address",
					"label": "Address",
					"kind": "textarea"
				},
				{
					"key": "isDefault",
					"label": "Default warehouse",
					"kind": "boolean",
					"default": false,
					"showInTable": true
				}
			]
		},
		{
			"action": "create",
			"name": "CustomerGroup",
			"title": "Customer Groups",
			"route": "customer-groups",
			"buttonTitle": "New group",
			"displayField": "name",
			"rationale": "Groups of customers.",
			"fields": [
				{
					"key": "name",
					"label": "Name",
					"kind": "text",
					"required": true,
					"searchable": true,
					"showInTable": true
				},
				{
					"key": "discount",
					"label": "Discount (%)",
					"kind": "number",
					"default": 0,
					"showInTable": true
				},
				{
					"key": "description",
					"label": "Description",
					"kind": "textarea"
				}
			]
		},
		{
			"action": "create",
			"name": "SalesRepresentative",
			"title": "Sales Representatives",
			"route": "sales-representatives",
			"buttonTitle": "New representative",
			"displayField": "name",
			"rationale": "People credited on sales.",
			"fields": [
				{
					"key": "name",
					"label": "Name",
					"kind": "text",
					"required": true,
					"searchable": true,
					"showInTable": true
				},
				{
					"key": "designation",
					"label": "Designation",
					"kind": "text",
					"showInTable": true
				},
				{
					"key": "contactNo",
					"label": "Contact no",
					"kind": "text",
					"showInTable": true
				},
				{
					"key": "email",
					"label": "Email",
					"kind": "email"
				},
				{
					"key": "address",
					"label": "Address",
					"kind": "textarea"
				},
				{
					"key": "isActive",
					"label": "Active",
					"kind": "boolean",
					"default": true
				}
			]
		},
		{
			"action": "create",
			"name": "CostCentre",
			"title": "Cost Centres",
			"route": "cost-centres",
			"buttonTitle": "New cost centre",
			"displayField": "name",
			"rationale": "Branches or departments expenses are split by.",
			"fields": [
				{
					"key": "name",
					"label": "Name",
					"kind": "text",
					"required": true,
					"searchable": true,
					"showInTable": true
				},
				{
					"key": "contactNo",
					"label": "Contact no",
					"kind": "text",
					"showInTable": true
				},
				{
					"key": "address",
					"label": "Address",
					"kind": "textarea"
				},
				{
					"key": "isMain",
					"label": "Main",
					"kind": "boolean",
					"default": false,
					"showInTable": true
				}
			]
		},
		{
			"action": "create",
			"name": "Product",
			"title": "Products/ Services",
			"route": "products",
			"buttonTitle": "New product",
			"displayField": "name",
			"rationale": "Products and services with prices, taxes, barcode, extra fields and opening stock.",
			"fields": [
				{
					"key": "name",
					"label": "Product name",
					"kind": "text",
					"required": true,
					"searchable": true,
					"showInTable": true
				},
				{
					"key": "kind",
					"label": "Kind",
					"kind": "select",
					"required": true,
					"default": "product",
					"showInTable": true,
					"options": [
						{
							"value": "product",
							"label": "Product"
						},
						{
							"value": "service",
							"label": "Service"
						}
					]
				},
				{
					"key": "category",
					"label": "Category",
					"kind": "reference",
					"ref": "ProductCategory",
					"showInTable": true
				},
				{
					"key": "unit",
					"label": "Measurement unit",
					"kind": "reference",
					"ref": "Unit"
				},
				{
					"key": "barcode",
					"label": "Barcode",
					"kind": "text",
					"searchable": true,
					"index": true,
					"showInTable": true
				},
				{
					"key": "sku",
					"label": "SKU",
					"kind": "text",
					"searchable": true
				},
				{
					"key": "purchasable",
					"label": "Do you purchase this product?",
					"kind": "boolean",
					"default": true
				},
				{
					"key": "buyingPrice",
					"label": "Buying price",
					"kind": "number",
					"default": 0
				},
				{
					"key": "buyingTax",
					"label": "Buying tax",
					"kind": "reference",
					"ref": "TaxCategory"
				},
				{
					"key": "sellable",
					"label": "Do you sell this product?",
					"kind": "boolean",
					"default": true
				},
				{
					"key": "sellingPrice",
					"label": "Selling price",
					"kind": "number",
					"default": 0,
					"showInTable": true
				},
				{
					"key": "sellingTax",
					"label": "Selling tax",
					"kind": "reference",
					"ref": "TaxCategory"
				},
				{
					"key": "wholesalePrice",
					"label": "Wholesale price",
					"kind": "number"
				},
				{
					"key": "taxInclusive",
					"label": "Prices include tax",
					"kind": "boolean",
					"default": false
				},
				{
					"key": "minStock",
					"label": "Minimum stock quantity",
					"kind": "number",
					"default": 0
				},
				{
					"key": "inStock",
					"label": "In stock",
					"kind": "number",
					"default": 0,
					"showInTable": true,
					"helper": "Kept by the books, all warehouses"
				},
				{
					"key": "avgCost",
					"label": "Weighted average cost",
					"kind": "number",
					"default": 0,
					"helper": "Kept by the books"
				},
				{
					"key": "color",
					"label": "Color",
					"kind": "text"
				},
				{
					"key": "brand",
					"label": "Brand",
					"kind": "text"
				},
				{
					"key": "country",
					"label": "Country",
					"kind": "text"
				},
				{
					"key": "warranty",
					"label": "Warranty",
					"kind": "text"
				},
				{
					"key": "openingQty",
					"label": "Initial quantity",
					"kind": "number",
					"default": 0
				},
				{
					"key": "openingCost",
					"label": "Cost per unit",
					"kind": "number",
					"default": 0
				},
				{
					"key": "openingDate",
					"label": "As of date",
					"kind": "date"
				},
				{
					"key": "openingWarehouse",
					"label": "Opening stock warehouse",
					"kind": "reference",
					"ref": "Warehouse"
				},
				{
					"key": "description",
					"label": "Description",
					"kind": "textarea"
				},
				{
					"key": "images",
					"label": "Pictures",
					"kind": "images"
				},
				{
					"key": "isActive",
					"label": "Active",
					"kind": "boolean",
					"default": true,
					"showInTable": true
				}
			],
			"table": [
				"name",
				"barcode",
				"category",
				"sellingPrice",
				"inStock",
				"isActive"
			],
			"filters": [
				"kind",
				"category",
				"isActive",
				"sellingPrice"
			],
			"form": [
				{
					"sectionTitle": "Product",
					"fields": [
						"name",
						[
							"kind",
							"category"
						],
						[
							"unit",
							"barcode"
						],
						"sku"
					]
				},
				{
					"sectionTitle": "Prices",
					"fields": [
						[
							"purchasable",
							"sellable"
						],
						[
							"buyingPrice",
							"sellingPrice"
						],
						[
							"buyingTax",
							"sellingTax"
						],
						[
							"wholesalePrice",
							"taxInclusive"
						],
						"minStock"
					]
				},
				{
					"sectionTitle": "Opening stock",
					"fields": [
						[
							"openingQty",
							"openingCost"
						],
						[
							"openingDate",
							"openingWarehouse"
						]
					]
				},
				{
					"sectionTitle": "More",
					"fields": [
						[
							"color",
							"brand"
						],
						[
							"country",
							"warranty"
						],
						"description",
						"images",
						"isActive",
						[
							"inStock",
							"avgCost"
						]
					]
				}
			]
		},
		{
			"action": "create",
			"name": "Trader",
			"title": "Customers & Suppliers",
			"route": "traders",
			"buttonTitle": "New trader",
			"displayField": "name",
			"rationale": "Customers and suppliers in one list.",
			"fields": [
				{
					"key": "kind",
					"label": "Kind",
					"kind": "select",
					"required": true,
					"default": "customer",
					"showInTable": true,
					"options": [
						{
							"value": "customer",
							"label": "Customer"
						},
						{
							"value": "supplier",
							"label": "Supplier"
						}
					]
				},
				{
					"key": "name",
					"label": "Name",
					"kind": "text",
					"required": true,
					"searchable": true,
					"showInTable": true
				},
				{
					"key": "traderCode",
					"label": "Code",
					"kind": "text",
					"searchable": true,
					"showInTable": true
				},
				{
					"key": "contactPerson",
					"label": "Contact person",
					"kind": "text",
					"searchable": true,
					"showInTable": true
				},
				{
					"key": "contactNo",
					"label": "Contact no",
					"kind": "text",
					"searchable": true,
					"showInTable": true
				},
				{
					"key": "designation",
					"label": "Designation",
					"kind": "text"
				},
				{
					"key": "email",
					"label": "Email",
					"kind": "email"
				},
				{
					"key": "bin",
					"label": "BIN",
					"kind": "text"
				},
				{
					"key": "address",
					"label": "Address",
					"kind": "textarea"
				},
				{
					"key": "shippingAddress",
					"label": "Shipping address",
					"kind": "textarea"
				},
				{
					"key": "customerGroup",
					"label": "Customer group",
					"kind": "reference",
					"ref": "CustomerGroup"
				},
				{
					"key": "salesRepresentative",
					"label": "Sales representative",
					"kind": "reference",
					"ref": "SalesRepresentative"
				},
				{
					"key": "openingType",
					"label": "Opening balance is",
					"kind": "select",
					"default": "due",
					"options": [
						{
							"value": "advance",
							"label": "Advance"
						},
						{
							"value": "due",
							"label": "Due"
						}
					]
				},
				{
					"key": "openingBalance",
					"label": "Opening balance",
					"kind": "number",
					"default": 0
				},
				{
					"key": "openingDate",
					"label": "As of date",
					"kind": "date"
				},
				{
					"key": "balance",
					"label": "Balance",
					"kind": "number",
					"default": 0,
					"showInTable": true,
					"helper": "Kept by the books: positive = they owe you"
				},
				{
					"key": "lastTradingDate",
					"label": "Last trading date",
					"kind": "date",
					"showInTable": true
				},
				{
					"key": "documents",
					"label": "Documents",
					"kind": "files"
				},
				{
					"key": "isActive",
					"label": "Active",
					"kind": "boolean",
					"default": true,
					"showInTable": true
				}
			],
			"table": [
				"name",
				"kind",
				"contactPerson",
				"contactNo",
				"traderCode",
				"lastTradingDate",
				"balance",
				"isActive"
			],
			"filters": [
				"kind",
				"isActive",
				"customerGroup"
			]
		},
		{
			"action": "create",
			"name": "ProductionTemplate",
			"title": "Production Templates",
			"route": "production-templates",
			"buttonTitle": "New template",
			"displayField": "name",
			"rationale": "A recipe: raw items consumed to make finished items.",
			"fields": [
				{
					"key": "name",
					"label": "Name",
					"kind": "text",
					"required": true,
					"searchable": true,
					"showInTable": true
				},
				{
					"key": "rawItems",
					"label": "Raw items",
					"kind": "sectionlist",
					"addLabel": "Add raw item",
					"fields": [
						{
							"key": "product",
							"label": "Product id",
							"kind": "text"
						},
						{
							"key": "productName",
							"label": "Item",
							"kind": "text",
							"required": true
						},
						{
							"key": "quantity",
							"label": "Quantity",
							"kind": "number",
							"required": true
						}
					]
				},
				{
					"key": "finishedItems",
					"label": "Finished items",
					"kind": "sectionlist",
					"addLabel": "Add finished item",
					"fields": [
						{
							"key": "product",
							"label": "Product id",
							"kind": "text"
						},
						{
							"key": "productName",
							"label": "Item",
							"kind": "text",
							"required": true
						},
						{
							"key": "quantity",
							"label": "Quantity",
							"kind": "number",
							"required": true
						}
					]
				},
				{
					"key": "note",
					"label": "Note",
					"kind": "textarea"
				}
			]
		},
		{
			"action": "create",
			"name": "Sale",
			"title": "Sales",
			"route": "sales",
			"buttonTitle": "Make sale",
			"displayField": "code",
			"code": {
				"enabled": true,
				"prefix": "S",
				"padding": 5
			},
			"rationale": "Make Sale.",
			"fields": [
				{
					"key": "date",
					"label": "Date",
					"kind": "date",
					"required": true,
					"default": "now",
					"showInTable": true,
					"index": true
				},
				{
					"key": "customer",
					"label": "Customer",
					"kind": "reference",
					"ref": "Trader",
					"required": true,
					"showInTable": true
				},
				{
					"key": "contactNo",
					"label": "Contact no",
					"kind": "text",
					"showInTable": true,
					"fillFrom": {
						"from": "customer",
						"formula": "contactNo"
					}
				},
				{
					"key": "warehouse",
					"label": "Warehouse",
					"kind": "reference",
					"ref": "Warehouse"
				},
				{
					"key": "salesRepresentative",
					"label": "Sales representative",
					"kind": "reference",
					"ref": "SalesRepresentative"
				},
				{
					"key": "deliverLater",
					"label": "Deliver products later?",
					"kind": "boolean",
					"default": false
				},
				{
					"key": "deliveryDate",
					"label": "Delivery date",
					"kind": "date",
					"showInTable": true
				},
				{
					"key": "items",
					"label": "Products",
					"kind": "sectionlist",
					"addLabel": "Add product",
					"fields": [
						{
							"key": "product",
							"label": "Product id",
							"kind": "text"
						},
						{
							"key": "productName",
							"label": "Product",
							"kind": "text",
							"required": true
						},
						{
							"key": "quantity",
							"label": "Quantity",
							"kind": "number",
							"required": true
						},
						{
							"key": "price",
							"label": "Price",
							"kind": "number",
							"required": true
						},
						{
							"key": "discount",
							"label": "Discount",
							"kind": "number"
						},
						{
							"key": "taxRate",
							"label": "Tax %",
							"kind": "number"
						},
						{
							"key": "unitCost",
							"label": "Unit cost",
							"kind": "number"
						},
						{
							"key": "total",
							"label": "Sub total",
							"kind": "formula",
							"formula": "quantity * price - discount"
						}
					]
				},
				{
					"key": "subtotal",
					"label": "Grand total",
					"kind": "formula",
					"formula": "sum(items.total)"
				},
				{
					"key": "taxAmount",
					"label": "Tax amount",
					"kind": "number",
					"default": 0
				},
				{
					"key": "discountType",
					"label": "Discount type",
					"kind": "select",
					"default": "amount",
					"options": [
						{
							"value": "amount",
							"label": "Amount"
						},
						{
							"value": "percent",
							"label": "%"
						}
					]
				},
				{
					"key": "discount",
					"label": "Discount",
					"kind": "number",
					"default": 0
				},
				{
					"key": "roundUpDiscount",
					"label": "Round-up discount",
					"kind": "number",
					"default": 0
				},
				{
					"key": "shippingCharge",
					"label": "Shipping charge",
					"kind": "number",
					"default": 0
				},
				{
					"key": "netReceivable",
					"label": "Net receivable",
					"kind": "formula",
					"showInTable": true,
					"formula": "round(subtotal + taxAmount - if(discountType = \"percent\", subtotal * discount / 100, discount) - roundUpDiscount + shippingCharge, 2)"
				},
				{
					"key": "payments",
					"label": "Payments",
					"kind": "sectionlist",
					"addLabel": "Add payment",
					"fields": [
						{
							"key": "paymentMethod",
							"label": "Payment method id",
							"kind": "text"
						},
						{
							"key": "methodName",
							"label": "Deposit to",
							"kind": "text"
						},
						{
							"key": "paymentType",
							"label": "Type",
							"kind": "select",
							"options": [
								{
									"value": "cash",
									"label": "Cash"
								},
								{
									"value": "bank",
									"label": "Bank"
								},
								{
									"value": "mobile",
									"label": "Mobile Banking"
								}
							]
						},
						{
							"key": "amount",
							"label": "Amount",
							"kind": "number",
							"required": true
						}
					]
				},
				{
					"key": "paidAmount",
					"label": "Total amount paid",
					"kind": "formula",
					"formula": "sum(payments.amount)"
				},
				{
					"key": "receivedLater",
					"label": "Received later",
					"kind": "number",
					"default": 0,
					"helper": "Payments and returns against this slip, kept by the books"
				},
				{
					"key": "due",
					"label": "Due amount",
					"kind": "formula",
					"showInTable": true,
					"formula": "round(netReceivable - paidAmount - receivedLater, 2)"
				},
				{
					"key": "status",
					"label": "Status",
					"kind": "select",
					"default": "unpaid",
					"showInTable": true,
					"options": [
						{
							"value": "paid",
							"label": "Paid"
						},
						{
							"value": "unpaid",
							"label": "Unpaid"
						},
						{
							"value": "partial",
							"label": "Partial paid"
						}
					]
				},
				{
					"key": "costOfGoods",
					"label": "Cost of goods",
					"kind": "number",
					"default": 0,
					"helper": "Kept by the books"
				},
				{
					"key": "expectedPaymentDate",
					"label": "Expected payment date",
					"kind": "date"
				},
				{
					"key": "note",
					"label": "Note",
					"kind": "textarea"
				},
				{
					"key": "pictures",
					"label": "Pictures",
					"kind": "images"
				}
			],
			"table": [
				"date",
				"code",
				"customer",
				"contactNo",
				"netReceivable",
				"due",
				"deliveryDate",
				"status"
			],
			"filters": [
				"status",
				"date",
				"customer",
				"warehouse"
			]
		},
		{
			"action": "create",
			"name": "Quotation",
			"title": "Quotations",
			"route": "quotations",
			"buttonTitle": "Make quotation",
			"displayField": "code",
			"code": {
				"enabled": true,
				"prefix": "Q",
				"padding": 5
			},
			"rationale": "Quotation.",
			"fields": [
				{
					"key": "date",
					"label": "Date",
					"kind": "date",
					"required": true,
					"default": "now",
					"showInTable": true
				},
				{
					"key": "customer",
					"label": "Customer",
					"kind": "reference",
					"ref": "Trader",
					"required": true,
					"showInTable": true
				},
				{
					"key": "warehouse",
					"label": "Warehouse",
					"kind": "reference",
					"ref": "Warehouse"
				},
				{
					"key": "items",
					"label": "Products",
					"kind": "sectionlist",
					"addLabel": "Add product",
					"fields": [
						{
							"key": "product",
							"label": "Product id",
							"kind": "text"
						},
						{
							"key": "productName",
							"label": "Product",
							"kind": "text",
							"required": true
						},
						{
							"key": "quantity",
							"label": "Quantity",
							"kind": "number",
							"required": true
						},
						{
							"key": "price",
							"label": "Price",
							"kind": "number",
							"required": true
						},
						{
							"key": "discount",
							"label": "Discount",
							"kind": "number"
						},
						{
							"key": "warranty",
							"label": "Warranty",
							"kind": "text"
						},
						{
							"key": "total",
							"label": "Sub total",
							"kind": "formula",
							"formula": "quantity * price - discount"
						}
					]
				},
				{
					"key": "subtotal",
					"label": "Grand total",
					"kind": "formula",
					"formula": "sum(items.total)"
				},
				{
					"key": "taxAmount",
					"label": "Tax amount",
					"kind": "number",
					"default": 0
				},
				{
					"key": "discountType",
					"label": "Discount type",
					"kind": "select",
					"default": "amount",
					"options": [
						{
							"value": "amount",
							"label": "Amount"
						},
						{
							"value": "percent",
							"label": "%"
						}
					]
				},
				{
					"key": "discount",
					"label": "Discount",
					"kind": "number",
					"default": 0
				},
				{
					"key": "total",
					"label": "Total",
					"kind": "formula",
					"showInTable": true,
					"formula": "round(subtotal + taxAmount - if(discountType = \"percent\", subtotal * discount / 100, discount), 2)"
				},
				{
					"key": "validUntil",
					"label": "Valid until",
					"kind": "date"
				},
				{
					"key": "status",
					"label": "Status",
					"kind": "select",
					"default": "open",
					"showInTable": true,
					"options": [
						{
							"value": "open",
							"label": "Open"
						},
						{
							"value": "converted",
							"label": "Converted"
						},
						{
							"value": "expired",
							"label": "Expired"
						}
					]
				},
				{
					"key": "sale",
					"label": "Converted to sale",
					"kind": "reference",
					"ref": "Sale"
				},
				{
					"key": "note",
					"label": "Note",
					"kind": "textarea"
				}
			],
			"table": [
				"date",
				"code",
				"customer",
				"total",
				"status"
			],
			"filters": [
				"status",
				"date",
				"customer"
			]
		},
		{
			"action": "create",
			"name": "SaleReturn",
			"title": "Sale Returns",
			"route": "sale-returns",
			"buttonTitle": "Return sold product",
			"displayField": "code",
			"code": {
				"enabled": true,
				"prefix": "SR",
				"padding": 5
			},
			"rationale": "Return sold product.",
			"fields": [
				{
					"key": "date",
					"label": "Date",
					"kind": "date",
					"required": true,
					"default": "now",
					"showInTable": true
				},
				{
					"key": "sale",
					"label": "Sales slip",
					"kind": "reference",
					"ref": "Sale",
					"required": true,
					"showInTable": true
				},
				{
					"key": "customer",
					"label": "Customer",
					"kind": "reference",
					"ref": "Trader",
					"showInTable": true,
					"fillFrom": {
						"from": "sale",
						"formula": "customer",
						"readonly": true
					}
				},
				{
					"key": "warehouse",
					"label": "Warehouse",
					"kind": "reference",
					"ref": "Warehouse"
				},
				{
					"key": "items",
					"label": "Returned products",
					"kind": "sectionlist",
					"addLabel": "Add product",
					"fields": [
						{
							"key": "product",
							"label": "Product id",
							"kind": "text"
						},
						{
							"key": "productName",
							"label": "Product",
							"kind": "text",
							"required": true
						},
						{
							"key": "quantity",
							"label": "Quantity",
							"kind": "number",
							"required": true
						},
						{
							"key": "price",
							"label": "Price",
							"kind": "number",
							"required": true
						},
						{
							"key": "total",
							"label": "Sub total",
							"kind": "formula",
							"formula": "quantity * price"
						}
					]
				},
				{
					"key": "total",
					"label": "Total",
					"kind": "formula",
					"showInTable": true,
					"formula": "sum(items.total)"
				},
				{
					"key": "refundType",
					"label": "Refund",
					"kind": "select",
					"default": "reduce_due",
					"options": [
						{
							"value": "reduce_due",
							"label": "Reduce due"
						},
						{
							"value": "cash_back",
							"label": "Cash back"
						}
					]
				},
				{
					"key": "refundAmount",
					"label": "Cash back amount",
					"kind": "number",
					"default": 0
				},
				{
					"key": "refundAccount",
					"label": "Pay from",
					"kind": "reference",
					"ref": "Account"
				},
				{
					"key": "note",
					"label": "Note",
					"kind": "textarea"
				}
			],
			"table": [
				"date",
				"code",
				"sale",
				"customer",
				"total"
			],
			"filters": [
				"date",
				"customer"
			]
		},
		{
			"action": "create",
			"name": "ProductReturn",
			"title": "Customer Product Returns",
			"route": "product-returns",
			"buttonTitle": "Return customer product",
			"displayField": "code",
			"code": {
				"enabled": true,
				"prefix": "CR",
				"padding": 5
			},
			"rationale": "Return without a slip.",
			"fields": [
				{
					"key": "date",
					"label": "Date",
					"kind": "date",
					"required": true,
					"default": "now",
					"showInTable": true
				},
				{
					"key": "customer",
					"label": "Customer",
					"kind": "reference",
					"ref": "Trader",
					"required": true,
					"showInTable": true
				},
				{
					"key": "warehouse",
					"label": "Warehouse",
					"kind": "reference",
					"ref": "Warehouse"
				},
				{
					"key": "items",
					"label": "Returned products",
					"kind": "sectionlist",
					"addLabel": "Add product",
					"fields": [
						{
							"key": "product",
							"label": "Product id",
							"kind": "text"
						},
						{
							"key": "productName",
							"label": "Product",
							"kind": "text",
							"required": true
						},
						{
							"key": "quantity",
							"label": "Quantity",
							"kind": "number",
							"required": true
						},
						{
							"key": "price",
							"label": "Price",
							"kind": "number",
							"required": true
						},
						{
							"key": "total",
							"label": "Sub total",
							"kind": "formula",
							"formula": "quantity * price"
						}
					]
				},
				{
					"key": "total",
					"label": "Total",
					"kind": "formula",
					"showInTable": true,
					"formula": "sum(items.total)"
				},
				{
					"key": "refundType",
					"label": "Refund",
					"kind": "select",
					"default": "reduce_due",
					"options": [
						{
							"value": "reduce_due",
							"label": "Reduce due"
						},
						{
							"value": "cash_back",
							"label": "Cash back"
						}
					]
				},
				{
					"key": "refundAmount",
					"label": "Cash back amount",
					"kind": "number",
					"default": 0
				},
				{
					"key": "refundAccount",
					"label": "Pay from",
					"kind": "reference",
					"ref": "Account"
				},
				{
					"key": "note",
					"label": "Note",
					"kind": "textarea"
				}
			],
			"table": [
				"date",
				"code",
				"customer",
				"total"
			],
			"filters": [
				"date",
				"customer"
			]
		},
		{
			"action": "create",
			"name": "Exchange",
			"title": "Exchanges",
			"route": "exchanges",
			"buttonTitle": "Exchange sold product",
			"displayField": "code",
			"code": {
				"enabled": true,
				"prefix": "EX",
				"padding": 5
			},
			"rationale": "Exchange sold product.",
			"fields": [
				{
					"key": "date",
					"label": "Date",
					"kind": "date",
					"required": true,
					"default": "now",
					"showInTable": true
				},
				{
					"key": "sale",
					"label": "Sales slip",
					"kind": "reference",
					"ref": "Sale",
					"required": true,
					"showInTable": true
				},
				{
					"key": "customer",
					"label": "Customer",
					"kind": "reference",
					"ref": "Trader",
					"showInTable": true,
					"fillFrom": {
						"from": "sale",
						"formula": "customer",
						"readonly": true
					}
				},
				{
					"key": "warehouse",
					"label": "Warehouse",
					"kind": "reference",
					"ref": "Warehouse"
				},
				{
					"key": "returnItems",
					"label": "Returned products",
					"kind": "sectionlist",
					"addLabel": "Add returned product",
					"fields": [
						{
							"key": "product",
							"label": "Product id",
							"kind": "text"
						},
						{
							"key": "productName",
							"label": "Product",
							"kind": "text",
							"required": true
						},
						{
							"key": "quantity",
							"label": "Quantity",
							"kind": "number",
							"required": true
						},
						{
							"key": "price",
							"label": "Price",
							"kind": "number",
							"required": true
						},
						{
							"key": "total",
							"label": "Sub total",
							"kind": "formula",
							"formula": "quantity * price"
						}
					]
				},
				{
					"key": "newItems",
					"label": "New products",
					"kind": "sectionlist",
					"addLabel": "Add new product",
					"fields": [
						{
							"key": "product",
							"label": "Product id",
							"kind": "text"
						},
						{
							"key": "productName",
							"label": "Product",
							"kind": "text",
							"required": true
						},
						{
							"key": "quantity",
							"label": "Quantity",
							"kind": "number",
							"required": true
						},
						{
							"key": "price",
							"label": "Price",
							"kind": "number",
							"required": true
						},
						{
							"key": "total",
							"label": "Sub total",
							"kind": "formula",
							"formula": "quantity * price"
						}
					]
				},
				{
					"key": "returnTotal",
					"label": "Returned total",
					"kind": "formula",
					"formula": "sum(returnItems.total)"
				},
				{
					"key": "newTotal",
					"label": "New total",
					"kind": "formula",
					"formula": "sum(newItems.total)"
				},
				{
					"key": "difference",
					"label": "Difference",
					"kind": "formula",
					"showInTable": true,
					"formula": "newTotal - returnTotal"
				},
				{
					"key": "paidAmount",
					"label": "Paid / refunded",
					"kind": "number",
					"default": 0
				},
				{
					"key": "account",
					"label": "Account",
					"kind": "reference",
					"ref": "Account"
				},
				{
					"key": "note",
					"label": "Note",
					"kind": "textarea"
				}
			],
			"table": [
				"date",
				"code",
				"sale",
				"customer",
				"difference"
			],
			"filters": [
				"date",
				"customer"
			]
		},
		{
			"action": "create",
			"name": "PurchaseOrder",
			"title": "Purchase Orders",
			"route": "purchase-orders",
			"buttonTitle": "Make purchase order",
			"displayField": "code",
			"code": {
				"enabled": true,
				"prefix": "PO",
				"padding": 5
			},
			"rationale": "Purchase order.",
			"fields": [
				{
					"key": "date",
					"label": "Date",
					"kind": "date",
					"required": true,
					"default": "now",
					"showInTable": true
				},
				{
					"key": "supplier",
					"label": "Supplier",
					"kind": "reference",
					"ref": "Trader",
					"required": true,
					"showInTable": true
				},
				{
					"key": "warehouse",
					"label": "Warehouse",
					"kind": "reference",
					"ref": "Warehouse"
				},
				{
					"key": "items",
					"label": "Products",
					"kind": "sectionlist",
					"addLabel": "Add product",
					"fields": [
						{
							"key": "product",
							"label": "Product id",
							"kind": "text"
						},
						{
							"key": "productName",
							"label": "Product",
							"kind": "text",
							"required": true
						},
						{
							"key": "quantity",
							"label": "Quantity",
							"kind": "number",
							"required": true
						},
						{
							"key": "price",
							"label": "Price",
							"kind": "number",
							"required": true
						},
						{
							"key": "total",
							"label": "Sub total",
							"kind": "formula",
							"formula": "quantity * price"
						}
					]
				},
				{
					"key": "subtotal",
					"label": "Grand total",
					"kind": "formula",
					"formula": "sum(items.total)"
				},
				{
					"key": "taxAmount",
					"label": "Tax amount",
					"kind": "number",
					"default": 0
				},
				{
					"key": "discount",
					"label": "Discount",
					"kind": "number",
					"default": 0
				},
				{
					"key": "total",
					"label": "Total",
					"kind": "formula",
					"showInTable": true,
					"formula": "subtotal + taxAmount - discount"
				},
				{
					"key": "status",
					"label": "Status",
					"kind": "select",
					"default": "open",
					"showInTable": true,
					"options": [
						{
							"value": "open",
							"label": "Open"
						},
						{
							"value": "converted",
							"label": "Converted"
						},
						{
							"value": "cancelled",
							"label": "Cancelled"
						}
					]
				},
				{
					"key": "note",
					"label": "Note",
					"kind": "textarea"
				}
			],
			"table": [
				"date",
				"code",
				"supplier",
				"total",
				"status"
			],
			"filters": [
				"status",
				"date",
				"supplier"
			]
		},
		{
			"action": "create",
			"name": "Purchase",
			"title": "Purchases",
			"route": "purchases",
			"buttonTitle": "Make purchase",
			"displayField": "code",
			"code": {
				"enabled": true,
				"prefix": "P",
				"padding": 5
			},
			"rationale": "Make Purchase.",
			"fields": [
				{
					"key": "date",
					"label": "Date",
					"kind": "date",
					"required": true,
					"default": "now",
					"showInTable": true,
					"index": true
				},
				{
					"key": "supplier",
					"label": "Supplier",
					"kind": "reference",
					"ref": "Trader",
					"required": true,
					"showInTable": true
				},
				{
					"key": "supplierInvoiceNo",
					"label": "Supplier invoice no",
					"kind": "text",
					"searchable": true,
					"showInTable": true
				},
				{
					"key": "warehouse",
					"label": "Warehouse",
					"kind": "reference",
					"ref": "Warehouse"
				},
				{
					"key": "purchaseOrder",
					"label": "From purchase order",
					"kind": "reference",
					"ref": "PurchaseOrder"
				},
				{
					"key": "items",
					"label": "Products",
					"kind": "sectionlist",
					"addLabel": "Add product",
					"fields": [
						{
							"key": "product",
							"label": "Product id",
							"kind": "text"
						},
						{
							"key": "productName",
							"label": "Product",
							"kind": "text",
							"required": true
						},
						{
							"key": "quantity",
							"label": "Quantity",
							"kind": "number",
							"required": true
						},
						{
							"key": "price",
							"label": "Price",
							"kind": "number",
							"required": true
						},
						{
							"key": "discount",
							"label": "Discount",
							"kind": "number"
						},
						{
							"key": "taxRate",
							"label": "Tax %",
							"kind": "number"
						},
						{
							"key": "sellingPrice",
							"label": "Selling price",
							"kind": "number"
						},
						{
							"key": "total",
							"label": "Sub total",
							"kind": "formula",
							"formula": "quantity * price - discount"
						}
					]
				},
				{
					"key": "subtotal",
					"label": "Grand total",
					"kind": "formula",
					"formula": "sum(items.total)"
				},
				{
					"key": "taxAmount",
					"label": "Tax amount",
					"kind": "number",
					"default": 0
				},
				{
					"key": "discount",
					"label": "Discount",
					"kind": "number",
					"default": 0
				},
				{
					"key": "netPayable",
					"label": "Net payable",
					"kind": "formula",
					"showInTable": true,
					"formula": "round(subtotal + taxAmount - discount, 2)"
				},
				{
					"key": "payments",
					"label": "Payments",
					"kind": "sectionlist",
					"addLabel": "Add payment",
					"fields": [
						{
							"key": "account",
							"label": "Account id",
							"kind": "text"
						},
						{
							"key": "accountName",
							"label": "Pay from",
							"kind": "text"
						},
						{
							"key": "amount",
							"label": "Amount",
							"kind": "number",
							"required": true
						}
					]
				},
				{
					"key": "paidAmount",
					"label": "Paid amount",
					"kind": "formula",
					"formula": "sum(payments.amount)"
				},
				{
					"key": "paidLater",
					"label": "Paid later",
					"kind": "number",
					"default": 0,
					"helper": "Payments and returns against this slip, kept by the books"
				},
				{
					"key": "due",
					"label": "Due amount",
					"kind": "formula",
					"showInTable": true,
					"formula": "round(netPayable - paidAmount - paidLater, 2)"
				},
				{
					"key": "status",
					"label": "Status",
					"kind": "select",
					"default": "unpaid",
					"showInTable": true,
					"options": [
						{
							"value": "paid",
							"label": "Paid"
						},
						{
							"value": "unpaid",
							"label": "Unpaid"
						},
						{
							"value": "partial",
							"label": "Partial paid"
						}
					]
				},
				{
					"key": "updateBuyingPrice",
					"label": "Update buying price",
					"kind": "boolean",
					"default": true
				},
				{
					"key": "note",
					"label": "Note",
					"kind": "textarea"
				},
				{
					"key": "attachments",
					"label": "Attachments",
					"kind": "files"
				}
			],
			"table": [
				"date",
				"code",
				"supplier",
				"supplierInvoiceNo",
				"netPayable",
				"due",
				"status"
			],
			"filters": [
				"status",
				"date",
				"supplier",
				"warehouse"
			]
		},
		{
			"action": "create",
			"name": "PurchaseReturn",
			"title": "Purchase Returns",
			"route": "purchase-returns",
			"buttonTitle": "Purchase return",
			"displayField": "code",
			"code": {
				"enabled": true,
				"prefix": "PR",
				"padding": 5
			},
			"rationale": "Purchase return.",
			"fields": [
				{
					"key": "date",
					"label": "Date",
					"kind": "date",
					"required": true,
					"default": "now",
					"showInTable": true
				},
				{
					"key": "purchase",
					"label": "Purchase slip",
					"kind": "reference",
					"ref": "Purchase",
					"required": true,
					"showInTable": true
				},
				{
					"key": "supplier",
					"label": "Supplier",
					"kind": "reference",
					"ref": "Trader",
					"showInTable": true,
					"fillFrom": {
						"from": "purchase",
						"formula": "supplier",
						"readonly": true
					}
				},
				{
					"key": "warehouse",
					"label": "Warehouse",
					"kind": "reference",
					"ref": "Warehouse"
				},
				{
					"key": "items",
					"label": "Returned products",
					"kind": "sectionlist",
					"addLabel": "Add product",
					"fields": [
						{
							"key": "product",
							"label": "Product id",
							"kind": "text"
						},
						{
							"key": "productName",
							"label": "Product",
							"kind": "text",
							"required": true
						},
						{
							"key": "quantity",
							"label": "Quantity",
							"kind": "number",
							"required": true
						},
						{
							"key": "price",
							"label": "Price",
							"kind": "number",
							"required": true
						},
						{
							"key": "total",
							"label": "Sub total",
							"kind": "formula",
							"formula": "quantity * price"
						}
					]
				},
				{
					"key": "total",
					"label": "Total",
					"kind": "formula",
					"showInTable": true,
					"formula": "sum(items.total)"
				},
				{
					"key": "refundType",
					"label": "Refund",
					"kind": "select",
					"default": "reduce_due",
					"options": [
						{
							"value": "reduce_due",
							"label": "Reduce due"
						},
						{
							"value": "cash_back",
							"label": "Cash back"
						}
					]
				},
				{
					"key": "refundAmount",
					"label": "Cash back amount",
					"kind": "number",
					"default": 0
				},
				{
					"key": "refundAccount",
					"label": "Deposit to",
					"kind": "reference",
					"ref": "Account"
				},
				{
					"key": "note",
					"label": "Note",
					"kind": "textarea"
				}
			],
			"table": [
				"date",
				"code",
				"purchase",
				"supplier",
				"total"
			],
			"filters": [
				"date",
				"supplier"
			]
		},
		{
			"action": "create",
			"name": "Payment",
			"title": "Payments",
			"route": "trader-payments",
			"buttonTitle": "New payment",
			"displayField": "code",
			"code": {
				"enabled": true,
				"prefix": "MR",
				"padding": 5
			},
			"rationale": "Customer and supplier payments.",
			"fields": [
				{
					"key": "date",
					"label": "Date",
					"kind": "date",
					"required": true,
					"default": "now",
					"showInTable": true,
					"index": true
				},
				{
					"key": "direction",
					"label": "Direction",
					"kind": "select",
					"required": true,
					"default": "received",
					"showInTable": true,
					"options": [
						{
							"value": "received",
							"label": "Received from customer"
						},
						{
							"value": "given",
							"label": "Paid to supplier"
						}
					]
				},
				{
					"key": "trader",
					"label": "Customer / supplier",
					"kind": "reference",
					"ref": "Trader",
					"required": true,
					"showInTable": true
				},
				{
					"key": "account",
					"label": "Account",
					"kind": "reference",
					"ref": "Account",
					"required": true,
					"showInTable": true
				},
				{
					"key": "paymentMethod",
					"label": "Method",
					"kind": "reference",
					"ref": "PaymentMethod"
				},
				{
					"key": "amount",
					"label": "Amount",
					"kind": "number",
					"required": true,
					"min": 0,
					"showInTable": true
				},
				{
					"key": "against",
					"label": "Against",
					"kind": "select",
					"default": "slip",
					"options": [
						{
							"value": "slip",
							"label": "A slip"
						},
						{
							"value": "on_account",
							"label": "On account / advance"
						}
					]
				},
				{
					"key": "sale",
					"label": "Sales slip",
					"kind": "reference",
					"ref": "Sale"
				},
				{
					"key": "purchase",
					"label": "Purchase slip",
					"kind": "reference",
					"ref": "Purchase"
				},
				{
					"key": "chequeNo",
					"label": "Cheque no",
					"kind": "text"
				},
				{
					"key": "chequeDate",
					"label": "Cheque date",
					"kind": "date"
				},
				{
					"key": "note",
					"label": "Note",
					"kind": "textarea",
					"showInTable": true
				}
			],
			"table": [
				"date",
				"code",
				"direction",
				"trader",
				"account",
				"amount",
				"note"
			],
			"filters": [
				"direction",
				"date",
				"trader",
				"account"
			]
		},
		{
			"action": "create",
			"name": "Expense",
			"title": "Expenses",
			"route": "expenses",
			"buttonTitle": "Pay expense",
			"displayField": "code",
			"code": {
				"enabled": true,
				"prefix": "E",
				"padding": 5
			},
			"rationale": "Pay Expense.",
			"fields": [
				{
					"key": "date",
					"label": "Date",
					"kind": "date",
					"required": true,
					"default": "now",
					"showInTable": true,
					"index": true
				},
				{
					"key": "payFrom",
					"label": "Pay from",
					"kind": "reference",
					"ref": "Account",
					"required": true,
					"showInTable": true
				},
				{
					"key": "items",
					"label": "Expenses",
					"kind": "sectionlist",
					"addLabel": "Add expense",
					"fields": [
						{
							"key": "account",
							"label": "Expense account id",
							"kind": "text"
						},
						{
							"key": "accountName",
							"label": "Expense",
							"kind": "text",
							"required": true
						},
						{
							"key": "amount",
							"label": "Amount",
							"kind": "number",
							"required": true
						},
						{
							"key": "note",
							"label": "Note",
							"kind": "text"
						}
					]
				},
				{
					"key": "total",
					"label": "Amount",
					"kind": "formula",
					"showInTable": true,
					"formula": "sum(items.amount)"
				},
				{
					"key": "costCentre",
					"label": "Cost centre",
					"kind": "reference",
					"ref": "CostCentre"
				},
				{
					"key": "note",
					"label": "Note",
					"kind": "textarea",
					"showInTable": true
				},
				{
					"key": "attachments",
					"label": "Attachments",
					"kind": "files"
				}
			],
			"table": [
				"date",
				"code",
				"payFrom",
				"total",
				"note"
			],
			"filters": [
				"date",
				"payFrom",
				"costCentre"
			]
		},
		{
			"action": "create",
			"name": "Income",
			"title": "Incomes",
			"route": "incomes",
			"buttonTitle": "New income",
			"displayField": "code",
			"code": {
				"enabled": true,
				"prefix": "I",
				"padding": 5
			},
			"rationale": "Incomes.",
			"fields": [
				{
					"key": "date",
					"label": "Date",
					"kind": "date",
					"required": true,
					"default": "now",
					"showInTable": true
				},
				{
					"key": "depositTo",
					"label": "Deposit to",
					"kind": "reference",
					"ref": "Account",
					"required": true,
					"showInTable": true
				},
				{
					"key": "items",
					"label": "Incomes",
					"kind": "sectionlist",
					"addLabel": "Add income",
					"fields": [
						{
							"key": "account",
							"label": "Income account id",
							"kind": "text"
						},
						{
							"key": "accountName",
							"label": "Income",
							"kind": "text",
							"required": true
						},
						{
							"key": "amount",
							"label": "Amount",
							"kind": "number",
							"required": true
						},
						{
							"key": "note",
							"label": "Note",
							"kind": "text"
						}
					]
				},
				{
					"key": "total",
					"label": "Amount",
					"kind": "formula",
					"showInTable": true,
					"formula": "sum(items.amount)"
				},
				{
					"key": "note",
					"label": "Note",
					"kind": "textarea",
					"showInTable": true
				}
			],
			"table": [
				"date",
				"code",
				"depositTo",
				"total",
				"note"
			],
			"filters": [
				"date",
				"depositTo"
			]
		},
		{
			"action": "create",
			"name": "Transfer",
			"title": "Withdraw/Deposit/Transfer/Cash Out",
			"route": "transfers",
			"buttonTitle": "New transfer",
			"displayField": "code",
			"code": {
				"enabled": true,
				"prefix": "T",
				"padding": 5
			},
			"rationale": "Money between own accounts.",
			"fields": [
				{
					"key": "date",
					"label": "Date",
					"kind": "date",
					"required": true,
					"default": "now",
					"showInTable": true
				},
				{
					"key": "type",
					"label": "Type",
					"kind": "select",
					"required": true,
					"default": "transfer",
					"showInTable": true,
					"options": [
						{
							"value": "withdraw",
							"label": "Withdraw"
						},
						{
							"value": "deposit",
							"label": "Deposit"
						},
						{
							"value": "transfer",
							"label": "Transfer"
						},
						{
							"value": "cash_out",
							"label": "Cash out"
						}
					]
				},
				{
					"key": "fromAccount",
					"label": "From account",
					"kind": "reference",
					"ref": "Account",
					"required": true,
					"showInTable": true
				},
				{
					"key": "toAccount",
					"label": "To account",
					"kind": "reference",
					"ref": "Account",
					"required": true,
					"showInTable": true
				},
				{
					"key": "amount",
					"label": "Amount",
					"kind": "number",
					"required": true,
					"min": 0,
					"showInTable": true
				},
				{
					"key": "charge",
					"label": "Charge",
					"kind": "number",
					"default": 0
				},
				{
					"key": "note",
					"label": "Note",
					"kind": "textarea",
					"showInTable": true
				}
			],
			"table": [
				"date",
				"code",
				"type",
				"fromAccount",
				"toAccount",
				"amount",
				"note"
			],
			"filters": [
				"type",
				"date",
				"fromAccount",
				"toAccount"
			]
		},
		{
			"action": "create",
			"name": "Voucher",
			"title": "Vouchers",
			"route": "vouchers",
			"buttonTitle": "New voucher",
			"displayField": "code",
			"code": {
				"enabled": true,
				"prefix": "V",
				"padding": 5
			},
			"rationale": "General journal.",
			"fields": [
				{
					"key": "date",
					"label": "Date",
					"kind": "date",
					"required": true,
					"default": "now",
					"showInTable": true
				},
				{
					"key": "voucherType",
					"label": "Voucher type",
					"kind": "select",
					"required": true,
					"default": "journal",
					"showInTable": true,
					"options": [
						{
							"value": "journal",
							"label": "Journal"
						},
						{
							"value": "payment",
							"label": "Payment"
						},
						{
							"value": "receipt",
							"label": "Receipt"
						},
						{
							"value": "contra",
							"label": "Contra"
						}
					]
				},
				{
					"key": "lines",
					"label": "Lines",
					"kind": "sectionlist",
					"addLabel": "Add line",
					"fields": [
						{
							"key": "account",
							"label": "Account id",
							"kind": "text"
						},
						{
							"key": "accountName",
							"label": "Account",
							"kind": "text",
							"required": true
						},
						{
							"key": "debit",
							"label": "Debit",
							"kind": "number"
						},
						{
							"key": "credit",
							"label": "Credit",
							"kind": "number"
						},
						{
							"key": "note",
							"label": "Note",
							"kind": "text"
						}
					]
				},
				{
					"key": "totalDebit",
					"label": "Total debit",
					"kind": "formula",
					"showInTable": true,
					"formula": "sum(lines.debit)"
				},
				{
					"key": "totalCredit",
					"label": "Total credit",
					"kind": "formula",
					"formula": "sum(lines.credit)"
				},
				{
					"key": "note",
					"label": "Note",
					"kind": "textarea",
					"showInTable": true
				}
			],
			"table": [
				"date",
				"code",
				"voucherType",
				"totalDebit",
				"note"
			],
			"filters": [
				"voucherType",
				"date"
			]
		},
		{
			"action": "create",
			"name": "Cheque",
			"title": "Clearing Cheques",
			"route": "cheques",
			"buttonTitle": "New cheque",
			"displayField": "chequeNo",
			"rationale": "Cheque clearing.",
			"fields": [
				{
					"key": "trader",
					"label": "Customer / supplier",
					"kind": "reference",
					"ref": "Trader",
					"required": true,
					"showInTable": true
				},
				{
					"key": "direction",
					"label": "Type",
					"kind": "select",
					"required": true,
					"default": "received",
					"showInTable": true,
					"options": [
						{
							"value": "received",
							"label": "Received"
						},
						{
							"value": "issued",
							"label": "Issued"
						}
					]
				},
				{
					"key": "chequeNo",
					"label": "Cheque no",
					"kind": "text",
					"required": true,
					"searchable": true,
					"showInTable": true
				},
				{
					"key": "bankName",
					"label": "Bank name",
					"kind": "text"
				},
				{
					"key": "issueDate",
					"label": "Cheque issue date",
					"kind": "date",
					"showInTable": true
				},
				{
					"key": "encashDate",
					"label": "Encash date",
					"kind": "date",
					"showInTable": true
				},
				{
					"key": "amount",
					"label": "Amount",
					"kind": "number",
					"required": true,
					"showInTable": true
				},
				{
					"key": "status",
					"label": "Status",
					"kind": "select",
					"default": "open",
					"showInTable": true,
					"options": [
						{
							"value": "open",
							"label": "Open"
						},
						{
							"value": "cleared",
							"label": "Cleared"
						},
						{
							"value": "bounced",
							"label": "Bounced"
						},
						{
							"value": "cancelled",
							"label": "Cancelled"
						}
					]
				},
				{
					"key": "bankAccount",
					"label": "Clear to account",
					"kind": "reference",
					"ref": "Account"
				},
				{
					"key": "payment",
					"label": "Payment",
					"kind": "reference",
					"ref": "Payment"
				},
				{
					"key": "note",
					"label": "Note",
					"kind": "textarea"
				}
			],
			"table": [
				"trader",
				"direction",
				"issueDate",
				"encashDate",
				"chequeNo",
				"status",
				"amount"
			],
			"filters": [
				"status",
				"direction",
				"trader"
			]
		},
		{
			"action": "create",
			"name": "StockAdjustment",
			"title": "Stock Adjustments",
			"route": "stock-adjustments",
			"buttonTitle": "Adjust stock",
			"displayField": "code",
			"code": {
				"enabled": true,
				"prefix": "SA",
				"padding": 5
			},
			"rationale": "Stock adjustment.",
			"fields": [
				{
					"key": "date",
					"label": "Date",
					"kind": "date",
					"required": true,
					"default": "now",
					"showInTable": true
				},
				{
					"key": "warehouse",
					"label": "Warehouse",
					"kind": "reference",
					"ref": "Warehouse",
					"required": true,
					"showInTable": true
				},
				{
					"key": "reason",
					"label": "Reason",
					"kind": "select",
					"default": "count",
					"showInTable": true,
					"options": [
						{
							"value": "count",
							"label": "Stock count"
						},
						{
							"value": "damaged",
							"label": "Damaged"
						},
						{
							"value": "lost",
							"label": "Lost / stolen"
						},
						{
							"value": "expired",
							"label": "Expired"
						},
						{
							"value": "found",
							"label": "Found"
						},
						{
							"value": "other",
							"label": "Other"
						}
					]
				},
				{
					"key": "items",
					"label": "Products",
					"kind": "sectionlist",
					"addLabel": "Add product",
					"fields": [
						{
							"key": "product",
							"label": "Product id",
							"kind": "text"
						},
						{
							"key": "productName",
							"label": "Product",
							"kind": "text",
							"required": true
						},
						{
							"key": "availableQty",
							"label": "Available in hand",
							"kind": "number"
						},
						{
							"key": "newQty",
							"label": "New stock in hand",
							"kind": "number",
							"required": true
						},
						{
							"key": "unitCost",
							"label": "Unit cost",
							"kind": "number"
						},
						{
							"key": "adjustedQty",
							"label": "Adjusted quantity",
							"kind": "formula",
							"formula": "newQty - availableQty"
						}
					]
				},
				{
					"key": "note",
					"label": "Note",
					"kind": "textarea",
					"showInTable": true
				}
			],
			"table": [
				"date",
				"code",
				"warehouse",
				"reason",
				"note"
			],
			"filters": [
				"date",
				"warehouse",
				"reason"
			]
		},
		{
			"action": "create",
			"name": "StockTransfer",
			"title": "Stock Transfers",
			"route": "stock-transfers",
			"buttonTitle": "Transfer stock",
			"displayField": "code",
			"code": {
				"enabled": true,
				"prefix": "ST",
				"padding": 5
			},
			"rationale": "Stock transfer.",
			"fields": [
				{
					"key": "date",
					"label": "Date",
					"kind": "date",
					"required": true,
					"default": "now",
					"showInTable": true
				},
				{
					"key": "fromWarehouse",
					"label": "Warehouse from",
					"kind": "reference",
					"ref": "Warehouse",
					"required": true,
					"showInTable": true
				},
				{
					"key": "toWarehouse",
					"label": "Warehouse to",
					"kind": "reference",
					"ref": "Warehouse",
					"required": true,
					"showInTable": true
				},
				{
					"key": "items",
					"label": "Products",
					"kind": "sectionlist",
					"addLabel": "Add product",
					"fields": [
						{
							"key": "product",
							"label": "Product id",
							"kind": "text"
						},
						{
							"key": "productName",
							"label": "Product",
							"kind": "text",
							"required": true
						},
						{
							"key": "availableQty",
							"label": "Available",
							"kind": "number"
						},
						{
							"key": "quantity",
							"label": "Transferred quantity",
							"kind": "number",
							"required": true
						}
					]
				},
				{
					"key": "note",
					"label": "Note",
					"kind": "textarea",
					"showInTable": true
				}
			],
			"table": [
				"date",
				"code",
				"fromWarehouse",
				"toWarehouse",
				"note"
			],
			"filters": [
				"date",
				"fromWarehouse",
				"toWarehouse"
			]
		},
		{
			"action": "create",
			"name": "Production",
			"title": "Productions",
			"route": "productions",
			"buttonTitle": "New production",
			"displayField": "code",
			"code": {
				"enabled": true,
				"prefix": "PD",
				"padding": 5
			},
			"rationale": "Production.",
			"fields": [
				{
					"key": "date",
					"label": "Production date",
					"kind": "date",
					"required": true,
					"default": "now",
					"showInTable": true
				},
				{
					"key": "template",
					"label": "Template",
					"kind": "reference",
					"ref": "ProductionTemplate",
					"showInTable": true
				},
				{
					"key": "warehouse",
					"label": "Warehouse",
					"kind": "reference",
					"ref": "Warehouse"
				},
				{
					"key": "rawItems",
					"label": "Raw items consumed",
					"kind": "sectionlist",
					"addLabel": "Add raw item",
					"fields": [
						{
							"key": "product",
							"label": "Product id",
							"kind": "text"
						},
						{
							"key": "productName",
							"label": "Item",
							"kind": "text",
							"required": true
						},
						{
							"key": "quantity",
							"label": "Quantity",
							"kind": "number",
							"required": true
						},
						{
							"key": "unitCost",
							"label": "Unit cost",
							"kind": "number"
						}
					]
				},
				{
					"key": "finishedItems",
					"label": "Finished items made",
					"kind": "sectionlist",
					"addLabel": "Add finished item",
					"fields": [
						{
							"key": "product",
							"label": "Product id",
							"kind": "text"
						},
						{
							"key": "productName",
							"label": "Item",
							"kind": "text",
							"required": true
						},
						{
							"key": "quantity",
							"label": "Quantity",
							"kind": "number",
							"required": true
						},
						{
							"key": "unitCost",
							"label": "Unit cost",
							"kind": "number"
						}
					]
				},
				{
					"key": "totalCost",
					"label": "Total cost",
					"kind": "number",
					"default": 0,
					"showInTable": true,
					"helper": "Kept by the books"
				},
				{
					"key": "note",
					"label": "Note",
					"kind": "textarea"
				}
			],
			"table": [
				"date",
				"code",
				"template",
				"totalCost"
			],
			"filters": [
				"date",
				"template"
			]
		},
		{
			"action": "create",
			"name": "Installment",
			"title": "Installments",
			"route": "installments",
			"buttonTitle": "New installment",
			"displayField": "code",
			"code": {
				"enabled": true,
				"prefix": "IN",
				"padding": 5
			},
			"rationale": "Installments.",
			"fields": [
				{
					"key": "sale",
					"label": "Sales slip",
					"kind": "reference",
					"ref": "Sale",
					"required": true,
					"showInTable": true
				},
				{
					"key": "customer",
					"label": "Customer",
					"kind": "reference",
					"ref": "Trader",
					"showInTable": true,
					"fillFrom": {
						"from": "sale",
						"formula": "customer",
						"readonly": true
					}
				},
				{
					"key": "dueDate",
					"label": "Due date",
					"kind": "date",
					"required": true,
					"showInTable": true
				},
				{
					"key": "amount",
					"label": "Amount",
					"kind": "number",
					"required": true
				},
				{
					"key": "paidAmount",
					"label": "Paid",
					"kind": "number",
					"default": 0
				},
				{
					"key": "due",
					"label": "Due amount",
					"kind": "formula",
					"showInTable": true,
					"formula": "amount - paidAmount"
				},
				{
					"key": "status",
					"label": "Status",
					"kind": "select",
					"default": "unpaid",
					"showInTable": true,
					"options": [
						{
							"value": "unpaid",
							"label": "Unpaid"
						},
						{
							"value": "paid",
							"label": "Paid"
						},
						{
							"value": "partial",
							"label": "Partial paid"
						}
					]
				}
			],
			"table": [
				"dueDate",
				"customer",
				"sale",
				"due",
				"status"
			],
			"filters": [
				"status",
				"dueDate",
				"customer"
			]
		},
		{
			"action": "create",
			"name": "Journal",
			"title": "Journal",
			"route": "journal",
			"displayField": "voucherNo",
			"rationale": "Double-entry lines.",
			"fields": [
				{
					"key": "date",
					"label": "Date",
					"kind": "date",
					"required": true,
					"index": true,
					"showInTable": true
				},
				{
					"key": "voucherNo",
					"label": "Voucher no",
					"kind": "text",
					"searchable": true,
					"showInTable": true
				},
				{
					"key": "sourceType",
					"label": "Source",
					"kind": "select",
					"required": true,
					"index": true,
					"showInTable": true,
					"options": [
						{
							"value": "sale",
							"label": "Sale"
						},
						{
							"value": "sale_return",
							"label": "Sale return"
						},
						{
							"value": "product_return",
							"label": "Customer product return"
						},
						{
							"value": "exchange",
							"label": "Exchange"
						},
						{
							"value": "purchase",
							"label": "Purchase"
						},
						{
							"value": "purchase_return",
							"label": "Purchase return"
						},
						{
							"value": "payment",
							"label": "Payment"
						},
						{
							"value": "expense",
							"label": "Expense"
						},
						{
							"value": "income",
							"label": "Income"
						},
						{
							"value": "transfer",
							"label": "Transfer"
						},
						{
							"value": "voucher",
							"label": "Voucher"
						},
						{
							"value": "cheque",
							"label": "Cheque"
						},
						{
							"value": "stock_adjustment",
							"label": "Stock adjustment"
						},
						{
							"value": "production",
							"label": "Production"
						},
						{
							"value": "opening",
							"label": "Opening balance"
						}
					]
				},
				{
					"key": "sourceId",
					"label": "Source id",
					"kind": "text",
					"index": true
				},
				{
					"key": "account",
					"label": "Account",
					"kind": "reference",
					"ref": "Account",
					"required": true,
					"showInTable": true
				},
				{
					"key": "debit",
					"label": "Debit",
					"kind": "number",
					"default": 0,
					"showInTable": true
				},
				{
					"key": "credit",
					"label": "Credit",
					"kind": "number",
					"default": 0,
					"showInTable": true
				},
				{
					"key": "trader",
					"label": "Customer / supplier",
					"kind": "reference",
					"ref": "Trader"
				},
				{
					"key": "warehouse",
					"label": "Warehouse",
					"kind": "reference",
					"ref": "Warehouse"
				},
				{
					"key": "costCentre",
					"label": "Cost centre",
					"kind": "reference",
					"ref": "CostCentre"
				},
				{
					"key": "note",
					"label": "Note",
					"kind": "text"
				}
			],
			"table": [
				"date",
				"voucherNo",
				"sourceType",
				"account",
				"debit",
				"credit"
			],
			"filters": [
				"sourceType",
				"date",
				"account",
				"trader"
			]
		},
		{
			"action": "create",
			"name": "StockMove",
			"title": "Stock Moves",
			"route": "stock-moves",
			"displayField": "voucherNo",
			"rationale": "Stock in and out.",
			"fields": [
				{
					"key": "date",
					"label": "Date",
					"kind": "date",
					"required": true,
					"index": true,
					"showInTable": true
				},
				{
					"key": "product",
					"label": "Product",
					"kind": "reference",
					"ref": "Product",
					"required": true,
					"showInTable": true
				},
				{
					"key": "warehouse",
					"label": "Warehouse",
					"kind": "reference",
					"ref": "Warehouse",
					"required": true,
					"showInTable": true
				},
				{
					"key": "quantity",
					"label": "Quantity (+ in, − out)",
					"kind": "number",
					"required": true,
					"showInTable": true
				},
				{
					"key": "unitCost",
					"label": "Unit cost",
					"kind": "number",
					"default": 0
				},
				{
					"key": "value",
					"label": "Value",
					"kind": "formula",
					"showInTable": true,
					"formula": "round(quantity * unitCost, 2)"
				},
				{
					"key": "sourceType",
					"label": "Source",
					"kind": "select",
					"required": true,
					"showInTable": true,
					"options": [
						{
							"value": "opening",
							"label": "Opening stock"
						},
						{
							"value": "purchase",
							"label": "Purchase"
						},
						{
							"value": "purchase_return",
							"label": "Purchase return"
						},
						{
							"value": "sale",
							"label": "Sale"
						},
						{
							"value": "sale_return",
							"label": "Sale return"
						},
						{
							"value": "product_return",
							"label": "Customer product return"
						},
						{
							"value": "exchange",
							"label": "Exchange"
						},
						{
							"value": "adjustment",
							"label": "Adjustment"
						},
						{
							"value": "transfer",
							"label": "Transfer"
						},
						{
							"value": "production",
							"label": "Production"
						}
					]
				},
				{
					"key": "sourceId",
					"label": "Source id",
					"kind": "text",
					"index": true
				},
				{
					"key": "voucherNo",
					"label": "Voucher no",
					"kind": "text",
					"searchable": true
				}
			],
			"table": [
				"date",
				"product",
				"warehouse",
				"quantity",
				"value",
				"sourceType"
			],
			"filters": [
				"sourceType",
				"date",
				"product",
				"warehouse"
			]
		},
		{
			"action": "create",
			"name": "Stock",
			"title": "Stock List",
			"route": "stocks",
			"displayField": "productName",
			"rationale": "Stock per product and warehouse.",
			"fields": [
				{
					"key": "product",
					"label": "Product",
					"kind": "reference",
					"ref": "Product",
					"required": true,
					"showInTable": true
				},
				{
					"key": "productName",
					"label": "Product name",
					"kind": "text",
					"searchable": true,
					"fillFrom": {
						"from": "product",
						"formula": "name",
						"readonly": true
					}
				},
				{
					"key": "barcode",
					"label": "Barcode",
					"kind": "text",
					"searchable": true,
					"showInTable": true,
					"fillFrom": {
						"from": "product",
						"formula": "barcode",
						"readonly": true
					}
				},
				{
					"key": "warehouse",
					"label": "Warehouse",
					"kind": "reference",
					"ref": "Warehouse",
					"required": true,
					"showInTable": true
				},
				{
					"key": "inHand",
					"label": "In hand",
					"kind": "number",
					"default": 0,
					"showInTable": true
				},
				{
					"key": "avgCost",
					"label": "Weighted avg cost",
					"kind": "number",
					"default": 0,
					"showInTable": true
				},
				{
					"key": "stockValue",
					"label": "Stock value",
					"kind": "formula",
					"showInTable": true,
					"formula": "round(inHand * avgCost, 2)"
				}
			],
			"table": [
				"product",
				"barcode",
				"warehouse",
				"stockValue",
				"inHand",
				"avgCost"
			],
			"filters": [
				"warehouse",
				"product",
				"inHand"
			]
		},
		{
			"action": "create",
			"name": "AccountingSettings",
			"title": "Settings",
			"route": "accounting-settings",
			"kind": "single",
			"displayField": "currency",
			"rationale": "Settings tabs.",
			"fields": [
				{
					"key": "language",
					"label": "System language",
					"kind": "select",
					"default": "en",
					"options": [
						{
							"value": "en",
							"label": "English"
						},
						{
							"value": "bn",
							"label": "Bangla"
						}
					]
				},
				{
					"key": "currency",
					"label": "Currency symbol",
					"kind": "select",
					"default": "৳",
					"options": [
						{
							"value": "৳",
							"label": "৳ Taka"
						},
						{
							"value": "$",
							"label": "$ Dollar"
						},
						{
							"value": "€",
							"label": "€ Euro"
						},
						{
							"value": "£",
							"label": "£ Pound"
						},
						{
							"value": "SR",
							"label": "SR Riyal"
						},
						{
							"value": "د.إ",
							"label": "د.إ Dirham"
						},
						{
							"value": "Nrs",
							"label": "Nrs Rupee"
						},
						{
							"value": "QR",
							"label": "QR Riyal"
						},
						{
							"value": "CAD",
							"label": "CAD Dollar"
						}
					]
				},
				{
					"key": "costCentres",
					"label": "Multiple cost centres",
					"kind": "boolean",
					"default": false
				},
				{
					"key": "account",
					"label": "Account",
					"kind": "section",
					"fields": [
						{
							"key": "allowNegativeBalance",
							"label": "Allow negative account balance",
							"kind": "boolean"
						},
						{
							"key": "resaleItemsAsAsset",
							"label": "Keep resale items as asset",
							"kind": "boolean"
						}
					]
				},
				{
					"key": "inventory",
					"label": "Manage inventory",
					"kind": "section",
					"fields": [
						{
							"key": "allowNegativeStock",
							"label": "Allow negative inventory",
							"kind": "boolean"
						},
						{
							"key": "batchExpiry",
							"label": "Batch expiry dates",
							"kind": "boolean"
						},
						{
							"key": "manualBatchCode",
							"label": "Manual batch code",
							"kind": "boolean"
						}
					]
				},
				{
					"key": "item",
					"label": "Item",
					"kind": "section",
					"fields": [
						{
							"key": "quantityDecimals",
							"label": "Quantity decimal places",
							"kind": "number"
						},
						{
							"key": "taxInclusive",
							"label": "Prices tax-inclusive by default",
							"kind": "boolean"
						},
						{
							"key": "minStockAlert",
							"label": "Minimum stock alert",
							"kind": "boolean"
						},
						{
							"key": "barcode",
							"label": "Barcode",
							"kind": "boolean"
						},
						{
							"key": "sku",
							"label": "SKU",
							"kind": "boolean"
						},
						{
							"key": "wholesalePrice",
							"label": "Wholesale price",
							"kind": "boolean"
						},
						{
							"key": "serialItems",
							"label": "Serial items",
							"kind": "boolean"
						},
						{
							"key": "showBuyingPrice",
							"label": "Show buying price in item list",
							"kind": "boolean"
						},
						{
							"key": "attributes",
							"label": "Items with attributes",
							"kind": "boolean"
						},
						{
							"key": "extraFields",
							"label": "Extra item fields (Color, Brand, Country, Warranty)",
							"kind": "text"
						}
					]
				},
				{
					"key": "trader",
					"label": "Trader",
					"kind": "section",
					"fields": [
						{
							"key": "customerCode",
							"label": "Customer code",
							"kind": "boolean"
						},
						{
							"key": "codeMandatory",
							"label": "Code mandatory",
							"kind": "boolean"
						},
						{
							"key": "supplierCode",
							"label": "Supplier code",
							"kind": "boolean"
						},
						{
							"key": "autoCodes",
							"label": "Auto-generated codes",
							"kind": "boolean"
						},
						{
							"key": "contactMandatory",
							"label": "Contact no mandatory",
							"kind": "boolean"
						},
						{
							"key": "districtArea",
							"label": "District / area for customers",
							"kind": "boolean"
						}
					]
				},
				{
					"key": "purchase",
					"label": "Purchase management",
					"kind": "section",
					"fields": [
						{
							"key": "itemDiscount",
							"label": "Item-wise discount",
							"kind": "boolean"
						},
						{
							"key": "itemVat",
							"label": "Item-wise VAT",
							"kind": "boolean"
						},
						{
							"key": "lastPrice",
							"label": "Supplier's last price",
							"kind": "boolean"
						},
						{
							"key": "updateBuyingPrice",
							"label": "Update buying price after each purchase",
							"kind": "boolean"
						},
						{
							"key": "setSellingPrice",
							"label": "Set selling price during purchase",
							"kind": "boolean"
						},
						{
							"key": "showCreator",
							"label": "Show creator in purchase list",
							"kind": "boolean"
						}
					]
				},
				{
					"key": "sale",
					"label": "Sale management",
					"kind": "section",
					"fields": [
						{
							"key": "focusNextLine",
							"label": "Focus next line after picking item",
							"kind": "boolean"
						},
						{
							"key": "lastPrice",
							"label": "Customer's last price",
							"kind": "boolean"
						},
						{
							"key": "discountOnVat",
							"label": "Discount on VAT",
							"kind": "boolean"
						},
						{
							"key": "vatInclusive",
							"label": "Selling price VAT-inclusive",
							"kind": "boolean"
						},
						{
							"key": "showContact",
							"label": "Show customer contact / address",
							"kind": "boolean"
						},
						{
							"key": "deliverLater",
							"label": "Take order and deliver later",
							"kind": "boolean"
						},
						{
							"key": "itemDiscount",
							"label": "Item-wise discount",
							"kind": "boolean"
						},
						{
							"key": "roundUpDiscount",
							"label": "Round-up discount",
							"kind": "boolean"
						},
						{
							"key": "expectedPaymentDate",
							"label": "Expected payment date",
							"kind": "boolean"
						},
						{
							"key": "salesRepresentatives",
							"label": "Sales representatives",
							"kind": "boolean"
						},
						{
							"key": "installments",
							"label": "Installments",
							"kind": "boolean"
						},
						{
							"key": "showSalesPerson",
							"label": "Show sales person in list",
							"kind": "boolean"
						},
						{
							"key": "shippingCharge",
							"label": "Shipping charge",
							"kind": "boolean"
						},
						{
							"key": "quotationValidity",
							"label": "Quotation validity",
							"kind": "boolean"
						},
						{
							"key": "editDays",
							"label": "Edit sales up to (days)",
							"kind": "number"
						},
						{
							"key": "defaultPayment",
							"label": "Default payment",
							"kind": "select",
							"options": [
								{
									"value": "cash",
									"label": "Cash"
								},
								{
									"value": "due",
									"label": "Due"
								}
							]
						}
					]
				},
				{
					"key": "returns",
					"label": "Return / exchange",
					"kind": "section",
					"fields": [
						{
							"key": "cashBack",
							"label": "Return with cash back",
							"kind": "boolean"
						},
						{
							"key": "returnExchanged",
							"label": "Return exchanged items",
							"kind": "boolean"
						},
						{
							"key": "days",
							"label": "Return / exchange up to (days)",
							"kind": "number"
						},
						{
							"key": "times",
							"label": "Up to (times)",
							"kind": "number"
						}
					]
				},
				{
					"key": "invoice",
					"label": "Invoice",
					"kind": "section",
					"fields": [
						{
							"key": "layout",
							"label": "Layout",
							"kind": "select",
							"options": [
								{
									"value": "a4",
									"label": "A4"
								},
								{
									"value": "80mm",
									"label": "3-inch thermal"
								},
								{
									"value": "58mm",
									"label": "58 mm thermal"
								}
							]
						},
						{
							"key": "nameChars",
							"label": "Item-name characters",
							"kind": "number"
						},
						{
							"key": "barcodeBeforeName",
							"label": "Barcode before name",
							"kind": "boolean"
						},
						{
							"key": "paymentDetails",
							"label": "Payment details",
							"kind": "boolean"
						},
						{
							"key": "itemTax",
							"label": "Item-wise tax",
							"kind": "boolean"
						},
						{
							"key": "itemDescription",
							"label": "Item description",
							"kind": "boolean"
						},
						{
							"key": "previousBalance",
							"label": "Customer previous balance",
							"kind": "boolean"
						},
						{
							"key": "signature",
							"label": "Authorization signature",
							"kind": "boolean"
						},
						{
							"key": "headerLogo",
							"label": "Header logo + company info",
							"kind": "boolean"
						},
						{
							"key": "watermark",
							"label": "Watermark",
							"kind": "boolean"
						},
						{
							"key": "paidSeal",
							"label": "Paid / Due / COD seal",
							"kind": "boolean"
						},
						{
							"key": "totalQuantity",
							"label": "Total quantity",
							"kind": "boolean"
						},
						{
							"key": "qrCode",
							"label": "QR code",
							"kind": "boolean"
						},
						{
							"key": "footer",
							"label": "Footer",
							"kind": "boolean"
						},
						{
							"key": "footerText",
							"label": "Footer text",
							"kind": "textarea"
						}
					]
				}
			]
		},
		{
			"action": "create",
			"name": "DashboardPref",
			"title": "Dashboard Settings",
			"route": "dashboard-prefs",
			"displayField": "user",
			"rationale": "Dashboard per login.",
			"fields": [
				{
					"key": "user",
					"label": "Login id",
					"kind": "text",
					"required": true,
					"unique": true,
					"showInTable": true
				},
				{
					"key": "period",
					"label": "Period",
					"kind": "select",
					"default": "month",
					"showInTable": true,
					"options": [
						{
							"value": "today",
							"label": "Today"
						},
						{
							"value": "week",
							"label": "This week"
						},
						{
							"value": "month",
							"label": "This month"
						},
						{
							"value": "year",
							"label": "This year"
						}
					]
				},
				{
					"key": "cards",
					"label": "Cards",
					"kind": "multiselect",
					"default": [
						"sales",
						"purchases",
						"expenses",
						"receivable",
						"payable",
						"cash"
					],
					"options": [
						{
							"value": "sales",
							"label": "Sales"
						},
						{
							"value": "purchases",
							"label": "Purchases"
						},
						{
							"value": "expenses",
							"label": "Expenses"
						},
						{
							"value": "receivable",
							"label": "Receivable"
						},
						{
							"value": "payable",
							"label": "Payable"
						},
						{
							"value": "cash",
							"label": "Cash & bank"
						},
						{
							"value": "profit",
							"label": "Profit"
						},
						{
							"value": "stock",
							"label": "Stock value"
						}
					]
				},
				{
					"key": "charts",
					"label": "Charts",
					"kind": "multiselect",
					"default": [
						"sales_purchase",
						"income_expense",
						"top_products",
						"top_customers",
						"cash_flow"
					],
					"options": [
						{
							"value": "sales_purchase",
							"label": "Sales vs purchases"
						},
						{
							"value": "income_expense",
							"label": "Income vs expense"
						},
						{
							"value": "top_products",
							"label": "Top products"
						},
						{
							"value": "top_customers",
							"label": "Top customers"
						},
						{
							"value": "cash_flow",
							"label": "Cash flow"
						}
					]
				}
			]
		},
		{
			"action": "create",
			"name": "OrganizationInfo",
			"title": "Organization Info",
			"route": "organization-info",
			"kind": "single",
			"displayField": "name",
			"rationale": "Company info.",
			"fields": [
				{
					"key": "name",
					"label": "Name",
					"kind": "text",
					"required": true
				},
				{
					"key": "contactPerson",
					"label": "Contact person",
					"kind": "text"
				},
				{
					"key": "contactNo",
					"label": "Contact no",
					"kind": "text"
				},
				{
					"key": "email",
					"label": "Email",
					"kind": "email"
				},
				{
					"key": "vatNumber",
					"label": "VAT registration number",
					"kind": "text"
				},
				{
					"key": "address",
					"label": "Address",
					"kind": "textarea"
				},
				{
					"key": "logo",
					"label": "Logo",
					"kind": "image"
				}
			]
		}
	]
};
