const format = require('util').format;

/*
 * The following code has been adapted from rustdoc.
 */

// Copyright 2014 The Rust Project Developers. See the COPYRIGHT
// file at the top-level directory of this distribution and at
// http://rust-lang.org/COPYRIGHT.
//
// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

/*jslint browser: true, es5: true */
/*globals $: true, rootPath: true */

const rootPath = 'https://doc.rust-lang.org/stable/';

// This mapping table should match the discriminants of
// `rustdoc::html::item_type::ItemType` type in Rust.
var itemTypes = [
  "mod",
  "externcrate",
  "import",
  "struct",
  "enum",
  "fn",
  "type",
  "static",
  "trait",
  "impl",
  "tymethod",
  "method",
  "structfield",
  "variant",
  "macro",
  "primitive",
  "associatedtype",
  "constant"
];

/**
 * A function to compute the Levenshtein distance between two strings
 * Licensed under the Creative Commons Attribution-ShareAlike 3.0 Unported
 * Full License can be found at http://creativecommons.org/licenses/by-sa/3.0/legalcode
 * This code is an unmodified version of the code written by Marco de Wit
 * and was found at http://stackoverflow.com/a/18514751/745719
 */
var levenshtein = (function() {
  var row2 = [];
  return function(s1, s2) {
    if (s1 === s2) {
      return 0;
    } else {
      var s1_len = s1.length,
        s2_len = s2.length;
      if (s1_len && s2_len) {
        var i1 = 0,
          i2 = 0,
          a, b, c, c2, row = row2;
        while (i1 < s1_len)
          row[i1] = ++i1;
        while (i2 < s2_len) {
          c2 = s2.charCodeAt(i2);
          a = i2;
          ++i2;
          b = i2;
          for (i1 = 0; i1 < s1_len; ++i1) {
            c = a + (s1.charCodeAt(i1) !== c2 ? 1 : 0);
            a = row[i1];
            b = b < a ? (b < c ? b + 1 : c) : (a < c ? a + 1 : c);
            row[i1] = b;
          }
        }
        return b;
      } else {
        return s1_len + s2_len;
      }
    }
  };
})();

