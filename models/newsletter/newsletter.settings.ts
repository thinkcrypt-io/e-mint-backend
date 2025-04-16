const settings = {
    shop: {
        title: "Shop",
        type: "string",
        sort: true,
        search: false,
        edit: true,
        populate: {
            path: "shop",
            select: "name"
        },
        filter: {
            name: "shop",
            field: "shop_in",
            type: "multi-select",
            category: "model",
            model: "shop",
            key: "name",
            label: "Shop",
            title: "Filter by Shop"
        },
        schema: {
            type: "data-menu",
            tableType: "string",
            tableKey: "shop.name",
            model: "shops"
        }
    },
    email: {
        title: "Email",
        type: "string",
        sort: false,
        search: true,
        edit: true,
        required: true,
        trim: true,
        schema: {}
    },
    phone: {
        title: "Phone",
        type: "string",
        sort: false,
        search: true,
        edit: true,
        schema: {}
    },
    count: {
        title: "Count",
        type: "number",
        sort: false,
        search: false,
        edit: true,
        schema: {}
    },
    isActive: {
        title: "Is active",
        type: "boolean",
        sort: true,
        search: false,
        edit: true,
        filter: {
            name: "isActive",
            type: "boolean",
            label: "Is active",
            title: "Filter by Is active"
        },
        schema: {}
    },
    status: {
        title: "Status",
        type: "string",
        sort: true,
        search: true,
        edit: true,
        filter: {
            name: "status",
            field: "status_in",
            type: "multi-select",
            label: "Status",
            title: "Filter by Status",
            options: [
                {
                    label: "Subscribed",
                    value: "subscribed"
                },
                {
                    label: "Un Subscribed",
                    value: "un-subscribed"
                },
                {
                    label: "Pending",
                    value: "pending"
                },
                {
                    label: "Archived",
                    value: "archived"
                },
                {
                    label: "Converted",
                    value: "converted"
                }
            ]
        },
        schema: {
            type: "select",
            options: [
                {
                    label: "Subscribed",
                    value: "subscribed"
                },
                {
                    label: "Un Subscribed",
                    value: "un-subscribed"
                },
                {
                    label: "Pending",
                    value: "pending"
                },
                {
                    label: "Archived",
                    value: "archived"
                },
                {
                    label: "Converted",
                    value: "converted"
                }
            ]
        }
    },
    createdAt: {
        title: "Created at",
        type: "date",
        sort: true,
        search: false,
        edit: true,
        filter: {
            name: "createdAt",
            type: "date",
            label: "Created at",
            title: "Filter by Created at"
        },
        schema: {
            type: "date",
            tableType: "string"
        }
    }
}


export default settings