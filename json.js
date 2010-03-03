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

/* Some stuff to put on that page:
 * 
 * This code was formed when I wanted to know exactly what character triggered
 * a given JSON error. It is based on the implementation at 
 *      http://www.json.org/json_parse.js
 * ...marked 2009-05-31. The parts which could be sped up with regular 
 * expressions have been; a bunch of surplus crap was cleared out; and the 
 * checking rules have been rewritten to be more
 * faithful to RFC 41__. While the interface is the same as for the native
 * JSON.parse() and JSON.stringify() functions described in ECMAScript 5, some
 * browsers may have other quirks, like accepting a trailing comma in an object
 * definition, which violates the standards.
 *
 * This version defaults to native code if it is available, unless you manually
 * set d.o.json.prefs.native = false. It uses the same dispatcher for both
 * parsing and stringifying; d.o.json(string) parses, while d.o.json(nonstring)
 * stringifies. In the odd case where you want to JSON-encode a string, this 
 * library makes sure that String.prototype.toJSON() exists. 
 */

"use strict";
/*global d */

d.o.library({
	name: "d.o json",
	version: "0.1",
	docs: "http://code.drostie.org/d.o/json",
	depends: [],
	fn: function (lib) {
		var parse, stringify, native, func, prefs;
		lib.json = function (obj, opt) {
			if (typeof obj === 'string' | obj instanceof String) {
				if (prefs.native) {
					return JSON.parse(obj, opt);
				} else {
					return parse(obj, opt);
				}
			} else {
				return stringify(obj);
			}
		};
		lib.json.prefs = prefs = {};
		prefs.native = false;
		if (typeof JSON === 'object') {
			prefs.native = true;
			// Ignore non-native JSON object implementations.
			// If they're native, the keys shouldn't pop up in a for-in.
			for (func in JSON) {
				if (func === 'parse' || func === 'stringify') {
					prefs.native = false;
					break;
				}
			}
		}
		parse = (function () {
			var text, at, // global vars with the current parse content. 
				escapes, forbidden_in_strings, whitespace, regex, // sanitizing data
				error, jump, white, next, value, // helper functions
				primitives, // parsers for each JSON primitive.
				revivify; //post-parse processing.
			
			// data for sanitizing later values
			escapes = {'\\"': '"', '\\\\': '\\', '\\/': '/',
				'\\b': '\b', '\\f': '\f', '\\n': '\n', '\\r': '\r', '\\t': '\t'
			};
			forbidden_in_strings = {'\t': true, '\r': true, '\n': true};
			whitespace = {' ': true, '\t': true, '\r': true, '\n': true};
			regex = {
				disallowed: /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/,
				dbl: /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+\-]?\d+)?/gi,
				word: /true|false|null/g,
				string_escape_chars: /([^\\"\t\r\n]*)(\\[\\fnrt\/"]|\\u[0-9a-fA-F]{4}|[\\"\t\r\n])/g
			};
			
			// helper functions
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
				white();
				switch (text.charAt(at)) {
				case '{':
					return primitives.object();
				case '[':
					return primitives.array();
				case '"':
					return primitives.string();
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
					re.lastIndex = last = at + 1; // skip over the '"' char.
					string = "";
					
					while (control = re.exec(text)) {
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
							string += String.fromCharCode(parseInt(control.substring(2), 16));
						}
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
			
			// See the docs for an explanation of revivers. This implementation of the
			// algorithm splits the task into two parts for greater code clarity.
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
			// we return the JSON.parse function.
			return function (source, reviver) {
				var result, i, charcode;
				//check for the totally illegal characters:
				text = "" + source;
				i = text.search(regex.disallowed);
				if (i !== -1) {
					charcode = "0000" + text.charCodeAt(i).toString(16);
					charcode = "\\u" + charcode.substring(charcode.length - 4);
					error("Invalid character: " + charcode, i);
				}
				
				// if that's ok, we parse a value():
				at = 0;
				result = value();
				
				// validate EOF
				white();
				if (at < text.length) {
					error("Expected end-of-file.");
				}
				
				// apply reviver if it exists and return result.
				return typeof reviver === 'function' ? 
					revivify(result, reviver) :
					result;
			};
		}());
		