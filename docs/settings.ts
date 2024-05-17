/**
 * settings file
 * fields for the product model
 * @type : which is the type of the field eg: string, number, boolean, object, array
 * @required : which is a boolean value to check if the field is required or not while creating
 * @title : which is the title of the field specially when throwing error messages
 * @edit : which is a boolean value to check if the field is editable or not,
 * 		   if false the field will be read only
 * @search : which is a boolean value to check if the field is searchable or not
 * @sort : which is a boolean value to check if the field is sortable or not with filters
 * @populate : which is an object to populate the field with the data from the other model
 * @unique : which is a boolean value to which prevents from creating duplicate values in model
 * @trim : which is a boolean value to trim the field while creating
 * @min : which is a number to check the minimum value of the field
 * @max : which is a number to check the maximum value of the field
 * @filter : which is an object to filter the field with the data from the other model
 *   - name : which is the name of the filter
 * 	 - field : which is the field name to filter
 * 	 - type : which is the type of the filter eg: 'multi-select' | 'range' | 'boolean' | 'date'
 * 	 - label : which is the label of the filter
 * 	 - title : which is the title of the filter
 * 	 - options : which is the options of the filter
 * 	 - category : which is the category of the filter
 * 	 - model : which is the model of the filter
 * 	 - key : which is the key of the filter
 *   - roles : which is the roles of the filter
 *
 */
