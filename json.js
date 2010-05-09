/* d.o json.js
 * v. 0.1 released 2009-10-30
 * v. 0.2 released 2010-02-03
 * docs @ http://code.drostie.org/library/json
 * 
 * This code was written by Chris Drost of drostie.org, and he hereby dedicates 
 * it into the public domain: it has no copyright. It is provided "as-is", with 
 * NO WARRANTIES OF ANY KIND. 
 * 
 * I do humbly request that you provide me some sort of credit if you use my 
 * code; but by making it public domain, I leave that decision up to you. 
 *
 * This code was based on http://www.json.org/json_parse.js (v. 2009-05-31). 
 */


"use strict";
/*global d */

d.o.library({

	name: "d.o json",
	version: "0.1",
	docs: "http://code.drostie.org/d.o/json",
	depends: [],
	fn: function (lib) {
		var parse, stringify, func, prefs, 
			revivify, regex, parseDate, subs;
		lib.json = function (obj, opt) {
			var result;
			if (typeof obj === 'string') {
				if (lib.json.prefs.native) {
					result = JSON.parse(obj);
				} else {
					result = parse(obj);
				}
				if (lib.json.prefs.parse_dates) {
					result = revivify(result, function (k, v) {
						if (typeof v === 'string' && regex.date_format.test(v)) {
							return parseDate(v);
						} else {
							return v;
						}
					});
				}
				if (typeof opt === 'function') {
					result = revivify(result, opt);
				}
				return result;
			} else {
				// object input, needs to be stringified.
				if (lib.json.prefs.native && lib.json.prefs.language === "json") {
					return JSON.apply(JSON, arguments);
				} else {
					return stringify.apply(lib.json, arguments);
				}
			}
		};
		String.prototype.json = function () {
			if (lib.json.prefs.native && lib.json.prefs.language === "json") {
				return JSON.apply(JSON, arguments);
			} else {
				return stringify.apply(lib.json, arguments);
			}
		};
		lib.json.prefs = prefs = {
			native_available: false,
			native: false,
			parse_dates: true,
			format: "json" //to be also supported: "js", "php"
		};
		// detect faster native-JSON implementations
		if (typeof JSON === 'object') {
			prefs.native_available = true;
			// Ignore non-native JSON object implementations.
			// If they're native, the keys shouldn't pop up in a for-in.
			for (func in JSON) {
				if (func === 'parse' || func === 'stringify') {
					prefs.native_available = false;
					break;
				}
			}
		}
		prefs.native = prefs.native_available;
		
		regex = {
			//used in parser
			disallowed: /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/,
			dbl: /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+\-]?\d+)?/gi,
			word: /true|false|null/g,
			string_escape_chars: /([^\\"\t\r\n]*)(\\[\\fnrt\/"]|\\u[0-9a-fA-F]{4}|[\\"\t\r\n])/g,
			date_format: /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{3}){0,2}Z$/,
			// used in string formats
		};
		(function () {
			//stringified formats codespace.
			var parser, subs, js_disallowed, php_disallowed, json_string, str_affix;
			js_disallowed = /[\u0000-\u001f\\"]/g;
			php_disallowed = /[\u0000-\u001f\\"$]/g;
			subs = {
				// whitespace shorthands
				'\f': '\\f', '\n': '\\n', '\r': '\\r', '\t': '\\t', '\v': '\\v', 
				// javascript special chars
				'"': '\\"', '\\': '\\\\',
				// php's special char
				'$': '\\$'
			};
			// This is a good idea but broken: esc would never be passed.
			function replacer(char, esc) {
				return subs.hasOwnProperty(char) ?
					subs[char] : 
					esc + ("000" + char.charCodeAt(0).toString(16)).slice(-4);
			}
			function js_str(s) {
				
				return '"' + s.replace(
			function transfer_properties(src, dest) {
				for (var i in src) { 
					if (src.hasOwnProperty(i) && typeof src[i] !== 'undefined') {
						if (typeof src[i] !== 'object') {
							dest[i] = src[i];
						} else {
							dest[i] = src[i] instanceof Array ? [] : {};
							transfer_properties(src[i], dest[i]);
						}
					}
				}
				return dest;
			}
			Format = function (overrides) {
				transfer_properties(overrides, this);
			};
			Format.prototype = {
				obj: {start: "{", sep: ", ", end: "}"}, 
				arr: {start: "[", sep: ", ", end: "]"},
				nil: function (s) {
					return "null";
				},
				bool: function (s) {
					return "" + s;
				},
				num: function (s) {
					return isFinite(s) ? "" + s : "null";
				},
				str: function (s) {
					return '"' + s.replace(js_disallowed, replacer) + '"';
				},
				prop_sep: ": ",
				key: function (s) {
					return this.str(s) + this.prop_sep;
				}
			};
			lib.json.formats = {
				json: new Format({}),
				js: new Format({ 
					identifier: /^[a-z$_][a-z0-9$_]*$/i,
					keywords: /^(?:break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|finally|for|function|if|implements|import|in|instanceof|interface|let|new|package|private|protected|public|return|static|super|switch|this|throw|try|typeof|var|void|while|with|yield)$/,
					key: function (s) {
						if (this.identifier.test(s) && ! this.keywords.test(s)) {
							return s + ": ";
						} else {
							return this.str(s) + ": ";
						}
					}
				}),
				python: new Format({
					bool: function (s) {
						return s ? "True" : "False";
					},
					nil: function (s) {
						return "None";
					}
				}),
				php: new Format({
					obj: {start: "array(", sep: ", ", end: ")"}, 
					arr: {start: "array(", sep: ", ", end: ")"},
					base: json_string("\\x"),
					str: function (s) {
						if (/[^ -~]/.test(s)) { // if we need escape chars:
							return '"' + s.replace(php_disallowed, replacer) + '"';
						} else { // else, single-quoted php string:
							return "'" + s.replace(/([\\'])/g, "\\$1") + "'";
						}
					},
					prop_sep: " => "
				})
			};
		// Revivers are a postprocessing step once the JSON parsing has been 
		// completed. This implementation splits the task into two parts for 
		// greater code clarity.
		revivify = function (parse_output, fn) {
			function recurse(object, key, value) {
				// first we recurse over the children of object[key] == value: 
				var subkey;
				if (typeof value === 'object') {
					for (subkey in value) {
						if (Object.hasOwnProperty.call(value, subkey)) {
							recurse(value, subkey, value[subkey]);
						}
					}
				}
				// then we replace object[key] with fn.call(object, key, value).
				object[key] = fn.call(object, key, value);
				if (typeof object[key] === 'undefined') {
					delete object[key];
				}
				return object[key];
			}
			return recurse({"": parse_output}, "", parse_output);
		};
		
		parse = (function () {
			var text, at, // global vars with the current parse content. 
				escapes, forbidden_in_strings, whitespace, // sanitizing data
				error, jump, white, next, value, // helper functions
				primitives, // parsers for each JSON primitive.
				parseDate; //post-parse processing.
			
			// data for sanitizing later values
			escapes = {'\\"': '"', '\\\\': '\\', '\\/': '/',
				'\\b': '\b', '\\f': '\f', '\\n': '\n', '\\r': '\r', '\\t': '\t'
			};
			forbidden_in_strings = {'\t': true, '\r': true, '\n': true};
			whitespace = {' ': true, '\t': true, '\r': true, '\n': true};
			
			// helper functions
			parseDate = function (str) {
				var data, sanitized, i, attempt, a_str, a_dot;
				sanitized = str.replace(" ", "T");
				data = sanitized.split(/[\-T:.Z]/);
				for (i = 0; i < 7; i += 1) {
					data[i] = data[i] ? parseInt(data[i], 10) : 0;
				}
				data[1] -= 1;
				attempt = new Date(Date.UTC.apply(Date, data));
				
				// to validate that it was actually a valid date: 
				// convert the new date to its ISOString and see if they match.
				a_str = attempt.toISOString();
				// strip out the ms and the Z -- they're always OK and sometimes not present.
				a_dot = a_str.lastIndexOf(".");
				a_str = (a_dot === -1) ? a_str.substring(0, a_str.length - 1) : a_str.substring(0, a_dot);
				if (sanitized.substring(0, a_str.length) === a_str) {
					return attempt;
				} else {
					return str;
				}
			};
			error = function (m, i) { // SyntaxError: Problem m at character #i.
				var e, s;
				if (typeof i !== 'number') {
					i = at;
				}
				e = new SyntaxError("JSON.parse");
				s = text.substring(0, i);
				e.json_debug = {
					error: m,
					line: s.replace(/[^\n]/g, "").length + 1,
					col: s.substring(s.lastIndexOf("\n") + 1).length + 1, 
					index: i
				};
				throw e;
			};
			next = function (c) { // single-character syntax validator
				if (text.charAt(at) !== c) {
					error("Expecting character: " + c);
				}
				at += 1;
			};
			jump = function (re, m) { // regex syntax validator.
				re.lastIndex = at;
				var match = re.exec(text);
				if (match === null || at !== re.lastIndex - match[0].length) {
					error(m);
				}
				at = re.lastIndex;
				return match[0];
			};
			white = function () { // skips whitespace.
				while (whitespace[text.charAt(at)]) {
					at += 1;
				}
			};
			value = function () { // reads in the value @ at.
				var str;
				white();
				switch (text.charAt(at)) {
				case '{':
					return primitives.object();
				case '[':
					return primitives.array();
				case '"':
					str = primitives.string();
					return str;
				case 't': 
				case 'f':
				case 'n':
					return primitives.word();
				default:
					return primitives.number();
				}
			};
			
			// the primitive objects.
			primitives = {
				number: function () {
					return +jump(regex.dbl, "Not a valid value");
				},
				word: function () {
					switch (jump(regex.word, "Unexpected token")) {
					case 'true': 
						return true;
					case 'false': 
						return false;
					case 'null': 
						return null;
					}
				},
				string: function () {
					var control, string, last, re;
					re = regex.string_escape_chars;
					re.lastIndex = last = at + 1; // skip over the first '"' char.
					string = "";
					control = re.exec(text);
					while (control !== null) {
						string += control[1];
						control = control[2];
						last = re.lastIndex;
						if (control === '"') {
							at = last;
							return string;
						}
						if (control === '\\') {
							error("Invalid escape character.", last - 1);
						}
						if (forbidden_in_strings[control]) {
							error("Invalid whitespace in string.", last - 1);
						}
						if (escapes.hasOwnProperty(control)) {
							string += escapes[control];
						} else {
							// \uNNNN string; syntax validated already by regex.
							string += String.fromCharCode(
								parseInt(control.substring(2), 16)
							);
						}
						control = re.exec(text);
					}
					error("Nonterminating string literal");
				},
				array: function () {
					var first, array;
					array = [];
					first = at;
					// preprocessing steps
					at += 1; //skip over [
					white();
					if (text.charAt(at) === ']') { 
						// empty array
						at += 1;
						return array;
					}
					// main loop
					while (at < text.length) {
						array.push(value());
						white();
						if (text.charAt(at) === ']') {
							at += 1;
							return array;
						}
						next(',');
						white();
					}
					error("Nonterminating array", first);
				},
				object: function () {
					var key, object, first;
					first = at;
					object = {};
					// preprocessing steps
					at += 1; // skip over {
					white();
					if (text.charAt(at) === '}') { 
						// empty object
						at += 1;
						return object;   
					}
					// main loop
					while (at < text.length) {
						key = primitives.string();
						white();
						next(':');
						if (Object.hasOwnProperty.call(object, key)) {
							error("Duplicate key '" + key + "'");
						}
						object[key] = value();
						white();
						if (text.charAt(at) === '}') {
							at += 1;
							return object;
						}
						next(',');
						white();
					}
					error("Nonterminating object", first);
				}
			};
			
			// we return the JSON.parse function.
			return function (source, reviver) {
				var result, i, charcode;
				//check for the totally illegal characters:
				text = "" + source;
				i = text.search(regex.disallowed);
				if (i !== -1) {
					error("Invalid character: " + 
						("000" + text.charCodeAt(i).toString(16)).slice(-4), 
						i
					);
				}
				
				// if that's ok, we parse a value():
				at = 0;
				result = value();
				
				// validate EOF
				white();
				if (at < text.length) {
					error("Expected end-of-file.");
				}
				
				return result;
			};
		}());
		function setIfUnset(obj, prop, func) {
			if (!obj.prototype.hasOwnProperty(prop)) {
				obj.prototype[prop] = func;
			}
		}
		function padint(n, size) {
			n = n.toString();
			while (n.length < size) {
				n = "0" + n;
			}
			return n;
		}
		setIfUnset(Date, "toISOString", function () {
			var ms = padint(this.getUTCMilliseconds(), 3);
			return padint(this.getUTCFullYear(), 4) + "-" + 
				padint(this.getUTCMonth() + 1, 2) + "-" +
				padint(this.getUTCDate(), 2) + "T" +
				padint(this.getUTCHours(), 2) + ":" +
				padint(this.getUTCMinutes(), 2) + ":" +
				padint(this.getUTCSeconds(), 2) +
				(ms === "000" ? "Z" : "." + ms + "Z");
		});
		setIfUnset(Date, "toJSON", function () {
			return this.toISOString();
		});
		setIfUnset(String, "toJSON", function () {
			return this.valueOf();
		});
		setIfUnset(Number, "toJSON", function () {
			return this.valueOf();
		});
		setIfUnset(Boolean, "toJSON", function () {
			return this.valueOf();
		});
		raw_stringify = function (input, ref, indent) {
			var keys, key, i, output;
			// objects align their children, 
			if (typeof input === "object" && input !== null && input.toJSON) {
				input = input.toJSON();
			}
			switch (typeof input) {
			case "string":
				return ref.str(input);
			case "number":
				return isFinite(input) ? ref.num(input) : ref.nil(null);
			case "boolean":
				return ref.bool(input);
			case "function":
			case "undefined":
				return undefined;
			}
			mode = (input instanceof Array) ? "arr" : "obj";
			keys = [];
			output = {};
			for (key in input) {
				if (input.hasOwnProperty(key)) {
					t = json_raw_parse(input, ref, indent + "\t");
					if (t !== undefined) {
						output[key] = {
							sort: (t.indexOf("\n") === -1) ? 0 : 1,
							data: t
						};
						keys.push(key);
					}
				}
			}
				if (keys.length === 0) {
					return ref[mode].start + ref[mode].end;
				}
				if (input instanceof Array) {
					keys.sort(function (a, b) {
						var c = output[a].sort - output[b].sort;
						return (c !== 0) ? c : a - b;
					});
				} else {
					keys.sort(function (a, b) {
						var c = output[a].sort - output[b].sort;
						return (c !== 0) ? c : (a < b) ? -1 : 1;
					});
				}
				t = output;
				output = [];
				for (i = 0; i < keys.length; i += 1) {
					//objects have a key string:
					key = (mode === "obj") ? ref.keys(keys[i]) : "";
					output[i] = key + t[keys[i]];
				}
				return ref[mode].start + 
					"\n\t" + indent + 
					output.join(ref[mode].sep + "\n\t" + indent) +
					"\n" + indent + ref[mode].end;
			}
		};
		stringify = function (object) {
			return json_raw_parse(object, lib.json.formats[lib.prefs.format], "");
		};
	}
});