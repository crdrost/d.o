/* d.o build.js
 * v. 0.1 released 2009-10-30
 * v. 0.2 released 2010-02-03
 * docs @ http://code.drostie.org/build.txt
 *
 * This function was written by Chris Drost of drostie.org, and he hereby dedicates it into the 
 * public domain: it has no copyright. It is provided with NO WARRANTIES OF ANY KIND. 
 * I do humbly request that you provide me some sort of credit if you use it; but I leave that 
 * choice up to you.
 */

"use strict";
/*global d */

d.o.library({
	name: "d.o build", 
	version: "0.3", 
	docs: "http://code.drostie.org/d.o/build",
	depends: [],
	fn: function (lib) {
		var regex = { first_alpha: /^[a-z]/i, equals_splitter: /\s+(?=[a-z]+=)/gi, property_parse: /^([^=]*)=(.*)/ };
		function build(template, maxdepth) { 
			maxdepth = maxdepth === undefined ? 100 : maxdepth; //may be omitted for a sane default.
			function error(s) {
				s = "build(): error " + s;
				for (var j = arguments.length - 1; i > 0; i -= 1) {
					s = s.replace("%" + i, "\u00ab" + arguments[i] + "\u00bb");
				}
				throw s;
			}
			function recurse(t) {
				return build(t, maxdepth - 1);
			}
			if (maxdepth < 0) {
				error("warning: too much recursion on template");
			}
			// HTMLNodes
			if (typeof(template.nodeName) === 'string') {
				return [template];
			}
			var node, array, subarray, i;
			
			// Arrays of templates
			if (template instanceof Array) {
				if (template.length === 0) {
					error("handling 0-length array on template: %1", template);
				}
				node = recurse(template[0])[0];
				array = [node];
				for (i = 1; i < template.length; i += 1) {
					subarray = recurse(template[i]);
					array = array.concat(subarray);
					node.appendChild(subarray[0]);
				}
				return array;
			}
			// Strings
			if (typeof template === 'string') {
				if (regex.first_alpha.test(template)) {
					array = template.split(regex.equals_splitter);
					try {
						node = document.createElement(array[0]);
					} catch (e1) {
						error("rendering node %1 on template: %2", array[0], template);
					}
					for (i = 1; i < array.length; i += 1) {
						subarray = array[i].match(regex.property_parse);
						if (subarray === null) {
							error("parsing property %1 on template: %2", array[i], template);
						}
						switch (subarray[1].toLowerCase()) {
							/* Exceptional properties */
						case "class":
						case "classname":
							node.className = subarray[2];
							break;
						default:
							try {
								node.setAttribute(subarray[1], subarray[2]);
							} catch (e2) {
								error("setting attribute of %1 to %2 on template: %3", subarray[1], subarray[2], template);
							}
						}
					}
					return [node];
				} else if (template.charAt(0) === "#") {
					return [document.getElementById(template.substring(1))];
				} else {
					return [document.createTextNode(template.substring(1))];
				}
			}
			error("recognizing template %1", template);
		};
		lib.build = build;
	}
});
