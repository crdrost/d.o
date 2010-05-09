/* d.o library.js
 * v. 0.2 released 2010-05-09
 * docs @ http://code.drostie.org/library
 * 
 * This code was written by Chris Drost of drostie.org, and he hereby dedicates 
 * it into the public domain: it has no copyright. It is provided "as-is", with 
 * NO WARRANTIES OF ANY KIND. 
 * 
 * I do humbly request that you provide me some sort of credit if you use my 
 * code; but by making it public domain, I leave that decision up to you. 
 */

/*
general idea:
d.o.library.paths = {
	build: "https://static.drostie.org/d.o/build.js",
	jasper: "https://static.drostie.org/d.o/jasper.js",
	json: "https://static.drostie.org/d.o/json.js",
};
d.o.library({
	require: ["build", "jasper", "json"], 
	callback: function () {  
		alert("build, jasper, and json are all loaded.");
	}
});
d.o.library({
	name: "build",
	version: "2.3",
	docs: "https://code.drostie.org/d.o/build,
	fn: function () { ... }
});
*/

// since this initializes the global element `d`, this document should not 
// appeal to "use strict".
/*jslint strict: false */
/*global d: true, document */

(function () {
	var load_events, request, register, library, config;
	
	config = {
		name: "d.o library", 
		version: "0.2", 
		docs: "http://code.drostie.org/d.o/library",
		depends: []
	};
	
	//initialize the d.o library.
	if (typeof d !== 'undefined') {
		d = {o: {}, old: d};
	} else {
		d = {o: {}};
	}
	
	function arr(u) {
		switch (typeof u) {
		case 'undefined':
			return [];
		case 'object':
			return Array.prototype.slice.call(u, 0);
		default:
			return [u];
		}
	}
	library = function (config) {
		var e;
		//this is the dispatcher for the more specific library methods.
		if (typeof config.name === 'string') {
			register(config);
		} else {
			if (config.require) {
				request(config);
			} else {
				e = Error("Unsupported config object for d.o.library()");
				e.name = "ValueError";
				e.config_object = config;
				throw e;
			}
		}
	};
	library.paths = {};
	library.loaded = {};
	library.requested = {"d.o library": true};
	
	d.o.library = library;
	
	load_events = [];
	function fire_events() {
		var i, event, repeat;
		// an event in load_events might initialize a required library for a
		// different event, thus we loop through the list until a pass through
		// doesn't do any actual work.
		do {
			repeat = false;
			for (i = 0; i < load_events.length; i += 1) {
				if (load_events[i].predicate()) {
					//remove it and call its callback function.
					event = load_events.splice(i, 1)[0].callback;
					event();
					repeat = true;
					i -= 1;
				}
			}
		} while (repeat);
	}
	
	/* The request service downloads compatible libraries registered in 
	 * d.o.library.paths by appending script elements into the document body.
	 * The service adds an appropriate entry into the load_events queue, to run
	 * a callback function whenever the requested scripts are all finished with
	 * loading, and it fires any events in the load_events queue that are ready
	 * to fire. The library should declare that it has loaded with the 
	 * register service to be fully compatible.
	 */
	request = function (config) {
		var required, i, lib, tag;
		required = arr(config.require);
		if (typeof config.callback === 'function') {
			load_events.push({
				predicate: function () {
					var j;
					for (j = 0; j < required.length; j += 1) {
						if (! library.loaded[required[j]]) {
							return false;
						}
					}
					return true;
				}, 
				callback: config.callback
			});
		}
		for (i = 0; i < required.length; i += 1) {
			lib = required[i];
			if (typeof library.paths[lib] !== 'string') {
				tag = Error("No such library found in d.o.library.paths: " + lib);
				tag.name = "ValueError";
				throw tag;
			} else {
				if (! library.requested[lib]) {
					library.requested[lib] = true;
					tag = document.createElement("script");
					tag.setAttribute("src", library.paths[lib]);
					document.body.appendChild(tag);
				}
			}
		}
		fire_events();
	};
	
	/* The register service is called by . files, and it declares to the
	 * library that the file has been loaded and is more-or-less ready to be
	 * executed. It might still have dependencies which are not yet loaded, and
	 * which must be imported. A call to request() with an appropriate callback
	 * fulfills both needs.
	 */
	register = function (config) {
		var name = config.name, f = config.fn;
		delete config.fn;
		delete config.name;
		request({
			require: arr(config.depends),
			callback: function () {
				if (! library.loaded[name]) {
					if (f) {
						f(d.o);
					}
					library.loaded[name] = config;
				}
			}
		});
	};
	d.o.library.loaded['d.o library'] = config;
}());