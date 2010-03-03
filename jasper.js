"use strict"; 

/*global d */
/*jslint regexp: false */

/* d.o jasper Models 
 * v. 0.1 completed 2010-01-24
 * v. 0.2 completed 2010-02-03
 * v. 0.3 completed 2010-02-21
 * v. 0.4 in progress
 * docs @ http://code.drostie.org/jasper.txt (eventually.)
 * 
 * This code was written by Chris Drost of drostie.org, and he hereby dedicates 
 * it into the public domain: it has no copyright. It is provided "as-is", with 
 * NO WARRANTIES OF ANY KIND. 
 * 
 * I do humbly request that you provide me some sort of credit if you use my 
 * code; but by making it public domain, I leave that decision up to you. 
 */

d.o.library({
	name: "d.o jasper",
	version: "0.4",
	docs: "http://code.drostie.org/d.o/jasper",
	depends: [],
	fn: function (lib) {
		lib.jasper = {};
		var regex_parse, primitives, either, validate, OutputObject, Context, metamodel;
		
		regex_parse = /^\/(.*)\/(i?m?|mi)$/;
		
		// selects the default if its input is undefined. 
		either = function (input, def) {
			return (input === undefined) ? def : input;
		};
		OutputObject = function (v, s, p) {
			function format_message(m) {
				return {value: v, schema: s, path: p, message: m};
			}
			this.sanitized = undefined;
			this.errors = [];
			this.warnings = [];
			this.err = function (m) {
				this.errors.push(format_message(m));
			};
			this.warn = function (m) {
				this.warnings.push(format_message(m));
			};
			this.merge_errors = function (that) {
				this.errors = this.errors.concat(that.errors);
				this.warnings = this.warnings.concat(that.warnings);
			};
			this.proxy = function (that) {
				this.sanitized = that.sanitized;
				this.errors = that.errors;
				this.warnings = that.warnings;
			};
		};
		Context = function (obj, opts) {
			this.obj = obj;
			this.opts = opts;
		};
		/* The basic validation functions for the primitives are defined here.
		 * They all take a basic set of parameters: 
		 *     v: the value in the input object
		 *     o: an output object
		 *     m: the metadata object from the schema
		 *     r: a recurse function, to validate any children
		 *     c: the context of the function -- called opts and the overall object.
		 * To make this easier in other languages, they don't return anything, but
		 * just modify `o.sanitized` and append warnings and errors to `o`. 
		 */
		primitives = {
			"freeform": function (v, o) {
				o.sanitized = v;
			},
			"regex": function (v, o, r, m, c) {  //needs context c
				var tmp;
				if (v instanceof RegExp) {
					// strip out any flags other than "i" and "m".
					// the 'g' and 'y' flags are mostly for parsers anyway.
					tmp = (v.ignoreCase ? "i" : "") + (v.multiline ? "m" : "");
					o.sanitized = new RegExp(v.source, tmp);
				} else if (typeof v === 'string' || v instanceof String) {
					tmp = regex_parse.exec(v);
					try {
						o.sanitized = new RegExp(tmp[1], tmp[2]);
					} catch (e) {
						o.err('invalid regex');
					}
				} else {
					o.err('unable to coerce');
				}
				if (c.opts.regex_as_string === true) {
					// toString() automatically has the right syntax.
					o.sanitized = "" + o.sanitized;
				}
			},
			"boolean": function (v, o) {
				if (typeof v === "boolean") {
					o.sanitized = v;
				} else {
					v = "" + v;
					if (v === "true" || v === "false") {
						o.sanitized = (v === "true");
						o.warn('type coercion');
					} else {
						o.err('unable to coerce');
					}
				}
			},
			"number": function (v, o, m) {
				if (typeof v !== "number") {
					o.warn('type coercion');
				}
				
				// These lines cast Infinity, "", null, true, and false to NaN.
				// They also cast (with a warning) "3.0" and "0x30" correctly.
				v = v + "";
				v = (v === "") ? NaN : v - 0;
				v = (v === Infinity || v === -Infinity) ? NaN : v;
				
				if (isNaN(v)) {
					o.err('unable to coerce');
				}
				if (m.integer === true && v % 1 !== 0) { 
					o.err('not an integer'); 
				}
				// note: comparisons involving undefined are all false.
				if (v < m.min) {
					o.err('minimum violated'); 
				}
				if (v > m.max) { 
					o.err('maximum violated'); 
				}
				o.sanitized = v;
			},
			"string": function (v, o, m, r, c) {
				switch (typeof v) {
				case "string":
					break;
				case "number":
				case "boolean":
					o.warn('type coercion');
					break;
				default:
					if (! v instanceof String) {
						o.err('unable to coerce');
						return;
					}
				}
				v = "" + v;
				if (v.length > m.max_length) {
					o.err('max length violated');
				}
				if (v.length < m.min_length) {
					o.err('min length violated');
				}
				if (m.root_index === true && ! c.obj.hasOwnProperty(v)) {
					o.err('not a valid key into the root index');
				}
				if (m.regex instanceof RegExp && m.regex.test(v) === false) {
					o.err('regex violated');
				}
				if (m.confidential === true) {
					if (c.opts.hide_confidential === true) {
						v = "(confidential)";
					}
				}
				o.sanitized = v;
			},
			"index": function (v, o, m, r, c) {
				var sanitized, subschema, key, output, regex;
				sanitized = {};
				subschema = either(m.elements, 'object');
				regex = m.valid_keys;
				if (typeof v !== 'object') {
					o.err('unable to coerce');
				} else {
					if (v instanceof Array && v.length > 0) {
						o.warn('type coercion');
					}
					for (key in v) {
						if (v.hasOwnProperty(key)) {
							output = r(v[key], subschema, key);
							sanitized[key] = output.sanitized;
							if (regex instanceof RegExp && regex.test(key) !== true) {
								o.err('invalid key: ' + key);
							}
							o.merge_errors(output);
						}
					}
					o.sanitized = sanitized;
				}
			},
			"list": function (v, o, m, r) {
				var sanitized, subschema, i, output;
				sanitized = [];
				subschema = either(m.elements, 'object');
				if (v instanceof Array) {
					for (i = 0; i < v.length; i += 1) {
						output = r(v[i], subschema, i);
						sanitized[i] = output.sanitized;
						o.merge_errors(output);
					}
					o.sanitized = sanitized;
				} else {
					o.err('unable to coerce');
				}
			},
			"multi": function (v, o, m, r) {
				var i, subschema, output, attempts;
				subschema = either(m.allowed, []);
				attempts = [];
				// the only way out from this error will be o.proxy().
				o.err('no options matched');
				for (i = 0; i < subschema.length; i += 1) {
					output = r(v, subschema[i], '(multi: ' + i + ')');
					attempts[i] = output;
					o.merge_errors(output);
				}
				attempts.sort(function (a, b) {
					var de = a.errors.length - b.errors.length;
					return (de !== 0) ? de : 
						a.warnings.length - b.warnings.length;
				});
				if (attempts.length > 0) {
					if (attempts[0].errors.length === 0) {
						o.proxy(attempts[0]);
					}
				}
			},
			"enum": function (v, o, m, r) {
				var meta, value, opts, subschema, output;
				value = either(m.value_field, "value");
				meta = either(m.meta_field, "meta");
				opts = either(m.options, {});
				if (! opts.hasOwnProperty(v[value])) {
					o.err('value not allowed by enum: ' + v[value]);
				} else {
					subschema = { 
						type: (m.strict === false ? "args" : "object"),
						meta: {fields: opts[v[value]]}
					};
					output = r(v[meta], subschema, meta);
					o.merge_errors(output);
					o.sanitized = {};
					o.sanitized[value] = v[value];
					o.sanitized[meta] = output.sanitized;
				}
			},
			"args": function (v, o, m, r) {
				var k, fields, output;
				v = either(v, {});
				fields = either(m.fields, {});
				o.sanitized = {};
				if (typeof v !== 'object' || v === null) {
					o.err('unable to coerce');
				} else {
					for (k in v) {
						if (v.hasOwnProperty(k) && v[k] !== undefined) {
							if (! fields.hasOwnProperty(k)) {
								o.warn('extra key not in schema: ' + k);
							} else {
								output = r(v[k], fields[k], k);
								o.merge_errors(output);
								o.sanitized[k] = output.sanitized;
							}
						}
					}
				}
			},
			"object": function (v, o, m, r, c) {
				var key, fields;
				fields = either(m.fields, {});
				if (typeof v !== 'object') {
					o.err('unable to coerce');
				} else {
					// first, run the same test as "args" did.
					primitives.args(v, o, m, r, c);
					// then, check that all the keys are accounted for.
					for (key in fields) {
						if (fields.hasOwnProperty(key)) {
							if (! o.sanitized.hasOwnProperty(key)) {
								o.err('missing field: ' + key);
							}
						}
					}
				}
			}
		};
		
		
		// workhorse validation function and model, in closure for d.o.jasper.model():
		validate = function (object, model, root_schema, opts) {
			var subvalidate, context;
			if (typeof opts !== "object") { 
				opts = {}; 
			}
			context = new Context(object, opts);
			subvalidate = function (value, schema, path) {
				var out, recurse;
				
				// convert the schema to {type, meta} form:
				if (typeof schema === "string") {
					schema = model.hasOwnProperty(schema) ? 
						model[schema] :
						{type: schema, meta: {}};
				}
				
				// allow objects to define their own jasper serialization
				if (value !== null && value !== undefined) {
					if (typeof value.jasper === "function") {
						value = value.jasper();
					}
				} 
				
				// this collects errors, warnings, and a sanitized value.
				out = new OutputObject(value, schema, path);
				
				// this is the recursor function that we give to child validators.
				recurse = function (v, s, name) {
					var subpath = path.slice(0);
					subpath.push(name);
					return subvalidate(v, s, subpath);
				};
				
				if (primitives.hasOwnProperty(schema.type)) {
					primitives[schema.type](value, out, schema.meta, recurse, context);
				} else {
					out.err("schema type not recognized: " + schema.type);
				}
				return out;
			};
			
			object = subvalidate(object, model[root_schema], []);
			return (object.errors.length > 0) ?
				{status: "errors", meta: {list: object.errors}} :
				{status: "ok", meta: {sanitized: object.sanitized, warnings: object.warnings}};
		};
		metamodel = lib.jasper.metamodel = {
			"model": {"type": "index", "meta": {
				"elements": "schema",
				"valid_keys": /^(?!type).+|type.+$/
			}},
			"primitive string": {"type": "string", "meta": {
				"regex": /^(string|number|boolean|enum|index|list|freeform|object|args|multi|regex)$/
			}}, 
			"composite schema": {"type": "multi", "meta": {
				"allowed": [
					"schema", 
					"primitive string",
					{"type": "string", "meta": {"root_index": true}}
				]
			}},
			"natural number": {"type": "number", "meta": {"integer": true, "min": 0}},
			"object fields": {"type": "index", "meta": {"elements": "composite schema"}},
			"schema": {"type": "enum", "meta": {
				"value_field": "type",
				"meta_field": "meta",
				"strict": false,
				"options": {
					"freeform": {},
					"boolean": {},
					"regex": {},
					"number": {
						"integer": "boolean",
						"max": "number",
						"min": "number"
					},
					"string": {
						"max_length": "natural number",
						"min_length": "natural number",
						"regex": "regex",
						"root_index": "boolean",
						"confidential": "boolean"
					},
					"enum": {
						"value_field": "string",
						"meta_field": "string",
						"strict": "boolean",
						"options": {"type": "index", "meta": {"elements": "object fields"}}
					},
					"index": {
						"elements": "composite schema",
						"valid_keys": "regex"
					},
					"list": {
						"elements": "composite schema"
					},
					"args": {
						"fields": "object fields"
					},
					"object": {
						"fields": "object fields"
					},
					"multi": {
						"allowed": {"type": "list", "meta": {"elements": "composite schema"}}
					}
				}
			}}
		};
		lib.jasper.model = function (model_spec, opts) {
			var model = validate(model_spec, metamodel, "model", {regex_as_string: false});
			if (model.status === "errors" || model.meta.warnings.length !== 0) {
				throw new Error("Invalid jasper model. Please revalidate it against the schema.");
			}
			model = model.meta.sanitized;
			opts = either(opts, {});
			function glom() {
				var out = {}, i, k;
				for (i = 0; i < arguments.length; i += 1) {
					for (k in arguments[i]) {
						out[k] = arguments[i][k];
					}
				}
				return out;
			}
			return {
				validate: function (object, model_name, subopts) {
					if (model_name === undefined) { 
						model_name = opts.default_model;
					}
					model_name = "" + model_name;
					subopts = glom(opts, either(subopts, {}));
					if (model.hasOwnProperty(model_name) && model[model_name] !== undefined) {
						return validate(object, model, model_name, subopts);
					}
					throw new Error("Cannot validate against unrecognized model '" + model_name + "'.");
				}
			};
		};
	}
});