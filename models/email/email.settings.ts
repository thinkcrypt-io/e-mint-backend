const settings: any = {
  name: {
    edit: true,
    sort: true,
    search: true,
    title: "Name",
    type: "string",
    min: 3,
    max: 50,
    trim: true,
  },
  email: {
    unique: true,
    search: true,
    sort: true,
    title: "Email",
    type: "email",
    required: true,
  },
  status: {
    edit: true,
    sort: true,
    search: true,
    title: "Status",
    type: "string",
  },
};

export default settings;