function initSearch(rawSearchIndex) {
  var currentResults, index, searchIndex;
  var MAX_LEV_DISTANCE = 3;

  /**
   * Executes the query and builds an index of results
   * @param  {[Object]} query     [The user query]
   * @param  {[type]} max         [The maximum results returned]
   * @param  {[type]} searchWords [The list of search words to query
   *                               against]
   * @return {[type]}             [A search index of results]
   */
  function execQuery(query, max, searchWords) {
    var valLower = query.query.toLowerCase(),
      val = valLower,
      typeFilter = itemTypeFromName(query.type),
      results = [],
      split = valLower.split("::");

    //remove empty keywords
    for (var j = 0; j < split.length; ++j) {
      split[j].toLowerCase();
      if (split[j] === "") {
        split.splice(j, 1);
      }
    }

    // quoted values mean literal search
    var nSearchWords = searchWords.length;
    if ((val.charAt(0) === "\"" || val.charAt(0) === "'") &&
      val.charAt(val.length - 1) === val.charAt(0)) {
      val = val.substr(1, val.length - 2);
      for (var i = 0; i < nSearchWords; ++i) {
        if (searchWords[i] === val) {
          // filter type: ... queries
          if (typeFilter < 0 || typeFilter === searchIndex[i].ty) {
            results.push({
              id: i,
              index: -1
            });
          }
        }
        if (results.length === max) {
          break;
        }
      }
      // searching by type
    } else if (val.search("->") > -1) {
      var trimmer = function(s) {
        return s.trim();
      };
      var parts = val.split("->").map(trimmer);
      var input = parts[0];
      // sort inputs so that order does not matter
      var inputs = input.split(",").map(trimmer).sort();
      var output = parts[1];

      for (var i = 0; i < nSearchWords; ++i) {
        var type = searchIndex[i].type;
        if (!type) {
          continue;
        }

        // sort index inputs so that order does not matter
        var typeInputs = type.inputs.map(function(input) {
          return input.name;
        }).sort();

        // allow searching for void (no output) functions as well
        var typeOutput = type.output ? type.output.name : "";
        if (inputs.toString() === typeInputs.toString() &&
          output == typeOutput) {
          results.push({
            id: i,
            index: -1,
            dontValidate: true
          });
        }
      }
    } else {
      // gather matching search results up to a certain maximum
      val = val.replace(/\_/g, "");
      for (var i = 0; i < split.length; ++i) {
        for (var j = 0; j < nSearchWords; ++j) {
          var lev_distance;
          if (searchWords[j].indexOf(split[i]) > -1 ||
            searchWords[j].indexOf(val) > -1 ||
            searchWords[j].replace(/_/g, "").indexOf(val) > -1) {
            // filter type: ... queries
            if (typeFilter < 0 || typeFilter === searchIndex[j].ty) {
              results.push({
                id: j,
                index: searchWords[j].replace(/_/g, "").indexOf(val),
                lev: 0,
              });
            }
          } else if (
            (lev_distance = levenshtein(searchWords[j], val)) <=
            MAX_LEV_DISTANCE) {
            if (typeFilter < 0 || typeFilter === searchIndex[j].ty) {
              results.push({
                id: j,
                index: 0,
                // we want lev results to go lower than others
                lev: lev_distance,
              });
            }
          }
          if (results.length === max) {
            break;
          }
        }
      }
    }

    var nresults = results.length;
    for (var i = 0; i < nresults; ++i) {
      results[i].word = searchWords[results[i].id];
      results[i].item = searchIndex[results[i].id] || {};
    }
    // if there are no results then return to default and fail
    if (results.length === 0) {
      return [];
    }

    results.sort(function(aaa, bbb) {
      var a, b;

      // Sort by non levenshtein results and then levenshtein results by the distance
      // (less changes required to match means higher rankings)
      a = (aaa.lev);
      b = (bbb.lev);
      if (a !== b) return a - b;

      // sort by exact match (mismatch goes later)
      a = (aaa.word !== valLower);
      b = (bbb.word !== valLower);
      if (a !== b) return a - b;

      // sort by item name length (longer goes later)
      a = aaa.word.length;
      b = bbb.word.length;
      if (a !== b) return a - b;

      // sort by item name (lexicographically larger goes later)
      a = aaa.word;
      b = bbb.word;
      if (a !== b) return (a > b ? +1 : -1);

      // sort by index of keyword in item name (no literal occurrence goes later)
      a = (aaa.index < 0);
      b = (bbb.index < 0);
      if (a !== b) return a - b;
      // (later literal occurrence, if any, goes later)
      a = aaa.index;
      b = bbb.index;
      if (a !== b) return a - b;

      // sort by description (no description goes later)
      a = (aaa.item.desc === '');
      b = (bbb.item.desc === '');
      if (a !== b) return a - b;

      // sort by type (later occurrence in `itemTypes` goes later)
      a = aaa.item.ty;
      b = bbb.item.ty;
      if (a !== b) return a - b;

      // sort by path (lexicographically larger goes later)
      a = aaa.item.path;
      b = bbb.item.path;
      if (a !== b) return (a > b ? +1 : -1);

      // que sera, sera
      return 0;
    });

    // remove duplicates, according to the data provided
    for (var i = results.length - 1; i > 0; i -= 1) {
      if (results[i].word === results[i - 1].word &&
        results[i].item.ty === results[i - 1].item.ty &&
        results[i].item.path === results[i - 1].item.path &&
        (results[i].item.parent || {}).name === (results[i - 1].item.parent || {}).name) {
        results[i].id = -1;
      }
    }
    for (var i = 0; i < results.length; ++i) {
      var result = results[i],
        name = result.item.name.toLowerCase(),
        path = result.item.path.toLowerCase(),
        parent = result.item.parent;

      // this validation does not make sense when searching by types
      if (result.dontValidate) {
        continue;
      }

      var valid = validateResult(name, path, split, parent);
      if (!valid) {
        result.id = -1;
      }
    }
    return results;
  }

  /**
   * Validate performs the following boolean logic. For example:
   * "File::open" will give IF A PARENT EXISTS => ("file" && "open")
   * exists in (name || path || parent) OR => ("file" && "open") exists in
   * (name || path )
   *
   * This could be written functionally, but I wanted to minimise
   * functions on stack.
   *
   * @param  {[string]} name   [The name of the result]
   * @param  {[string]} path   [The path of the result]
   * @param  {[string]} keys   [The keys to be used (["file", "open"])]
   * @param  {[object]} parent [The parent of the result]
   * @return {[boolean]}       [Whether the result is valid or not]
   */
  function validateResult(name, path, keys, parent) {
    for (var i = 0; i < keys.length; ++i) {
      // each check is for validation so we negate the conditions and invalidate
      if (!(
          // check for an exact name match
          name.toLowerCase().indexOf(keys[i]) > -1 ||
          // then an exact path match
          path.toLowerCase().indexOf(keys[i]) > -1 ||
          // next if there is a parent, check for exact parent match
          (parent !== undefined &&
            parent.name.toLowerCase().indexOf(keys[i]) > -1) ||
          // lastly check to see if the name was a levenshtein match
          levenshtein(name.toLowerCase(), keys[i]) <=
          MAX_LEV_DISTANCE)) {
        return false;
      }
    }
    return true;
  }

  function getQuery(raw) {
    var matches, type, query;
    query = raw;

    matches = query.match(/^(fn|mod|struct|enum|trait|t(ype)?d(ef)?):?\s+/i);
    if (matches) {
      type = matches[1].replace(/^td$/, 'typedef')
                       .replace(/^tdef$/, 'typedef')
                       .replace(/^typed$/, 'typedef');
      query = query.substring(matches[0].length);
    }

    return {
      raw: raw,
      query: query,
      type: type,
      id: query + type,
    };
  }

  function search(raw, maxResults) {
    var query,
      filterdata = [],
      obj, i, len,
      results = [],
      //maxResults = 200,
      resultIndex;

    query = getQuery(raw);

    if (!query.query) {
      return [];
    }

    resultIndex = execQuery(query, 20000, index);
    len = resultIndex.length;
    for (i = 0; i < len; ++i) {
      if (resultIndex[i].id > -1) {
        obj = searchIndex[resultIndex[i].id];
        filterdata.push([obj.name, obj.ty, obj.path, obj.desc]);
        results.push(obj);
      }
      if (results.length >= maxResults) {
        break;
      }
    }

    return prepare_results(results, maxResults);
  }

  function itemTypeFromName(typename) {
    for (var i = 0; i < itemTypes.length; ++i) {
      if (itemTypes[i] === typename) return i;
    }
    return -1;
  }

  function buildIndex(rawSearchIndex) {
    searchIndex = [];
    var searchWords = [];
    for (var crate in rawSearchIndex) {
      if (!rawSearchIndex.hasOwnProperty(crate)) {
        continue
      }

      // an array of [(Number) item type,
      //              (String) name,
      //              (String) full path or empty string for previous path,
      //              (String) description,
      //              (Number | null) the parent path index to `paths`]
      //              (Object | null) the type of the function (if any)
      var items = rawSearchIndex[crate].items;
      // an array of [(Number) item type,
      //              (String) name]
      var paths = rawSearchIndex[crate].paths;

      // convert `paths` into an object form
      var len = paths.length;
      for (var i = 0; i < len; ++i) {
        paths[i] = {
          ty: paths[i][0],
          name: paths[i][1]
        };
      }

      // convert `items` into an object form, and construct word indices.
      //
      // before any analysis is performed lets gather the search terms to
      // search against apart from the rest of the data.  This is a quick
      // operation that is cached for the life of the page state so that
      // all other search operations have access to this cached data for
      // faster analysis operations
      var len = items.length;
      var lastPath = "";
      for (var i = 0; i < len; ++i) {
        var rawRow = items[i];
        var row = {
          crate: crate,
          ty: rawRow[0],
          name: rawRow[1],
          path: rawRow[2] || lastPath,
          desc: rawRow[3],
          parent: paths[rawRow[4]],
          type: rawRow[5]
        };
        searchIndex.push(row);
        if (typeof row.name === "string") {
          var word = row.name.toLowerCase();
          searchWords.push(word);
        } else {
          searchWords.push("");
        }
        lastPath = row.path;
      }
    }
    return searchWords;
  }

  function prepare_results(results, max_count) {
    if (results.length > 0) {
      var prepped = [];
      var i = 0;

      for (; i < Math.min(results.length, max_count); i++) {
        var item = results[i];
        var type = itemTypes[item.ty];
        var name = item.name;

        var href, displayPath;

        if (type === 'mod') {
          displayPath = item.path + '::';
          href = rootPath + item.path.replace(/::/g, '/') + '/' +
                 name + '/index.html';
        } else if (type === 'static' || type === 'rexport') {
          displayPath = item.path + '::';
          url = rootPath + item.path.replace(/::/g, '/') +
                '/index.html';
        } else if (item.parent !== undefined) {
          var myparent = item.parent;
          var anchor = '#' + type + '.' + name;
          displayPath = item.path + '::' + myparent.name + '::';
          href = rootPath + item.path.replace(/::/g, '/') +
                 '/' + itemTypes[myparent.ty] +
                 '.' + myparent.name +
                 '.html' + anchor;
        } else {
          displayPath = item.path + '::';
          href = rootPath + item.path.replace(/::/g, '/') +
                 '/' + type + '.' + name + '.html';
        }

        prepped.push({
          display: displayPath + name,
          url: href
        });
      }

      return prepped;
    } else {
      return [];
    }
  }

  index = buildIndex(rawSearchIndex);

  return search;
}

// ------------

  module.exports = initSearch;

