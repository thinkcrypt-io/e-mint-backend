const settings: any = {
  email: {
    edit: true,
    title: "Email",
    type: "string",
    sort: true,
    search: true,
    required: true,
    schema: {
      default: true,
      sort: true,
      displayInTable: true,
    },
  },
  isActive: {
    edit: true,
    title: "IsActive",
    type: "boolean",
    schema: {
      type: "checkbox",
      displayInTable: true,
      default: true,
      sort: true,
    },
    filter: {
      name: "isActive",
      field: "isActive",
      type: "boolean",
      label: "isActive",
      title: "Sort by isActive",
    },
  },
  createdAt: {
    title: "CreatedAt",
    type: "date",
    schema: {
      displayInTable: true,
    },
    filter: {
      name: "createdAt",
      field: "createdAt",
      type: "date",
      label: "createdAt",
      title: "Sort by createdAt",
    },
  },
};
export default settings;
