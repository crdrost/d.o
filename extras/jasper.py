# -*- coding: utf-8 -*-
# library: jasper.py

# d.o jasper Models, python port 
# v. 0.0 completed never
# docs @ http://code.drostie.org/library/jasper (eventually)
#
# This code was written by Chris Drost of drostie.org, and he hereby dedicates 
# it into the public domain: it has no copyright. It is provided "as-is", with 
# NO WARRANTIES OF ANY KIND. 
#
# I do humbly request that you provide me some sort of credit if you use my 
# code; but by making it public domain, I leave that decision up to you. 

from math import isnan, isinf
import re

js_version = "0.4" # the d.o jasper version string that this is synced to.

class __OutputObject:
	def __init__(self, v, s, p):
		self._dict = {'value': v, 'schema': s, 'path': p}
		self.sanitized = None
		self.errors = []
		self.warnings = []
	def err(self, msg):
		self.errors.append(self._dict.copy().update({'message': msg}))
	def warn(self, msg):
		self.errors.append(self._dict.copy().update({'message': msg}))
	def merge_errors(self, other):
		self.errors.extend(other.errors)
		self.warnings.extend(other.warnings)
	def proxy(self, other):
		self.sanitized = other.sanitized
		self.errors = other.errors
		self.warnings = other.warnings

class __Context:
	def __init__(self, obj, opts):
		self.obj = obj
		self.opts = opts

# 
_regex_parse = re.compile(r'^/(.*)/(i?m?|mi)$')
_regex_flags = {
	'i': re.I, 'm': re.M, 'im': re.I | re.M, 'mi': re.I | re.M
}
typeof = lambda s: type(s).__name__
_inf = float("Infinity")

def dictify(array):
	out = {}
	for i in range(len(array)):
		out[str(i)] = array[i]
	return out

# The basic validation functions for the primitives are defined here.
# They all take a basic set of parameters: 
#     v: the value in the input object
#     o: an output object
#     m: the metadata object from the schema
#     r: a recurse function, to validate any children
#     c: the context of the function -- called opts and the overall object.

# We create a primitives registry with an accompanying decorator.
primitives = {}
def primitive(fn):
	primitives[fn.__name__[1:]] = fn
	return fn

@primitive
def _freeform(v, o, m, r, c):
	o.sanitized = v;

@primitive
def _regex(v, o, m, r, c):
	if typeof(v) == 'SRE_Pattern':
		o.sanitized = v;
	elif typeof(v) == 'str':
		try: 
			match = _regex_parse.search(v)
			flags = _regex_flags.get(match.group(2), 0)
			o.sanitized = re.compile(match.group(1), flags)
		except re.error:
			o.err('invalid regular expression')
			return
	else:
		o.err('unable to coerce')
		return
	if c.opts.get('regex_as_string', False):
		flags = ''
		if o.sanitized.flags & re.I:
			flags += 'i'
		if o.sanitized.flags & re.M:
			flags += 'm'
		o.sanitized = '/' + o.sanitized.pattern + '/' + flags

# for consistency with jasper 0.4, we only cast "true", not "True"
@primitive
def _boolean(v, o, m, r, c): 
	if typeof(v) == 'bool':
		o.sanitized = v
	else: 
		v = str(v)
		if v in ['true', 'false']:
			o.sanitized = (v == 'true')
			o.warn('type coercion')
		else: 
			o.err('unable to coerce')

@primitive
def _number(v, o, m, r, c): 
	if typeof(v) not in ['int', 'float']:
		o.warn('type coercion')
	try: 
		v = float(v)
		if isnan(v) or isinf(v):
			v = None
	except ValueError:
		v = None
		
	if v == None:
		o.err('unable to coerce')
	else: 
		if m.get('integer', False) and int(v) == v:
			o.err('not an integer')
		if m.get('max', _inf) < v:
			o.err('maximum violated')
		if m.get('min', -_inf) > v:
			o.err('minimum violated')
		
		o.sanitized = v;

@primitive
def _string(v, o, m, r, c):
	t = typeof(v)
	if t == 'str':
		pass
	elif t in ['int', 'float', 'boolean']:
		o.warn('type coercion')
		v = str(v).lower()
	else:
		o.err('unable to coerce')
		return
	
	if m.get('max_length', _inf) < len(v):
		o.err('max length violated')
	if m.get('min_length', -_inf) > len(v):
		o.err('min length violated')
	if m.get('root_index', False) and v not in c.obj:
		o.err('not a valid key into the root index')
	regex = m.get('regex', None)
	if regex and not regex.search(v):
		o.err('regex violated')
	if m.get('confidential', False) and c.opts.get('hide_confidential', False):
		v = "(confidential)"
	
	o.sanitized = v

@primitive
def _index(v, o, m, r, c):
	sanitized = {}
	subschema = m.get('elements', 'object')
	regex = m.get('valid_keys', None)
	t = typeof(v)
	if t == 'dict':
		pass
	elif t == 'list':
		if len(v) > 0:
			o.warn('type coercion')
		v = dictify(v)
	else:
		o.err('unable to coerce')
		return
	
	for key in v:
		output = r(v[key], subschema, key)
		sanitized[key] = output.sanitized
		if regex and not regex.search(key):
			o.err('invalid key: ' + key)
		o.merge_errors(output)
	o.sanitized = sanitized

