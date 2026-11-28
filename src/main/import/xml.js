'use strict';
// Reading XML from a file that came from anywhere, keeping the order of everything. A document type is cut out before parsing,
// so a file can't define words of its own that unfold into something huge; the named characters web pages use are put in by
// number instead.
const { XMLParser } = require('fast-xml-parser');

const NAMED = { nbsp: 160, mdash: 8212, ndash: 8211, hellip: 8230, lsquo: 8216, rsquo: 8217, ldquo: 8220, rdquo: 8221, laquo: 171, raquo: 187, copy: 169, reg: 174, trade: 8482, deg: 176, middot: 183, bull: 8226, eacute: 233, egrave: 232, ecirc: 234, agrave: 224, aacute: 225, acirc: 226, auml: 228, ouml: 246, uuml: 252, Auml: 196, Ouml: 214, Uuml: 220, szlig: 223, ccedil: 231, ntilde: 241, iacute: 237, oacute: 243, uacute: 250, iquest: 191, iexcl: 161, thinsp: 8201, ensp: 8194, emsp: 8195, shy: 173, times: 215, frac12: 189, sect: 167, dagger: 8224, Dagger: 8225, oelig: 339, OElig: 338, sbquo: 8218, bdquo: 8222, lsaquo: 8249, rsaquo: 8250, prime: 8242, Prime: 8243 };

const parser = new XMLParser({ preserveOrder: true, ignoreAttributes: false, attributeNamePrefix: '', trimValues: false, parseTagValue: false, parseAttributeValue: false, processEntities: true, htmlEntities: false });

function parseXml(text) {
  const clean = String(text)
    .replace(/^﻿/, '')
    .replace(/<!DOCTYPE(?:[^<>[]|\[[\s\S]*?\])*>/i, '')
    .replace(/&([A-Za-z][A-Za-z0-9]{1,10});/g, (all, name) => (NAMED[name] ? `&#${NAMED[name]};` : all))
    .replace(/&#(\d{1,7});|&#x([0-9a-fA-F]{1,6});/g, (all, decimal, hex) => {
      // Put in as the character itself, except the few that would be read as XML.
      const code = decimal ? Number(decimal) : parseInt(hex, 16);
      if ([38, 60, 62, 34, 39].includes(code)) return { 38: '&amp;', 60: '&lt;', 62: '&gt;', 34: '&quot;', 39: '&apos;' }[code];
      return code >= 9 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '';
    });
  return parser.parse(clean);
}

const tagOf = (node) => Object.keys(node).find((key) => key !== ':@');
// An element's name without its namespace prefix.
const nameOf = (node) => String(tagOf(node)).replace(/^[^:]+:/, '');
const isText = (node) => tagOf(node) === '#text';
const childrenOf = (node) => (isText(node) ? [] : node[tagOf(node)] ?? []);
const attributesOf = (node) => node[':@'] ?? {};

// Every element with a name, at any depth, in document order.
function all(nodes, name, found = [], depth = 0) {
  if (depth > 200) return found;
  for (const node of nodes) {
    if (isText(node)) continue;
    if (nameOf(node) === name) found.push(node);
    all(childrenOf(node), name, found, depth + 1);
  }
  return found;
}

const textIn = (node, depth = 0) => (isText(node) ? String(node['#text']) : depth > 200 ? '' : childrenOf(node).map((child) => textIn(child, depth + 1)).join(''));

module.exports = { all, attributesOf, childrenOf, isText, nameOf, parseXml, textIn };
