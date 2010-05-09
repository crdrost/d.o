/* d.o transcode
 * v. 0.1 released 2010-05-09
 * docs @ http://code.drostie.org/library/transcode
 *
 * This function was written by Chris Drost of drostie.org, and he hereby dedicates it into the 
 * public domain: it has no copyright. It is provided with NO WARRANTIES OF ANY KIND. 
 * I do humbly request that you provide me some sort of credit if you use it; but I leave that 
 * choice up to you.
 */

"use strict";
/*global d */
/*jslint bitwise: false */
d.o.library({
	name: "d.o transcode", 
	version: "0.1", 
	docs: "http://code.drostie.org/d.o/transcode",
	depends: [],
	fn: function (lib) {
		var lib64, regex, hexify, // utility methods
			transform_lib,   // the currently defined transforms
			error, validate; // error-throwing methods.
		
		// simple error-handling functions
		error = function (message, meta) {
			switch (typeof meta) {
			case "undefined":
				break;
			case "number":
			case "string":
				message += ": " + meta;
				break;
			default: 
				message += ": (see error.meta)";
				break;
			}
			var v = new SyntaxError(message);
			v.meta = meta;
			throw v;
		};
		validate = function (condition, message, meta) {
			if (! condition) {
				error(message, meta);
			}
		};
		
		// utilities used in the transform_lib
		lib64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
		hexify = function (array) {
			for (var i = 0; i < array.length; i += 1) {
				array[i] = array[i].toString(16);
				if (array[i].length === 1) {
					array[i] = "0" + array[i];
				}
			}
		};
		regex = {
			b64: /^[a-z0-9+\/]*(|=|==)$/i,
			equals: /[=]/g,
			hex_check: /[^a-f0-9]/i,
			whitespace: /[\n\s]+/g
		};
		transform_lib = {
			"array": {
				"base64": function (bytes) {
					var padding, output, i, n;
					output = "";
					padding = 3 - bytes.length % 3;
					padding = padding === 3 ? 0 : padding;
					while (bytes.length % 3 !== 0) {
						bytes.push(0);
					}
					for (i = 0; i < bytes.length; i += 3) {
						n = 65536 * bytes[i] + 256 * bytes[i + 1] + bytes[i + 2];
						output += lib64.charAt(n >>> 18);
						output += lib64.charAt((n >>> 12) % 64);
						output += lib64.charAt((n >>> 6) % 64);
						output += lib64.charAt(n % 64);
					}
					output = output.substring(0, output.length - padding);
					output += "==".substring(0, padding);
					return output;
				},
				"hex": function (bytes) {
					return hexify(bytes).join("");
				},
				"utf-8": function (bytes) {
					try {
						var encoded = "%" + hexify(bytes).join("%");
						return decodeURIComponent(encoded);
					} catch (e) {
						error("Invalid utf-8 sequences", bytes);
					}
				},
				"utf-16le": function (bytes) {
					validate(bytes.length % 2 === 0, 
						"Invalid byte length for UTF-16", bytes.length);
					var i, output; 
					output = "";
					for (i = 0; i < bytes.length; i += 2) {
						output += String.fromCharCode(bytes[i] + 256 * bytes[i + 1]);
					}
					return output;
				},
				"utf-16be": function (bytes) {
					validate(bytes.length % 2 === 0, 
						"Invalid byte length for UTF-16", bytes.length);
					var i, output; 
					output = "";
					for (i = 0; i < bytes.length; i += 2) {
						output += String.fromCharCode(256 * bytes[i] + bytes[i + 1]);
					}
					return output;
				},
				"utf-16": function (bytes) {
					validate(bytes.length > 2, 
						"No UTF-16 byte-order marker", bytes);
					var bom = hexify(bytes.splice(0, 2)).join(" ");
					switch (bom) {
					case "ff fe":
						return transform_lib.array["utf-16le"](bytes);
					case "fe ff":
						return transform_lib.array["utf-16be"](bytes.slice(2));
					default:
						bom = "0x" + bom.replace(" ", ", 0x");
						throw error("Invalid UTF-16 byte-order marker", bom);
					}
				}
			},
			"string": {
				"base64": function (string) {
					var array, padding, c, last, i;
					string = string.replace(regex.whitespace, "");
					function code(i) {
						return lib.indexOf(string.charAt(i));
					}
					padding = regex.b64.exec(string);
					validate(string.length % 4 === 0 && padding !== null, 
						"Invalid base64 string", string);
					padding = padding[1].length;
					string = string.replace(regex.equals, "A");
					c = 0;
					array = [];
					for (i = 0; i < last; i += 4) {
						c = 262144 * code(i) + 4096 * code(i + 1) + 
							64 * code(i + 2) + code(i + 3);
						array.push(c >>> 16);
						array.push((c & 0xFF00) >>> 8);
						array.push(c & 0xFF);
					}
					for (i = 0; i < padding; i += 1) {
						array.pop();
					}
					return array;
				},
				"hex": function (string) {
					string = string.replace(regex.whitespace, "");
					validate(regex.hex_check.exec(string) === null, "Invalid characters in hex string");
					validate(string.length % 2 === 0, "Hex string must be a multiple of 2 chars in length.");
					var array, i;
					array = [];
					for (i = 0; i < string.length; i += 2) {
						array.push(parseInt(string.substr(i, 2), 16));
					}
					return array;
				},
				"utf-8": function (string) {
					var array, i, j, s, preprocess;
					array = [];
					// we normalize the array entries by prepending a fake null
					preprocess = encodeURIComponent("00" + string).split("%");
					for (i = 0; i < preprocess.length; i += 1) {
						s = preprocess[i];
						array.push(parseInt(s.substring(0, 2), 16));
						for (j = 2; j < s.length; j += 1) {
							array.push(s.charCodeAt(j));
						}
					}
					return array.slice(1); //skip the fake null
				},
				"utf-16le": function (string) {
					var array, i, c;
					array = [];
					for (i = 0; i < string.length; i += 1) {
						c = string.charCodeAt(i);
						array.push(c % 256);
						array.push(c >> 8);
					}
					return array;
				},
				"utf-16be": function (string) {
					var array, i, c;
					array = [];
					for (i = 0; i < string.length; i += 1) {
						c = string.charCodeAt(i);
						array.push(c >> 8);
						array.push(c % 256);
					}
					return array;
				},
				"utf-16": function (string) {
					return [255, 254].concat(
						transform_lib.string['utf-16le'](string)
					);
				}
			}
		};
		
		lib.transcode = function (source) {
			var i, n, transform, t;
			if (source instanceof Array) {
				// duplicate the array and validate that it contains bytes.
				source = source.slice(0);
				for (i = 0; i < source.length; i += 1) {
					n = source[i] - 0;
					validate(n % 1 === 0 && n >= 0 && n < 256,
						"Not a byte", n);
				}
			} else if (typeof source !== 'string') {
				error("Invalid input", source);
			}
			for (i = 1; i < arguments.length; i += 1) {
				// get the transform name
				transform = arguments[i];
				validate(typeof transform === 'string',
					"Transform literals must be string literals", transform);
				transform = transform.toLowerCase();
				
				// get the library that handles this type of source object
				t = source instanceof Array ? "array" : "string";
				t = transform_lib[t];
				
				// validate that the library knows what to do here:
				validate(t.hasOwnProperty(transform), 
					"No such transform registered", transform);
				transform = t[transform];
				
				// the source for the next step is transform(source).
				source = transform(source);
			}
			return source;
		};
	}
});