@primitive
def _list(v, o, m, r, c):
	sanitized = []
	subschema = m.get('elements', 'object')
	if typeof(v) == 'list':
		for i in range(len(v)):
			output = r(v[i], subschema, i)
			sanitized.append(output.sanitized)
			o.merge_errors(output)
		o.sanitized = sanitized
	else:
		o.err('unable to coerce')

@primitive
def _multi(v, o, m, r, c):
	subschemas = m.get('allowed', [])
	attempts = []
	# we create a default error. The only way out will be o.proxy().
	o.err('no options matched')
	
	for i in range(len(subschemas)):
		output = r(v, subschemas[i], '(multi: ' + str(i) + ')')
		attempts.append(output)
		o.merge_errors(output)
	
	attempts.sort(key=lambda a: (len(a.errors), len(a.warnings)))
	
	if len(attempts) > 0:
		if len(attempts[0].errors) == 0:
			o.proxy(attempts[0])

@primitive
def _enum(v, o, m, r, c):
	value = m.get('value_field', 'value')
	meta = m.get('meta_field', 'meta')
	opts = m.get('options', {})
	subtype = 'object' if m.get('strict', True) else 'args'
	t = typeof(v)
	if t == 'dict':
		pass
	elif t == 'list':
		v = dictify(v)
	else:
		o.err('unable to coerce')
		return
	
	if value not in v:
		o.err('unable to coerce')
	elif v[value] not in opts:
		o.err('value not allowed by enum: ' + v[value])
	else:
		subschema = {'type': subtype, 'meta': {'fields': opts[v[value]]}}
		output = r(v.get(meta, {}), subschema, meta)
		o.merge_errors(output)
		o.sanitized = {value: v[value], meta: output.sanitized} 
		# note: this key ^ is not necessarily "value".

@primitive
def _args(v, o, m, r, c):
	fields = m.get('fields', {})
	o.sanitized = {}
	t = typeof(v)
	if t == 'list':
		v = dictify(v)
	elif t != 'dict':
		o.err('unable to coerce')
		return
	
	for k in v:
		if k not in fields:
			o.warn('extra key not in schema: ' + k)
		else: 
			output = r(v[k], fields[k], k)
			o.merge_errors(output)
			o.sanitized[k] = output.sanitized

@primitive
def _object(v, o, m, r, c):
	fields = m.get('fields', {})
	#first, validate as an `args` type
	_args(v, o, m, r, c)
	#then, check that all keys are accounted for:
	if typeof(o.sanitized) == 'dict':
		for k in fields:
			if k not in o.sanitized:
				o.err('missing field: ' + k)

def validation(obj, model, root_schema, opts=None):
	if typeof(opts) != 'dict':
		opts = {}
	context = __Context(obj, opts)
	
	def subvalidate(value, schema, path):
		# convert schema to {type, meta} form:
		if typeof(schema) == 'str':
			schema = model.get(schema, {'type': schema, 'meta': {}})
		try:
			value = value.jasper();
		except AttributeError:
			pass
		out = __OutputObject(value, schema, path)
		def recurse(v, s, name):
			subpath = path[:]
			subpath.append(name)
			return subvalidate(v, s, subpath)
		
		t = schema['type']
		if t in primitives:
			primitives[t](value, out, schema['meta'], recurse, context)
		else: 
			out.err("schema type not recognized: " + t)
		
		return out
	
	obj = subvalidate(obj, model[root_schema], [])
	
	if len(obj.errors) > 0:
		return {'status': 'errors', 'meta': {'list': obj.errors}};
	else:
		return {
			'status': 'ok', 
			'meta': {'sanitized': obj.sanitized, 'warnings': obj.warnings}
		}

__not_type = re.compile("^((?!type).+|type.+)$")
__primitives = re.compile("^(" + "|".join(primitives.keys()) + ")$")

metamodel = {
	"model": {"type": "index", "meta": {
		"elements": "schema",
		"valid_keys": __not_type
	}},
	"primitive string": {"type": "string", "meta": {
		"regex": __primitives
	}}, 
	"composite schema": {"type": "multi", "meta": {
		"allowed": [
			"schema", 
			"primitive string",
			{"type": "string", "meta": {"root_index": True}}
		]
	}},
	"natural number": {"type": "number", "meta": {"integer": True, "min": 0}},
	"object fields": {"type": "index", "meta": {"elements": "composite schema"}},
	"schema": {"type": "enum", "meta": {
		"value_field": "type",
		"meta_field": "meta",
		"strict": False,
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
}

class Model:
	def __init__(self, model_spec, base_opts=None):
		self.base_opts = base_opts if typeof(base_opts) == 'dict' else {}
		model = validation(model_spec, metamodel, "model")
		if model['status'] == "errors" or len(model['meta']['warnings']) > 0:
			raise ValueError("Invalid jasper model. Please revalidate it.")
		
		self.model = model['meta']['sanitized']
	
	def validate(self, obj, model_name, opts={}):
		model_name = str(model_name)
		subopts = self.base_opts.copy().update(opts)
		if model_name not in self.model:
			raise ValueError("Unrecognized model name: " + model_name)
		else:
			return validation(obj, self.model, model_name, subopts)